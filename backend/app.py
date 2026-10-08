import os
import sys

# Select async mode: eventlet for Python < 3.13, threading for Python 3.13+
ASYNC_MODE = "threading"
if sys.version_info < (3, 13):
    try:
        import eventlet
        eventlet.monkey_patch()
        ASYNC_MODE = "eventlet"
    except Exception:
        ASYNC_MODE = "threading"

from datetime import datetime
from flask import Flask, request, jsonify
from config import Config
from extensions import db, socketio, cors

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions with permissive CORS
    db.init_app(app)
    cors.init_app(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    socketio.init_app(app, cors_allowed_origins="*", async_mode=ASYNC_MODE)


    # Register blueprints
    from routes.health import health_bp
    from routes.auth import auth_bp
    from routes.teams import teams_bp
    from routes.dashboard import dashboard_bp
    from routes.meetings import meetings_bp
    from routes.notifications import notifications_bp
    from routes.tasks import tasks_bp
    from routes.assistant import assistant_bp
    from routes.messages import messages_bp
    from routes.admin import admin_bp

    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(teams_bp, url_prefix='/api/teams')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(meetings_bp, url_prefix='/api/meetings')
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
    app.register_blueprint(tasks_bp, url_prefix='/api/tasks')
    app.register_blueprint(assistant_bp, url_prefix='/api/assistant')
    app.register_blueprint(assistant_bp, name='ai_assistant', url_prefix='/api/ai')
    app.register_blueprint(messages_bp, url_prefix='/api/messages')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    # Ensure tables are created when DB is accessible
    with app.app_context():
        try:
            db.create_all()
            print(">> Database tables checked/created successfully.")
        except Exception as e:
            print(f">> Notice: Could not auto-create database tables on launch: {e}")

    # Initialize APScheduler for daily task deadline reminder emails
    from services.scheduler_service import init_scheduler
    init_scheduler(app)

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        if exception:
            try:
                db.session.rollback()
            except Exception:
                pass
        try:
            db.session.remove()
        except Exception:
            pass

    # Active in-memory room tracking: { meeting_id: { socket_id: { user_id, user_name, socket_id } } }
    active_meeting_rooms = {}

    @socketio.on('connect')
    def handle_connect(*args, **kwargs):
        print(f">> [Socket.IO] Client connected: {request.sid}")

    @socketio.on('join-room')
    def handle_join_room(data):
        from flask_socketio import join_room, emit
        meeting_id = data.get('meeting_id')
        user_id = data.get('user_id')
        user_name = data.get('user_name', 'Anonymous')
        socket_id = request.sid

        if not meeting_id:
            return

        join_room(meeting_id)

        if meeting_id not in active_meeting_rooms:
            active_meeting_rooms[meeting_id] = {}

        # Get list of other existing participants in this room
        existing_participants = [
            info for sid, info in active_meeting_rooms[meeting_id].items() if sid != socket_id
        ]

        # Register this socket in the room
        active_meeting_rooms[meeting_id][socket_id] = {
            'socket_id': socket_id,
            'user_id': user_id,
            'user_name': user_name,
            'audio_enabled': data.get('audio_enabled', True),
            'video_enabled': data.get('video_enabled', True)
        }

        print(f">> [Socket.IO] User '{user_name}' (Socket: {socket_id}) joined Room '{meeting_id}'. Existing peers: {len(existing_participants)}")

        # Send list of existing peers to new joiner
        emit('existing-participants', {
            'participants': existing_participants
        }, to=socket_id)

        # Notify all existing peers in the room about the new participant
        emit('user-joined', {
            'socket_id': socket_id,
            'user_id': user_id,
            'user_name': user_name,
            'audio_enabled': data.get('audio_enabled', True),
            'video_enabled': data.get('video_enabled', True)
        }, to=meeting_id, include_self=False)

    @socketio.on('signal-offer')
    def handle_signal_offer(data):
        from flask_socketio import emit
        to_socket_id = data.get('to_socket_id')
        offer = data.get('offer')
        user_id = data.get('user_id')
        user_name = data.get('user_name')

        print(f">> [Socket.IO] Forwarding SDP Offer from {request.sid} to {to_socket_id} (User: {user_name})")
        emit('receive-offer', {
            'from_socket_id': request.sid,
            'offer': offer,
            'user_id': user_id,
            'user_name': user_name
        }, to=to_socket_id)

    @socketio.on('signal-answer')
    def handle_signal_answer(data):
        from flask_socketio import emit
        to_socket_id = data.get('to_socket_id')
        answer = data.get('answer')

        print(f">> [Socket.IO] Forwarding SDP Answer from {request.sid} to {to_socket_id}")
        emit('receive-answer', {
            'from_socket_id': request.sid,
            'answer': answer
        }, to=to_socket_id)

    @socketio.on('signal-ice-candidate')
    def handle_signal_ice(data):
        from flask_socketio import emit
        to_socket_id = data.get('to_socket_id')
        candidate = data.get('candidate')

        emit('receive-ice-candidate', {
            'from_socket_id': request.sid,
            'candidate': candidate
        }, to=to_socket_id)

    @socketio.on('user-media-toggle')
    def handle_media_toggle(data):
        from flask_socketio import emit
        meeting_id = data.get('meeting_id')
        media_type = data.get('type')  # 'audio' or 'video'
        enabled = data.get('enabled')

        if meeting_id and meeting_id in active_meeting_rooms and request.sid in active_meeting_rooms[meeting_id]:
            if media_type == 'audio':
                active_meeting_rooms[meeting_id][request.sid]['audio_enabled'] = enabled
            elif media_type == 'video':
                active_meeting_rooms[meeting_id][request.sid]['video_enabled'] = enabled

            emit('peer-media-toggle', {
                'socket_id': request.sid,
                'type': media_type,
                'enabled': enabled
            }, to=meeting_id, include_self=False)

    @socketio.on('live-caption')
    def handle_live_caption(data):
        from flask_socketio import emit
        meeting_id = data.get('meeting_id')
        if meeting_id:
            emit('live-caption', {
                'socket_id': request.sid,
                'speaker_name': data.get('speaker_name', 'Participant'),
                'speaker_id': data.get('speaker_id'),
                'text': data.get('text', ''),
                'is_final': data.get('is_final', False),
                'timestamp': data.get('timestamp')
            }, to=meeting_id, include_self=True)

    @socketio.on('leave-room')
    def handle_leave_room(data):
        from flask_socketio import leave_room, emit
        meeting_id = data.get('meeting_id')
        socket_id = request.sid

        if meeting_id and meeting_id in active_meeting_rooms:
            user_info = active_meeting_rooms[meeting_id].pop(socket_id, None)
            if user_info:
                print(f">> [Socket.IO] User '{user_info.get('user_name')}' left room '{meeting_id}'")
                emit('user-left', {
                    'socket_id': socket_id,
                    'user_id': user_info.get('user_id')
                }, to=meeting_id, include_self=False)
            leave_room(meeting_id)

    @socketio.on('disconnect')
    def handle_disconnect(*args, **kwargs):
        from flask_socketio import emit
        socket_id = request.sid
        print(f">> [Socket.IO] Client disconnected: {socket_id}")

        for meeting_id, participants in list(active_meeting_rooms.items()):
            if socket_id in participants:
                user_info = participants.pop(socket_id, None)
                if user_info:
                    print(f">> [Socket.IO] Broadcasting user-left for '{user_info.get('user_name')}' in room '{meeting_id}'")
                    emit('user-left', {
                        'socket_id': socket_id,
                        'user_id': user_info.get('user_id')
                    }, to=meeting_id, include_self=False)

    # ==========================================
    # 1-to-1 DIRECT CHAT REAL-TIME SOCKET EVENTS
    # ==========================================
    @socketio.on('join-user')
    def handle_join_user(data):
        from flask_socketio import join_room
        user_id = data.get('user_id') if isinstance(data, dict) else data
        if user_id:
            room_name = f"user_{user_id}"
            join_room(room_name)
            print(f">> [Socket.IO] User ID {user_id} (Socket: {request.sid}) joined personal room '{room_name}'")

    @socketio.on('send_message')
    def handle_socket_send_message(data):
        from flask_socketio import emit
        from models import User, Message, Notification
        from datetime import datetime

        if not isinstance(data, dict):
            return

        sender_id = data.get('sender_id')
        receiver_id = data.get('receiver_id')
        message_text = data.get('message_text', '').strip()

        if not sender_id or not receiver_id or not message_text:
            return

        sender = User.query.get(sender_id)
        receiver = User.query.get(receiver_id)
        if not sender or not receiver or sender.team_id != receiver.team_id:
            return

        # Employee ↔ Leader authorization check
        if (sender.role == 'employee' and receiver.role != 'leader') or (sender.role == 'leader' and receiver.role != 'employee'):
            return

        new_msg = Message(
            sender_id=sender.id,
            receiver_id=receiver.id,
            message_text=message_text,
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.session.add(new_msg)
        db.session.flush()

        preview = message_text if len(message_text) <= 80 else message_text[:77] + '...'
        notif = Notification(
            user_id=receiver.id,
            message=f"💬 New message from {sender.name}: \"{preview}\"",
            type="message",
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.session.add(notif)
        db.session.commit()

        msg_dict = new_msg.to_dict()
        emit('receive_message', msg_dict, to=f"user_{receiver.id}")
        emit('message_sent_confirm', msg_dict, to=f"user_{sender.id}")

    @socketio.on('mark_messages_read')
    def handle_socket_mark_read(data):
        from flask_socketio import emit
        from models import Message

        if not isinstance(data, dict):
            return

        sender_id = data.get('sender_id')
        reader_id = data.get('reader_id')
        if sender_id and reader_id:
            Message.query.filter_by(sender_id=sender_id, receiver_id=reader_id, is_read=False).update({'is_read': True})
            db.session.commit()
            emit('messages_read', {'reader_id': reader_id, 'sender_id': sender_id}, to=f"user_{sender_id}")

    # Static file serving for built frontend (if built with npm run build)
    dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))

    from flask import send_from_directory
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend_or_fallback(path):
        if path.startswith('api') or path.startswith('socket.io'):
            return jsonify({'error': 'Not found'}), 404
        if os.path.exists(os.path.join(dist_dir, path)) and path != '':
            return send_from_directory(dist_dir, path)
        elif os.path.exists(os.path.join(dist_dir, 'index.html')):
            return send_from_directory(dist_dir, 'index.html')
        else:
            return jsonify({
                'name': 'Smart AI Meeting Assistant API Server',
                'status': 'online',
                'endpoints': '/api/health, /api/auth, /api/meetings, /api/tasks, /api/teams, /api/notifications, /api/assistant',
                'note': 'Frontend dev server is running at http://localhost:5173'
            })

    return app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f">> Starting Smart AI Meeting Assistant server on port {port} via SocketIO ({ASYNC_MODE})...")
    socketio.run(app, host='0.0.0.0', port=port, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)


