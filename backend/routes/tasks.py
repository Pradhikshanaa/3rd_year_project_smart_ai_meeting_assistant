from datetime import datetime
from flask import Blueprint, request, jsonify
from extensions import db
from models import Task, User, Meeting, Notification, Team
from utils.auth import token_required, leader_required

tasks_bp = Blueprint('tasks', __name__)

@tasks_bp.route('', methods=['GET'])
@token_required
def get_tasks(current_user):
    if not current_user.team_id:
        return jsonify({'success': True, 'tasks': [], 'count': 0}), 200

    status_filter = request.args.get('status')
    meeting_id = request.args.get('meeting_id')
    assigned_to = request.args.get('assigned_to')

    # Team members and meeting IDs
    team_users = User.query.filter_by(team_id=current_user.team_id).all()
    team_user_ids = [u.id for u in team_users]

    team_meetings = Meeting.query.filter_by(team_id=current_user.team_id).all()
    meeting_ids = [m.meeting_id for m in team_meetings]

    # Base query: tasks assigned to team members, assigned by leader, or linked to team meetings
    from sqlalchemy import or_
    query = Task.query.filter(
        or_(
            Task.assigned_to.in_(team_user_ids),
            Task.assigned_by.in_(team_user_ids),
            Task.meeting_id.in_(meeting_ids)
        )
    )

    # If employee, only show tasks assigned to them (exclude 'suggested' unconfirmed tasks)
    if current_user.role != 'leader':
        query = query.filter(Task.assigned_to == current_user.id, Task.status != 'suggested')
    elif assigned_to:
        query = query.filter(Task.assigned_to == int(assigned_to))

    if status_filter:
        query = query.filter(Task.status == status_filter)
    else:
        query = query.filter(Task.status != 'suggested')

    if meeting_id:
        query = query.filter(Task.meeting_id == meeting_id)

    tasks = query.order_by(Task.updated_at.desc(), Task.created_at.desc()).all()
    results = []

    for t in tasks:
        t_dict = t.to_dict()
        # Add assignee details
        if t.assigned_to:
            assignee = User.query.get(t.assigned_to)
            t_dict['assignee_name'] = assignee.name if assignee else 'Unknown Member'
            t_dict['assignee_email'] = assignee.email if assignee else ''
        else:
            t_dict['assignee_name'] = 'Unassigned'
            t_dict['assignee_email'] = ''

        # Add meeting title
        if t.meeting_id:
            m = Meeting.query.filter_by(meeting_id=t.meeting_id).first()
            t_dict['meeting_title'] = m.title if m else t.meeting_id

        results.append(t_dict)

    return jsonify({
        'success': True,
        'tasks': results,
        'count': len(results)
    }), 200

@tasks_bp.route('/approvals', methods=['GET'])
@leader_required
def get_pending_approvals(current_user):
    from sqlalchemy import or_
    team_users = User.query.filter_by(team_id=current_user.team_id).all()
    team_user_ids = [u.id for u in team_users]

    team_meetings = Meeting.query.filter_by(team_id=current_user.team_id).all()
    meeting_ids = [m.meeting_id for m in team_meetings]

    submitted_tasks = Task.query.filter(
        or_(
            Task.assigned_to.in_(team_user_ids),
            Task.assigned_by == current_user.id,
            Task.meeting_id.in_(meeting_ids)
        ),
        Task.status.in_(['submitted', 'under_review'])
    ).order_by(Task.updated_at.desc()).all()

    results = []
    for t in submitted_tasks:
        t_dict = t.to_dict()
        if t.assigned_to:
            assignee = User.query.get(t.assigned_to)
            t_dict['assignee_name'] = assignee.name if assignee else 'Unknown Member'
            t_dict['assignee_email'] = assignee.email if assignee else ''
        else:
            t_dict['assignee_name'] = 'Unassigned'
            t_dict['assignee_email'] = ''

        if t.meeting_id:
            m = Meeting.query.filter_by(meeting_id=t.meeting_id).first()
            t_dict['meeting_title'] = m.title if m else t.meeting_id

        results.append(t_dict)

    return jsonify({
        'success': True,
        'approvals': results,
        'count': len(results)
    }), 200

