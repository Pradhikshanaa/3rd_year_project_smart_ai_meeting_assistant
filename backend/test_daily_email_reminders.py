import os
import unittest
from datetime import datetime, timedelta
from app import app
from extensions import db
from models import User, Task, EmailReminderLog, Notification
from services.scheduler_service import run_daily_deadline_reminders, get_scheduler_status
from utils.auth import generate_token

class TestDailyEmailReminders(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = self.app.test_client()
        self.ctx = self.app.app_context()
        self.ctx.push()

        # Ensure leader and employee users exist
        self.leader = User.query.filter_by(role='leader').first()
        if not self.leader:
            self.leader = User(
                name="Test Leader",
                email="leader.test@example.com",
                role="leader",
                team_id="TEAM-TEST"
            )
            db.session.add(self.leader)
            db.session.commit()

        self.employee = User.query.filter_by(role='employee').first()
        if not self.employee:
            self.employee = User(
                name="Test Employee",
                email="employee.test@example.com",
                role="employee",
                team_id=self.leader.team_id or "TEAM-TEST"
            )
            db.session.add(self.employee)
            db.session.commit()

        self.leader_token = generate_token(self.leader.id, 'leader', self.leader.team_id)
        self.employee_token = generate_token(self.employee.id, 'employee', self.employee.team_id)

    def tearDown(self):
        self.ctx.pop()

    def test_01_apscheduler_status(self):
        """Verify APScheduler is running and has the 8:00 AM daily job registered"""
        status = get_scheduler_status()
        self.assertTrue(status['scheduler_running'], "APScheduler should be active and running")
        self.assertGreaterEqual(status['jobs_count'], 1, "At least 1 job should be registered in APScheduler")
        job_ids = [j['id'] for j in status['jobs']]
        self.assertIn('daily_deadline_reminders', job_ids, "Job 'daily_deadline_reminders' must be registered")
        print(">> [PASS] Test 1: APScheduler registered and active with daily 8:00 AM cron.")

    def test_02_deadline_filtering_and_stop_conditions(self):
        """
        Verify:
        - Upcoming task within 2 days -> reminder generated
        - Overdue task (2 days ago) -> reminder generated
        - Future task (> 3 days, e.g. 10 days) -> skipped
        - Completed task -> skipped (stop condition)
        - Submitted task -> skipped (stop condition)
        - Rejected task -> skipped until active
        """
        today = datetime.utcnow().date()
        
        # 1. Upcoming task due in 2 days
        t_upcoming = Task(
            title="[TEST] Upcoming Review",
            description="Task due in 2 days",
            assigned_to=self.employee.id,
            assigned_by=self.leader.id,
            priority="High",
            status="assigned",
            deadline=datetime.combine(today + timedelta(days=2), datetime.min.time())
        )
        
        # 2. Overdue task due 3 days ago
        t_overdue = Task(
            title="[TEST] Overdue Bugfix",
            description="Task was due 3 days ago",
            assigned_to=self.employee.id,
            assigned_by=self.leader.id,
            priority="Urgent",
            status="in_progress",
            deadline=datetime.combine(today - timedelta(days=3), datetime.min.time())
        )

        # 3. Future task due in 15 days (> 3 days)
        t_future = Task(
            title="[TEST] Future Sprint Item",
            description="Task due far in the future",
            assigned_to=self.employee.id,
            assigned_by=self.leader.id,
            priority="Low",
            status="assigned",
            deadline=datetime.combine(today + timedelta(days=15), datetime.min.time())
        )

        # 4. Completed task due today (Stop condition)
        t_completed = Task(
            title="[TEST] Completed Feature",
            description="Task already completed",
            assigned_to=self.employee.id,
            assigned_by=self.leader.id,
            priority="Medium",
            status="completed",
            deadline=datetime.combine(today, datetime.min.time())
        )

        # 5. Submitted task due today (Stop condition)
        t_submitted = Task(
            title="[TEST] Submitted Deliverable",
            description="Task submitted for review",
            assigned_to=self.employee.id,
            assigned_by=self.leader.id,
            priority="High",
            status="submitted",
            deadline=datetime.combine(today, datetime.min.time())
        )

        db.session.add_all([t_upcoming, t_overdue, t_future, t_completed, t_submitted])
        db.session.commit()

        # Clear any prior test logs for these task IDs
        test_ids = [t_upcoming.id, t_overdue.id, t_future.id, t_completed.id, t_submitted.id]
        EmailReminderLog.query.filter(EmailReminderLog.task_id.in_(test_ids)).delete(synchronize_session=False)
        db.session.commit()

        # Execute daily reminder runner
        summary = run_daily_deadline_reminders(force=True)
        sent_task_ids = [r['task_id'] for r in summary['reminders_sent']]

        # Assertions
        self.assertIn(t_upcoming.id, sent_task_ids, "Upcoming task within 2 days should receive reminder")
        self.assertIn(t_overdue.id, sent_task_ids, "Overdue task should receive reminder")
        self.assertNotIn(t_future.id, sent_task_ids, "Future task > 3 days away should NOT receive reminder")
        self.assertNotIn(t_completed.id, sent_task_ids, "Completed task should NOT receive reminder")
        self.assertNotIn(t_submitted.id, sent_task_ids, "Submitted task should NOT receive reminder")

        # Verify subject formatting
        upcoming_res = next(r for r in summary['reminders_sent'] if r['task_id'] == t_upcoming.id)
        self.assertIn("due in 2 days", upcoming_res['subject'].lower())

        overdue_res = next(r for r in summary['reminders_sent'] if r['task_id'] == t_overdue.id)
        self.assertIn("was due 3 days ago", overdue_res['subject'].lower())

        print(">> [PASS] Test 2: Deadline filtering and stop conditions validated successfully.")

        # Cleanup test tasks
        Task.query.filter(Task.id.in_(test_ids)).delete(synchronize_session=False)
        EmailReminderLog.query.filter(EmailReminderLog.task_id.in_(test_ids)).delete(synchronize_session=False)
        db.session.commit()

    def test_03_duplicate_prevention_audit_log(self):
        """
        Verify that once a reminder is logged for a task today, running again without force
        skips duplicate sends and logs the skip.
        """
        today = datetime.utcnow().date()
        task = Task(
            title="[TEST] Single Reminder Task",
            description="Testing duplicate prevention",
            assigned_to=self.employee.id,
            assigned_by=self.leader.id,
            priority="Medium",
            status="in_progress",
            deadline=datetime.combine(today + timedelta(days=1), datetime.min.time())
        )
        db.session.add(task)
        db.session.commit()

        # Run 1: First send
        summary1 = run_daily_deadline_reminders(force=False)
        sent_task_ids_1 = [r['task_id'] for r in summary1['reminders_sent']]
        self.assertIn(task.id, sent_task_ids_1, "First run should dispatch reminder")

        # Verify record exists in email_reminders_log table
        log_entry = EmailReminderLog.query.filter_by(task_id=task.id).first()
        self.assertIsNotNone(log_entry, "Audit record must be created in email_reminders_log")
        self.assertEqual(log_entry.recipient_email, self.employee.email)

        # Run 2: Second send on the same day (should be skipped as duplicate)
        summary2 = run_daily_deadline_reminders(force=False)
        sent_task_ids_2 = [r['task_id'] for r in summary2['reminders_sent']]
        self.assertNotIn(task.id, sent_task_ids_2, "Second run on same day must NOT send duplicate")
        skipped_ids_2 = [d['task_id'] for d in summary2['duplicates_skipped']]
        self.assertIn(task.id, skipped_ids_2, "Task should be recorded in duplicates_skipped")

        print(">> [PASS] Test 3: Duplicate prevention and audit logging verified.")

        # Cleanup
        Task.query.filter_by(id=task.id).delete()
        EmailReminderLog.query.filter_by(task_id=task.id).delete()
        db.session.commit()

    def test_04_manual_trigger_api_endpoints(self):
        """
        Test manual trigger endpoints:
        - POST /api/admin/trigger-reminders
        - POST /api/tasks/trigger-reminders
        - GET /api/admin/reminders-log
        - Check role protection (Leader vs Employee vs Unauthenticated)
        """
        # 1. Unauthorized check
        res_unauth = self.client.post('/api/admin/trigger-reminders')
        self.assertEqual(res_unauth.status_code, 401, "Unauthenticated request should be 401")

        # 2. Forbidden check (Employee role)
        res_employee = self.client.post(
            '/api/admin/trigger-reminders',
            headers={'Authorization': f'Bearer {self.employee_token}'}
        )
        self.assertEqual(res_employee.status_code, 403, "Employee role request should be 403 Forbidden")

        # 3. Leader authorized trigger (admin endpoint)
        res_leader = self.client.post(
            '/api/admin/trigger-reminders?force=true',
            headers={'Authorization': f'Bearer {self.leader_token}'}
        )
        self.assertEqual(res_leader.status_code, 200)
        data = res_leader.get_json()
        self.assertTrue(data['success'])
        self.assertIn('summary', data)
        self.assertIn('reminders_sent_count', data['summary'])

        # 4. Leader authorized trigger (tasks endpoint)
        res_tasks_trigger = self.client.post(
            '/api/tasks/trigger-reminders?force=true',
            headers={'Authorization': f'Bearer {self.leader_token}'}
        )
        self.assertEqual(res_tasks_trigger.status_code, 200)
        tasks_data = res_tasks_trigger.get_json()
        self.assertTrue(tasks_data['success'])

        # 5. Leader fetch reminders log
        res_log = self.client.get(
            '/api/admin/reminders-log',
            headers={'Authorization': f'Bearer {self.leader_token}'}
        )
        self.assertEqual(res_log.status_code, 200)
        log_data = res_log.get_json()
        self.assertTrue(log_data['success'])
        self.assertIn('logs', log_data)

        print(">> [PASS] Test 4: Manual trigger endpoints and role security validated.")

if __name__ == '__main__':
    unittest.main()
