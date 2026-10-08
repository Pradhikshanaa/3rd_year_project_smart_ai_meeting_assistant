import sys
from app import app
from models import Meeting, Task, Decision, MeetingParticipant, Notification
from extensions import db

# Keywords to match test meeting titles
TEST_KEYWORDS = ['test', 'testing', 'n8n', 'to do list', 'todo', 'temp', 'demo', 'sample']

def find_test_meetings():
    with app.app_context():
        all_meetings = Meeting.query.order_by(Meeting.id.asc()).all()
        candidates = []
        for m in all_meetings:
            title_lower = m.title.lower()
            if any(k in title_lower for k in keywords_to_check()):
                candidates.append(m)
        return candidates

def keywords_to_check():
    return TEST_KEYWORDS

def cleanup(dry_run=True):
    with app.app_context():
        all_meetings = Meeting.query.order_by(Meeting.id.asc()).all()
        candidates = []
        keep = []
        for m in all_meetings:
            title_lower = m.title.lower()
            if any(k in title_lower for k in TEST_KEYWORDS):
                candidates.append(m)
            else:
                keep.append(m)

        print(f"Total Meetings in DB: {len(all_meetings)}")
        print(f"Target Meetings to Delete ({len(candidates)}):")
        for m in candidates:
            t_cnt = Task.query.filter_by(meeting_id=m.meeting_id).count()
            d_cnt = Decision.query.filter_by(meeting_id=m.meeting_id).count()
            p_cnt = MeetingParticipant.query.filter_by(meeting_id=m.meeting_id).count()
            print(f" - [{m.meeting_id}] \"{m.title}\" (Tasks: {t_cnt}, Decisions: {d_cnt}, Participants: {p_cnt})")

        if dry_run:
            print("\n>> DRY RUN: No records were deleted. To perform actual deletion, run with: python cleanup_test_meetings.py --execute")
            return

        print("\n>> Executing deletion of test meetings and cascading relations...")
        for m in candidates:
            Task.query.filter_by(meeting_id=m.meeting_id).delete()
            Decision.query.filter_by(meeting_id=m.meeting_id).delete()
            MeetingParticipant.query.filter_by(meeting_id=m.meeting_id).delete()
            Notification.query.filter_by(meeting_id=m.meeting_id).delete()
            db.session.delete(m)

        db.session.commit()
        print(f">> Successfully deleted {len(candidates)} test meetings and all related records.")

if __name__ == "__main__":
    execute_flag = "--execute" in sys.argv
    cleanup(dry_run=not execute_flag)
