from models import Decision, Task, MeetingParticipant

def calculate_meeting_effectiveness(meeting):
    """
    Computes a rule-based Meeting Effectiveness Score (0 to 100) based on:
    - Decisions Count (30 max)
    - Actionable Tasks Count (30 max)
    - Task Ownership Rate (20 max)
    - Task Deadline Rate (20 max)
    """
    meeting_id = meeting.meeting_id

    # 1. Decisions Points (15 pts each, max 30)
    decisions = Decision.query.filter_by(meeting_id=meeting_id).all()
    decisions_count = len(decisions)
    decisions_points = min(30, decisions_count * 15)

    # 2. Tasks Points (10 pts each, max 30)
    tasks = Task.query.filter_by(meeting_id=meeting_id).all()
    tasks_count = len(tasks)
    tasks_points = min(30, tasks_count * 10)

    # 3. Ownership Points (% of tasks with assigned_to, max 20)
    assigned_count = sum(1 for t in tasks if t.assigned_to is not None)
    ownership_rate = int((assigned_count / tasks_count * 100)) if tasks_count > 0 else 0
    ownership_points = int((assigned_count / tasks_count) * 20) if tasks_count > 0 else (10 if decisions_count > 0 else 0)

    # 4. Deadline Points (% of tasks with explicit deadline, max 20)
    deadline_count = sum(1 for t in tasks if t.deadline is not None)
    deadline_rate = int((deadline_count / tasks_count * 100)) if tasks_count > 0 else 0
    deadline_points = int((deadline_count / tasks_count) * 20) if tasks_count > 0 else (10 if decisions_count > 0 else 0)

    # Total Score
    raw_score = decisions_points + tasks_points + ownership_points + deadline_points

    # Minimum baseline of 25 if meeting summary/transcript exists
    if (meeting.summary or meeting.transcript) and raw_score < 25:
        raw_score = 25

    total_score = min(100, raw_score)

    # Grade determination
    if total_score >= 80:
        grade = "High Impact"
        badge_color = "#10b981"
        badge_class = "badge-success"
        summary_text = "Highly productive meeting with concrete decisions and assigned action items."
    elif total_score >= 60:
        grade = "Good"
        badge_color = "#3b82f6"
        badge_class = "badge-primary"
        summary_text = "Solid meeting outcome with good clarity on next steps."
    elif total_score >= 40:
        grade = "Moderate"
        badge_color = "#f59e0b"
        badge_class = "badge-warning"
        summary_text = "Some outcomes achieved, but some tasks lack owners or deadlines."
    else:
        grade = "Needs Improvement"
        badge_color = "#ef4444"
        badge_class = "badge-danger"
        summary_text = "Few decisions or action items were finalized during this meeting."

    # Suggestions for improvement
    suggestions = []
    if decisions_count == 0:
        suggestions.append("Record explicit meeting decisions to lock in agreements.")
    if tasks_count == 0:
        suggestions.append("Create actionable tasks for participants to follow up on.")
    elif ownership_rate < 100:
        suggestions.append(f"Assign remaining {tasks_count - assigned_count} unassigned task(s) to team members.")
    if tasks_count > 0 and deadline_rate < 100:
        suggestions.append(f"Set deadlines for {tasks_count - deadline_count} task(s) lacking target dates.")

    if not suggestions:
        suggestions.append("Outstanding meeting structure! All deliverables have clear owners and deadlines.")

    return {
        'score': total_score,
        'grade': grade,
        'badge_color': badge_color,
        'badge_class': badge_class,
        'summary_text': summary_text,
        'breakdown': {
            'decisions_count': decisions_count,
            'decisions_points': decisions_points,
            'tasks_count': tasks_count,
            'tasks_points': tasks_points,
            'ownership_rate': ownership_rate,
            'ownership_points': ownership_points,
            'deadline_rate': deadline_rate,
            'deadline_points': deadline_points,
        },
        'suggestions': suggestions
    }
