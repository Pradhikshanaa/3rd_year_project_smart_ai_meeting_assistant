import os
from datetime import datetime, date, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from extensions import db
from models import Task, User, Notification, EmailReminderLog
from services.email_service import send_task_deadline_reminder

# Global BackgroundScheduler instance
scheduler = BackgroundScheduler(daemon=True)
_scheduler_initialized = False

def run_daily_deadline_reminders(app=None, force=False):
    """
    Core business logic for daily task deadline reminders via APScheduler & Manual Trigger.
    
    Filters tasks where:
      1. status is 'Assigned' or 'In Progress' / 'pending'
         (STOPS for 'Submitted', 'Under Review', 'Completed', 'Rejected')
      2. days_until_deadline <= 3 (includes upcoming <= 3 days AND already overdue < 0 days)
      3. Task has an assigned user with a registered email
      4. A reminder has NOT already been sent for this task today (safeguard against duplicate sends)
    
    :param app: Flask app instance (optional if running in app context)
    :param force: If True, bypasses same-day duplicate check for manual testing
    :return: dict with detailed execution summary
    """
    def _execute():
        today = datetime.utcnow().date()
        start_of_day = datetime.combine(today, datetime.min.time())
        end_of_day = datetime.combine(today + timedelta(days=1), datetime.min.time())

        # Disallowed / Stop statuses
        STOP_STATUSES = {'submitted', 'under_review', 'completed', 'rejected'}
        ACTIVE_STATUSES = {'assigned', 'in_progress', 'pending'}

        # Query all candidate tasks with a deadline and assignee
        all_tasks = Task.query.filter(
            Task.deadline.isnot(None),
            Task.assigned_to.isnot(None)
        ).all()

        evaluated_count = 0
        reminders_sent = []
        skipped_duplicates = []
        skipped_status = []
        skipped_deadline = []
        skipped_no_email = []

        for task in all_tasks:
            evaluated_count += 1
            task_status_clean = (task.status or '').strip().lower()

            # 1. Stop condition check
            if task_status_clean in STOP_STATUSES or task_status_clean not in ACTIVE_STATUSES:
                skipped_status.append({
                    'task_id': task.id,
                    'title': task.title,
                    'status': task.status,
                    'reason': f"Task status '{task.status}' is not eligible for reminders (stopped for submitted/completed/rejected/unassigned)."
                })
                continue

            # 2. Deadline calculation
            task_deadline_date = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
            days_until_deadline = (task_deadline_date - today).days

            # 3. Check if within 3 days or overdue (days_until_deadline <= 3)
            if days_until_deadline > 3:
                skipped_deadline.append({
                    'task_id': task.id,
                    'title': task.title,
                    'deadline': str(task_deadline_date),
                    'days_remaining': days_until_deadline,
                    'reason': f"Deadline is {days_until_deadline} days away (> 3 days threshold)."
                })
                continue

            # 4. Lookup assigned user's registered login email
            assignee = User.query.get(task.assigned_to)
            if not assignee or not assignee.email or not assignee.email.strip():
                skipped_no_email.append({
                    'task_id': task.id,
                    'title': task.title,
                    'assigned_to': task.assigned_to,
                    'reason': "Assigned employee has no registered login email."
                })
                continue

            # 5. Duplicate check in email_reminders_log (one send per task per day)
            already_sent_today = EmailReminderLog.query.filter(
                EmailReminderLog.task_id == task.id,
                EmailReminderLog.sent_at >= start_of_day,
                EmailReminderLog.sent_at < end_of_day
            ).first()

            if already_sent_today and not force:
                skipped_duplicates.append({
                    'task_id': task.id,
                    'title': task.title,
                    'assignee_email': assignee.email,
                    'sent_at': already_sent_today.sent_at.isoformat(),
                    'reason': "Reminder already logged and sent for this task today."
                })
                continue

            # 6. Format and send reminder email
            task_data = {
                'title': task.title,
                'description': task.description or '',
                'deadline_str': task_deadline_date.strftime('%B %d, %Y'),
                'priority': task.priority or 'Medium',
                'status': task.status or 'assigned'
            }

            email_success, subject, log_msg = send_task_deadline_reminder(
                to_address=assignee.email,
                task_data=task_data,
                days_until_deadline=days_until_deadline
            )

            # 7. Record in email_reminders_log audit table
            reminder_log = EmailReminderLog(
                task_id=task.id,
                sent_at=datetime.utcnow(),
                recipient_email=assignee.email,
                subject=subject,
                status='sent' if email_success else 'simulated_or_pending_credentials'
            )
            db.session.add(reminder_log)

            # 8. Add corresponding in-app notification
            in_app_msg = f"{subject} ({task_deadline_date.strftime('%b %d')})"
            existing_notif = Notification.query.filter_by(
                user_id=assignee.id,
                task_id=task.id,
                message=in_app_msg
            ).first()

            if not existing_notif:
                notif = Notification(
                    user_id=assignee.id,
                    task_id=task.id,
                    meeting_id=task.meeting_id,
                    message=in_app_msg,
                    type='task'
                )
                db.session.add(notif)

            db.session.commit()

            reminders_sent.append({
                'task_id': task.id,
                'task_title': task.title,
                'assignee_id': assignee.id,
                'assignee_name': assignee.name,
                'assignee_email': assignee.email,
                'days_until_deadline': days_until_deadline,
                'deadline': str(task_deadline_date),
                'priority': task.priority,
                'status': task.status,
                'subject': subject,
                'email_dispatched': email_success,
                'log_id': reminder_log.id,
                'log_status': reminder_log.status
            })

            print(f">> [Daily Reminder Job] Processed Task #{task.id} '{task.title}' -> {assignee.email} (Days: {days_until_deadline})")

        return {
            'timestamp': datetime.utcnow().isoformat(),
            'total_tasks_evaluated': evaluated_count,
            'reminders_sent_count': len(reminders_sent),
            'duplicates_skipped_count': len(skipped_duplicates),
            'reminders_sent': reminders_sent,
            'duplicates_skipped': skipped_duplicates,
            'skipped_by_deadline_count': len(skipped_deadline),
            'skipped_by_status_count': len(skipped_status),
            'skipped_no_email_count': len(skipped_no_email)
        }

    if app:
        with app.app_context():
            return _execute()
    else:
        return _execute()