@tasks_bp.route('', methods=['POST'])
@leader_required
def create_task(current_user):
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    meeting_id = data.get('meeting_id')
    assigned_to = data.get('assigned_to')
    priority = data.get('priority', 'Medium')
    deadline_str = data.get('deadline')
    estimated_duration = data.get('estimated_duration', 'Not Mentioned')

    if not title:
        return jsonify({'success': False, 'message': 'Task title is required'}), 400

    deadline = None
    if deadline_str and deadline_str != 'Not Mentioned':
        try:
            deadline = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
        except Exception:
            deadline = None

    task = Task(
        meeting_id=meeting_id,
        title=title,
        description=description,
        assigned_to=int(assigned_to) if assigned_to else None,
        assigned_by=current_user.id,
        priority=priority,
        deadline=deadline,
        estimated_duration=estimated_duration,
        progress=0,
        status='assigned'
    )
    db.session.add(task)
    db.session.flush()

    # Notify assignee if assigned
    if task.assigned_to:
        notif = Notification(
            user_id=task.assigned_to,
            task_id=task.id,
            meeting_id=task.meeting_id,
            message=f"New task assigned to you by {current_user.name}: {task.title}",
            type='task'
        )
        db.session.add(notif)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Task created and assigned successfully',
        'task': task.to_dict()
    }), 201

@tasks_bp.route('/<int:task_id>/confirm', methods=['POST', 'PATCH'])
@tasks_bp.route('/confirm', methods=['POST', 'PATCH'])
@leader_required
def confirm_suggested_task(current_user, task_id=None):
    data = request.get_json() or {}
    if not task_id:
        task_id = data.get('task_id') or data.get('id')

    task = None
    if task_id:
        try:
            task = Task.query.get(int(task_id))
        except Exception:
            task = None

    meeting_id = data.get('meeting_id')
    title = data.get('title', '').strip() if data.get('title') else ''
    description = data.get('description', '').strip() if data.get('description') else ''
    assigned_to = data.get('assigned_to')
    priority = data.get('priority', 'Medium')
    deadline_str = data.get('deadline')
    estimated_duration = data.get('estimated_duration', 'Not Mentioned')

    # If task is not found by ID (e.g. re-analysis purged old IDs), search by meeting_id and title
    if not task and meeting_id and title:
        task = Task.query.filter_by(meeting_id=meeting_id, title=title).first()

    # If still not found, create and finalize the task directly
    if not task:
        if not title:
            return jsonify({'success': False, 'message': 'Task title is required'}), 400
        task = Task(
            meeting_id=meeting_id,
            title=title,
            description=description,
            assigned_to=int(assigned_to) if assigned_to else None,
            assigned_by=current_user.id,
            priority=priority,
            estimated_duration=estimated_duration,
            progress=0,
            status='assigned'
        )
        db.session.add(task)
        db.session.flush()

    if title:
        task.title = title
    if description is not None:
        task.description = description
    if assigned_to is not None:
        task.assigned_to = int(assigned_to) if assigned_to else None
    if priority:
        task.priority = priority
    if estimated_duration:
        task.estimated_duration = estimated_duration

    if deadline_str is not None:
        clean_d = str(deadline_str).strip()
        if clean_d and clean_d.lower() not in ['not mentioned', 'none', 'null', '']:
            try:
                if len(clean_d) == 10 and clean_d.count('-') == 2:
                    task.deadline = datetime.strptime(clean_d, '%Y-%m-%d')
                else:
                    task.deadline = datetime.fromisoformat(clean_d.replace('Z', '+00:00'))
            except Exception as d_err:
                print(f">> [Task Deadline Parse Warning]: {d_err}")
        else:
            task.deadline = None

    task.status = 'assigned'
    task.assigned_by = current_user.id

    # Create notification for assignee
    if task.assigned_to:
        notif = Notification(
            user_id=task.assigned_to,
            task_id=task.id,
            meeting_id=task.meeting_id,
            message=f"New task confirmed & assigned to you: {task.title}",
            type='task'
        )
        db.session.add(notif)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Task "{task.title}" confirmed and assigned',
        'task': task.to_dict()
    }), 200

@tasks_bp.route('/<int:task_id>', methods=['DELETE'])
@leader_required
def delete_task(current_user, task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'message': 'Task not found'}), 404

    db.session.delete(task)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Task removed successfully'
    }), 200

