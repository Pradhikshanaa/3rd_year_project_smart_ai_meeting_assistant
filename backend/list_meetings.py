import os
from app import app
from models import Meeting, Task, Decision, MeetingParticipant

with app.app_context():
    all_meetings = Meeting.query.order_by(Meeting.id.asc()).all()
    print(f"Total meetings in DB: {len(all_meetings)}\n")
    keywords = ['test', 'testing', 'n8n', 'to do list', 'todo', 'temp', 'demo', 'sample']
    candidates = []
    keep = []
    for m in all_meetings:
        title_lower = m.title.lower()
        if any(k in title_lower for k in keywords):
            candidates.append(m)
        else:
            keep.append(m)
            
    print(f"=== CANDIDATE TEST MEETINGS TO DELETE ({len(candidates)}) ===")
    for m in candidates:
        tasks_count = Task.query.filter_by(meeting_id=m.meeting_id).count()
        dec_count = Decision.query.filter_by(meeting_id=m.meeting_id).count()
        parts_count = MeetingParticipant.query.filter_by(meeting_id=m.meeting_id).count()
        print(f" - [{m.meeting_id}] \"{m.title}\" | Status: {m.status} | Tasks: {tasks_count} | Decisions: {dec_count}")

    print(f"\n=== MEETINGS TO KEEP ({len(keep)}) ===")
    for m in keep:
        print(f" + [{m.meeting_id}] \"{m.title}\" | Status: {m.status}")
