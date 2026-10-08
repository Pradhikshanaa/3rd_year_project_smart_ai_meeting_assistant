from datetime import datetime, timedelta
from app import create_app
from extensions import db
from models import Task, Meeting, Decision, User
from utils.risk import calculate_task_risk
from utils.effectiveness import calculate_meeting_effectiveness

def test_phase8():
    print('>> [Phase 8 Verification] Testing Meeting Effectiveness & Task Risk Rule-based Calculators...')
    app = create_app()

    with app.app_context():
        # 1. Test Task Risk Calculator with various synthetic tasks
        today = datetime.utcnow()

        # Task A: Overdue
        task_overdue = Task(
            title="Old task",
            progress=25,
            deadline=today - timedelta(days=2),
            status="in_progress"
        )
        risk_a = calculate_task_risk(task_overdue)
        print(f"Task Overdue -> Level: {risk_a['level']}, Reason: {risk_a['reason']}")
        assert risk_a['level'] == 'High', "Overdue task should be High risk"

        # Task B: Due in 1 day with 10% progress
        task_due_tomorrow = Task(
            title="Urgent deliverable",
            progress=10,
            deadline=today + timedelta(days=1),
            status="in_progress"
        )
        risk_b = calculate_task_risk(task_due_tomorrow)
        print(f"Task Due Tomorrow (10% progress) -> Level: {risk_b['level']}, Reason: {risk_b['reason']}")
        assert risk_b['level'] == 'High', "Due tomorrow with low progress should be High risk"

        # Task C: Due in 10 days with healthy progress
        task_comfortable = Task(
            title="Future release notes",
            progress=50,
            deadline=today + timedelta(days=10),
            status="in_progress"
        )
        risk_c = calculate_task_risk(task_comfortable)
        print(f"Task Due in 10d -> Level: {risk_c['level']}, Reason: {risk_c['reason']}")
        assert risk_c['level'] == 'Low', "Task with distant deadline should be Low risk"

        # Task D: Completed task
        task_done = Task(
            title="Done task",
            progress=100,
            deadline=today - timedelta(days=5),
            status="completed"
        )
        risk_d = calculate_task_risk(task_done)
        print(f"Task Completed -> Level: {risk_d['level']}, Reason: {risk_d['reason']}")
        assert risk_d['level'] == 'None', "Completed task should have None/Completed risk"

        # 2. Test Meeting Effectiveness Calculator
        # Fetch an existing meeting from DB
        meeting = Meeting.query.first()
        if meeting:
            eff = calculate_meeting_effectiveness(meeting)
            print(f"\nMeeting '{meeting.meeting_id}' Effectiveness:")
            print(f"Score: {eff['score']} / 100 ({eff['grade']})")
            print(f"Breakdown: {eff['breakdown']}")
            print(f"Suggestions: {eff['suggestions']}")
            assert 0 <= eff['score'] <= 100, "Score should be between 0 and 100"

    print("\n>> [PHASE 8 VERIFICATION COMPLETE: ALL TESTS PASSED! [OK]]")

if __name__ == '__main__':
    test_phase8()