@tasks_bp.route('/<int:task_id>/progress', methods=['PATCH'])
@token_required
def update_task_progress(current_user, task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'message': 'Task not found'}), 404

    # Permission check: must be assigned to task or team leader
    if task.assigned_to != current_user.id and current_user.role != 'leader':
        return jsonify({'success': False, 'message': 'You can only update tasks assigned to you'}), 403

    data = request.get_json() or {}
    progress = data.get('progress')

    if progress is None or not (0 <= int(progress) <= 100):
        return jsonify({'success': False, 'message': 'Progress must be a number between 0 and 100'}), 400

    task.progress = int(progress)

    # Auto-transition status: if in 'assigned' or 'rejected', move to 'in_progress'
    if task.status in ['assigned', 'rejected', 'pending'] and task.progress > 0:
        task.status = 'in_progress'

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Progress updated to {task.progress}%',
        'task': task.to_dict()
    }), 200

@tasks_bp.route('/<int:task_id>/submit', methods=['PATCH'])
@token_required
def submit_task_for_review(current_user, task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'message': 'Task not found'}), 404

    if task.assigned_to != current_user.id and current_user.role != 'leader':
        return jsonify({'success': False, 'message': 'You can only submit tasks assigned to you'}), 403

    task.status = 'submitted'
    task.progress = 100  # Set to 100% on submission
    task.rejection_feedback = None  # Clear previous rejection feedback

    # Send in-app notification to the Team Leader / assigner
    if task.assigned_by:
        notif = Notification(
            user_id=task.assigned_by,
            task_id=task.id,
            meeting_id=task.meeting_id,
            message=f"{current_user.name} submitted task for verification: {task.title}",
            type='task'
        )
        db.session.add(notif)
    else:
        # Fallback to team leader
        leader = User.query.filter_by(team_id=current_user.team_id, role='leader').first()
        if leader:
            notif = Notification(
                user_id=leader.id,
                task_id=task.id,
                meeting_id=task.meeting_id,
                message=f"{current_user.name} submitted task for verification: {task.title}",
                type='task'
            )
            db.session.add(notif)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Task submitted for Team Leader verification',
        'task': task.to_dict()
    }), 200

@tasks_bp.route('/<int:task_id>/approve', methods=['PATCH'])
@leader_required
def approve_task(current_user, task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'message': 'Task not found'}), 404

    task.status = 'completed'
    task.progress = 100
    task.rejection_feedback = None

    # Send congratulatory notification to employee
    if task.assigned_to:
        notif = Notification(
            user_id=task.assigned_to,
            task_id=task.id,
            meeting_id=task.meeting_id,
            message=f"🎉 Task approved and marked completed by {current_user.name}: {task.title}",
            type='task'
        )
        db.session.add(notif)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Task "{task.title}" has been approved and completed',
        'task': task.to_dict()
    }), 200

@tasks_bp.route('/<int:task_id>/reject', methods=['PATCH'])
@leader_required
def reject_task(current_user, task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'success': False, 'message': 'Task not found'}), 404

    data = request.get_json() or {}
    feedback = data.get('feedback', '').strip()

    if not feedback:
        return jsonify({'success': False, 'message': 'Rejection feedback is required so the employee knows what to fix'}), 400

    task.status = 'rejected'
    task.rejection_feedback = feedback

    # Send notification to employee
    if task.assigned_to:
        notif = Notification(
            user_id=task.assigned_to,
            task_id=task.id,
            meeting_id=task.meeting_id,
            message=f"Task needs rework: \"{task.title}\" - Feedback: {feedback}",
            type='task'
        )
        db.session.add(notif)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Task rejected with feedback and returned to employee',
        'task': task.to_dict()
    }), 200

@tasks_bp.route('/trigger-reminders', methods=['POST'])
@leader_required
def trigger_task_reminders(current_user):
    """
    Trigger daily task deadline reminders on-demand.
    """
    from services.scheduler_service import run_daily_deadline_reminders
    from flask import current_app
    force = request.args.get('force', 'false').lower() in ['true', '1', 'yes']
    summary = run_daily_deadline_reminders(app=current_app._get_current_object(), force=force)
    return jsonify({
        'success': True,
        'message': f"Deadline reminder scan completed by {current_user.name}",
        'force_mode': force,
        'summary': summary
    }), 200

@tasks_bp.route('/reminders-log', methods=['GET'])
@leader_required
def get_task_reminders_log(current_user):
    """
    Audit log for task deadline reminder emails.
    """
    from models import EmailReminderLog
    logs = EmailReminderLog.query.order_by(EmailReminderLog.sent_at.desc()).limit(100).all()
    return jsonify({
        'success': True,
        'count': len(logs),
        'logs': [l.to_dict() for l in logs]
    }), 200
