from flask import Blueprint, jsonify, request
from extensions import db
from models import Notification
from utils.auth import token_required

notifications_bp = Blueprint('notifications', __name__)

@notifications_bp.route('', methods=['GET'])
@token_required
def get_notifications(current_user):
    limit = int(request.args.get('limit', 50))
    notifications = Notification.query.filter_by(user_id=current_user.id).order_by(Notification.created_at.desc()).limit(limit).all()
    unread_count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()

    return jsonify({
        'success': True,
        'notifications': [n.to_dict() for n in notifications],
        'unread_count': unread_count
    }), 200

@notifications_bp.route('/<int:notification_id>/read', methods=['PUT'])
@token_required
def mark_notification_read(current_user, notification_id):
    notif = Notification.query.filter_by(id=notification_id, user_id=current_user.id).first()
    if not notif:
        return jsonify({'success': False, 'message': 'Notification not found'}), 404

    notif.is_read = True
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Notification marked as read',
        'notification': notif.to_dict()
    }), 200

@notifications_bp.route('/read-all', methods=['PUT'])
@token_required
def mark_all_notifications_read(current_user):
    Notification.query.filter_by(user_id=current_user.id, is_read=False).update({'is_read': True})
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'All notifications marked as read'
    }), 200

@notifications_bp.route('/check-deadlines', methods=['POST'])
@token_required
def trigger_deadline_checks(current_user):
    from flask import current_app
    from services.scheduler_service import check_task_deadlines
    check_task_deadlines(current_app._get_current_object())
    return jsonify({
        'success': True,
        'message': 'Deadline reminder check completed successfully'
    }), 200
