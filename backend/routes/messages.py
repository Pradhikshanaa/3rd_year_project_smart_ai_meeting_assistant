from datetime import datetime
from flask import Blueprint, request, jsonify
from extensions import db, socketio
from models import User, Team, Message, Notification
from utils.auth import token_required

messages_bp = Blueprint('messages', __name__)

def validate_chat_partner(current_user, other_user):
    """
    Ensure 1-to-1 chat is strictly allowed only between an Employee and their Team Leader
    within the same team.
    """
    if not other_user or not current_user.team_id or other_user.team_id != current_user.team_id:
        return False, "User not found or does not belong to your team."

    if current_user.role == 'employee' and other_user.role != 'leader':
        return False, "Employees can only chat with their assigned Team Leader."

    if current_user.role == 'leader' and other_user.role != 'employee':
        return False, "Team Leaders can only chat directly with employees in their team."

    return True, ""


@messages_bp.route('/conversations', methods=['GET'])
@token_required
def get_conversations(current_user):
    """
    Get authorized conversations list:
    - If Employee: Returns their assigned Team Leader contact info, latest message, and unread count.
    - If Leader: Returns list of all team employees, with latest message snippet, timestamp, and unread counts.
    """
    if not current_user.team_id:
        return jsonify({
            'success': True,
            'conversations': [],
            'current_role': current_user.role
        }), 200

    conversations = []

    if current_user.role == 'employee':
        # Find Team Leader
        leader = User.query.filter_by(team_id=current_user.team_id, role='leader').first()
        if leader:
            last_msg = Message.query.filter(
                ((Message.sender_id == current_user.id) & (Message.receiver_id == leader.id)) |
                ((Message.sender_id == leader.id) & (Message.receiver_id == current_user.id))
            ).order_by(Message.created_at.desc()).first()

            unread_count = Message.query.filter_by(
                sender_id=leader.id,
                receiver_id=current_user.id,
                is_read=False
            ).count()

            conversations.append({
                'user': leader.to_dict(),
                'last_message': last_msg.to_dict() if last_msg else None,
                'unread_count': unread_count
            })

    elif current_user.role == 'leader':
        # Find all Employees in team
        employees = User.query.filter(
            User.team_id == current_user.team_id,
            User.role == 'employee',
            User.id != current_user.id
        ).order_by(User.name.asc()).all()

        for emp in employees:
            last_msg = Message.query.filter(
                ((Message.sender_id == current_user.id) & (Message.receiver_id == emp.id)) |
                ((Message.sender_id == emp.id) & (Message.receiver_id == current_user.id))
            ).order_by(Message.created_at.desc()).first()

            unread_count = Message.query.filter_by(
                sender_id=emp.id,
                receiver_id=current_user.id,
                is_read=False
            ).count()

            conversations.append({
                'user': emp.to_dict(),
                'last_message': last_msg.to_dict() if last_msg else None,
                'unread_count': unread_count
            })

        # Sort conversations: those with latest messages first, then alphabetically
        conversations.sort(
            key=lambda c: (
                c['last_message']['created_at'] if c['last_message'] else '1970-01-01T00:00:00',
                c['user']['name']
            ),
            reverse=True
        )

    return jsonify({
        'success': True,
        'conversations': conversations,
        'current_role': current_user.role
    }), 200


@messages_bp.route('/unread-count', methods=['GET'])
@token_required
def get_unread_count(current_user):
    """
    Get total unread message count for the current user (for sidebar badge).
    """
    total_unread = Message.query.filter_by(receiver_id=current_user.id, is_read=False).count()
    return jsonify({
        'success': True,
        'unread_count': total_unread
    }), 200


@messages_bp.route('/<int:other_user_id>', methods=['GET'])
@token_required
def get_messages(current_user, other_user_id):
    """
    Fetch full conversation history between current_user and other_user_id.
    Enforces team-level and role-level authorization.
    Automatically marks unread incoming messages from other_user_id as read.
    """
    other_user = User.query.get(other_user_id)
    if not other_user:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    is_valid, err_msg = validate_chat_partner(current_user, other_user)
    if not is_valid:
        return jsonify({'success': False, 'message': err_msg}), 403

    # Fetch messages between current user and other_user
    messages = Message.query.filter(
        ((Message.sender_id == current_user.id) & (Message.receiver_id == other_user_id)) |
        ((Message.sender_id == other_user_id) & (Message.receiver_id == current_user.id))
    ).order_by(Message.created_at.asc()).all()

    # Mark incoming messages as read
    updated_count = Message.query.filter_by(
        sender_id=other_user_id,
        receiver_id=current_user.id,
        is_read=False
    ).update({'is_read': True})

    if updated_count > 0:
        db.session.commit()
        # Broadcast read receipt to the sender's personal room
        try:
            socketio.emit('messages_read', {
                'reader_id': current_user.id,
                'sender_id': other_user_id
            }, to=f"user_{other_user_id}")
        except Exception as e:
            print(f">> [Socket.IO Notice] Could not emit messages_read: {e}")

    return jsonify({
        'success': True,
        'messages': [m.to_dict() for m in messages],
        'partner': other_user.to_dict()
    }), 200


