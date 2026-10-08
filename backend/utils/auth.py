import jwt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, current_app
from models import User

def generate_token(user_id, role, team_id=None):
    payload = {
        'user_id': user_id,
        'role': role,
        'team_id': team_id,
        'exp': datetime.utcnow() + timedelta(days=7),
        'iat': datetime.utcnow()
    }
    token = jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')
    return token

def decode_token(token):
    try:
        payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
            elif len(parts) == 1:
                token = parts[0]
                
        if not token:
            token = request.cookies.get('token')
            
        if not token:
            return jsonify({'success': False, 'message': 'Authentication token is missing'}), 401
            
        payload = decode_token(token)
        if not payload:
            return jsonify({'success': False, 'message': 'Token is invalid or has expired'}), 401
            
        current_user = User.query.get(payload['user_id'])
        if not current_user:
            return jsonify({'success': False, 'message': 'User not found'}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated

def leader_required(f):
    @wraps(f)
    @token_required
    def decorated(current_user, *args, **kwargs):
        if current_user.role != 'leader':
            return jsonify({'success': False, 'message': 'Access restricted to Team Leaders only'}), 403
        return f(current_user, *args, **kwargs)
    return decorated
