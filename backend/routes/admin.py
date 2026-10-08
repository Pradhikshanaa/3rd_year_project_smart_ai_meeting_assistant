from flask import Blueprint, request, jsonify, current_app
from extensions import db
from models import EmailReminderLog, Task, User
from utils.auth import leader_required
from services.scheduler_service import run_daily_deadline_reminders, get_scheduler_status

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/trigger-reminders', methods=['POST'])
@leader_required
def manual_trigger_reminders(current_user):
    """
    Manual trigger endpoint to execute daily deadline reminders on demand.
    Protected for Team Leaders.
    
    Optional query or JSON param:
      force=true : Bypasses the same-day duplicate check for manual testing
    """
    data = request.get_json(silent=True) or {}
    force_param = request.args.get('force')
    force = False
    if force_param is not None:
        force = force_param.lower() in ['true', '1', 'yes']
    elif 'force' in data:
        force = bool(data.get('force'))

    try:
        summary = run_daily_deadline_reminders(app=current_app._get_current_object(), force=force)
        return jsonify({
            'success': True,
            'message': f"Deadline reminder scan executed successfully by Leader '{current_user.name}'.",
            'force_mode': force,
            'summary': summary
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error triggering deadline reminders: {str(e)}"
        }), 500

@admin_bp.route('/reminders-log', methods=['GET'])
@leader_required
def get_reminders_log(current_user):
    """
    Retrieves audit log entries for sent task deadline email reminders.
    """
    limit = int(request.args.get('limit', 50))
    task_id = request.args.get('task_id')

    query = EmailReminderLog.query
    if task_id:
        query = query.filter_by(task_id=int(task_id))

    logs = query.order_by(EmailReminderLog.sent_at.desc()).limit(limit).all()

    results = []
    for l in logs:
        log_dict = l.to_dict()
        task = Task.query.get(l.task_id)
        if task:
            log_dict['task_title'] = task.title
            log_dict['task_status'] = task.status
            log_dict['deadline'] = task.deadline.isoformat() if task.deadline else None
        results.append(log_dict)

    return jsonify({
        'success': True,
        'count': len(results),
        'logs': results
    }), 200

@admin_bp.route('/scheduler-status', methods=['GET'])
@leader_required
def get_scheduler_info(current_user):
    """
    Returns diagnostic information on APScheduler status and registered jobs.
    """
    status_info = get_scheduler_status()
    return jsonify({
        'success': True,
        'scheduler': status_info
    }), 200