@messages_bp.route('', methods=['POST'])
@token_required
def send_message(current_user):
    """
    Send a direct 1-to-1 chat message.
    1. Validates recipient and team authorization.
    2. Saves Message in DB.
    3. Creates Notification in notifications table for recipient.
    4. Emits real-time Socket.IO event to recipient room 'user_<receiver_id>'.
    """
    data = request.get_json() or {}
    receiver_id = data.get('receiver_id')
    message_text = data.get('message_text', '').strip()

    if not receiver_id or not message_text:
        return jsonify({'success': False, 'message': 'receiver_id and message_text are required'}), 400

    try:
        receiver_id = int(receiver_id)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'Invalid receiver_id'}), 400

    receiver = User.query.get(receiver_id)
    if not receiver:
        return jsonify({'success': False, 'message': 'Recipient user not found'}), 404

    is_valid, err_msg = validate_chat_partner(current_user, receiver)
    if not is_valid:
        return jsonify({'success': False, 'message': err_msg}), 403

    # 1. Create Message
    new_message = Message(
        sender_id=current_user.id,
        receiver_id=receiver_id,
        message_text=message_text,
        is_read=False,
        created_at=datetime.utcnow()
    )
    db.session.add(new_message)
    db.session.flush()

    # 2. Create Notification row for recipient
    preview = message_text if len(message_text) <= 80 else message_text[:77] + '...'
    notif = Notification(
        user_id=receiver_id,
        message=f"💬 New message from {current_user.name}: \"{preview}\"",
        type="message",
        is_read=False,
        created_at=datetime.utcnow()
    )
    db.session.add(notif)
    db.session.commit()

    message_dict = new_message.to_dict()

    # 3. Real-time delivery via Flask-SocketIO
    try:
        socketio.emit('receive_message', message_dict, to=f"user_{receiver_id}")
        socketio.emit('message_sent_confirm', message_dict, to=f"user_{current_user.id}")
    except Exception as e:
        print(f">> [Socket.IO Notice] Socket emit failed: {e}")

    return jsonify({
        'success': True,
        'message': message_dict
    }), 201


@messages_bp.route('/<int:message_id>/read', methods=['PUT'])
@token_required
def mark_message_read(current_user, message_id):
    """
    Mark a single message as read.
    """
    msg = Message.query.filter_by(id=message_id, receiver_id=current_user.id).first()
    if not msg:
        return jsonify({'success': False, 'message': 'Message not found'}), 404

    msg.is_read = True
    db.session.commit()

    try:
        socketio.emit('message_read', {
            'message_id': msg.id,
            'sender_id': msg.sender_id,
            'reader_id': current_user.id
        }, to=f"user_{msg.sender_id}")
    except Exception as e:
        print(f">> [Socket.IO Notice] Could not emit message_read: {e}")

    return jsonify({
        'success': True,
        'message': msg.to_dict()
    }), 200


@messages_bp.route('/<int:other_user_id>/read-all', methods=['PUT'])
@token_required
def mark_all_messages_read(current_user, other_user_id):
    """
    Mark all unread messages from other_user_id to current_user as read.
    """
    updated_count = Message.query.filter_by(
        sender_id=other_user_id,
        receiver_id=current_user.id,
        is_read=False
    ).update({'is_read': True})
    db.session.commit()

    if updated_count > 0:
        try:
            socketio.emit('messages_read', {
                'reader_id': current_user.id,
                'sender_id': other_user_id
            }, to=f"user_{other_user_id}")
        except Exception as e:
            print(f">> [Socket.IO Notice] Could not emit messages_read: {e}")

    return jsonify({
        'success': True,
        'updated_count': updated_count,
        'message': 'Messages marked as read'
    }), 200