def check_task_deadlines(app):
    """
    Wrapper for scheduled APScheduler daily run.
    """
    print(f">> [APScheduler] Starting daily task deadline reminder job at {datetime.utcnow().isoformat()} UTC...")
    try:
        summary = run_daily_deadline_reminders(app=app, force=False)
        print(f">> [APScheduler] Daily reminders completed. Sent: {summary['reminders_sent_count']}, Duplicates Skipped: {summary['duplicates_skipped_count']}.")
    except Exception as e:
        print(f">> [APScheduler Error in daily reminder job]: {e}")

def init_scheduler(app):
    """
    Initializes and starts APScheduler BackgroundScheduler with a once-daily cron trigger.
    Runs every day at 8:00 AM server time.
    """
    global _scheduler_initialized, scheduler
    if not _scheduler_initialized:
        _scheduler_initialized = True
        try:
            # Daily CronTrigger at 8:00 AM
            scheduler.add_job(
                func=check_task_deadlines,
                trigger=CronTrigger(hour=8, minute=0),
                args=[app],
                id='daily_deadline_reminders',
                name='Daily Task Deadline Email Reminders (8:00 AM)',
                replace_existing=True,
                misfire_grace_time=3600
            )

            if not scheduler.running:
                scheduler.start()
            print(">> [APScheduler] Daily Task Deadline Email Reminder job scheduled for 08:00 AM daily.")
        except Exception as e:
            print(f">> [APScheduler Initialization Error]: {e}")

def get_scheduler_status():
    """
    Returns diagnostic information about active APScheduler jobs.
    """
    jobs = []
    if scheduler.running:
        for job in scheduler.get_jobs():
            jobs.append({
                'id': job.id,
                'name': job.name,
                'next_run_time': job.next_run_time.isoformat() if job.next_run_time else None,
                'trigger': str(job.trigger)
            })
    return {
        'scheduler_running': scheduler.running,
        'jobs_count': len(jobs),
        'jobs': jobs
    }
