import random
import string
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db
from models import User, Team
from utils.auth import generate_token, token_required

auth_bp = Blueprint('auth', __name__)

def generate_team_code():
    code_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"TEAM-{code_suffix}"

@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    role = data.get('role', 'employee').strip().lower()
    team_name = data.get('team_name', '').strip()
    team_id = data.get('team_id', '').strip().upper()

    if not name or not email or not password:
        return jsonify({'success': False, 'message': 'Name, email, and password are required'}), 400

    if role not in ['leader', 'employee']:
        return jsonify({'success': False, 'message': 'Role must be leader or employee'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'success': False, 'message': 'An account with this email already exists'}), 409

    final_team_id = None

    # Role logic for Team setup
    if role == 'leader':
        if team_name:
            final_team_id = generate_team_code()
            new_team = Team(team_id=final_team_id, team_name=team_name)
            db.session.add(new_team)
            db.session.flush()
        elif team_id:
            existing_team = Team.query.filter_by(team_id=team_id).first()
            if not existing_team:
                return jsonify({'success': False, 'message': f'Team ID {team_id} does not exist'}), 404
            final_team_id = existing_team.team_id
        else:
            return jsonify({'success': False, 'message': 'Team Leader must provide a Team Name to create a team'}), 400
    else:  # employee
        if not team_id:
            return jsonify({'success': False, 'message': 'Employee must provide a valid Team ID to join'}), 400
        existing_team = Team.query.filter_by(team_id=team_id).first()
        if not existing_team:
            return jsonify({'success': False, 'message': f'Team with ID {team_id} was not found'}), 404
        final_team_id = existing_team.team_id

    # Create new User
    user = User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password),
        role=role,
        team_id=final_team_id
    )
    db.session.add(user)
    db.session.flush()

    # If this was a new team created by this leader, update created_by
    if role == 'leader' and team_name:
        created_team = Team.query.filter_by(team_id=final_team_id).first()
        if created_team:
            created_team.created_by = user.id

    db.session.commit()

    token = generate_token(user.id, user.role, user.team_id)
    team_obj = Team.query.filter_by(team_id=user.team_id).first()

    return jsonify({
        'success': True,
        'message': 'Account created successfully',
        'token': token,
        'user': user.to_dict(),
        'team': team_obj.to_dict() if team_obj else None
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    raw_password = data.get('password', '')
    stripped_password = raw_password.strip()

    if not email or not raw_password:
        return jsonify({'success': False, 'message': 'Email and password are required'}), 400

    # Case-insensitive user lookup with .com fallback
    user = User.query.filter(
        (db.func.lower(User.email) == email) | 
        (db.func.lower(User.email) == f"{email}.com")
    ).first()
    
    password_valid = False
    if user:
        if check_password_hash(user.password_hash, raw_password) or check_password_hash(user.password_hash, stripped_password):
            password_valid = True

    print(f">> [Auth Login] Input: '{email}', Matched Email: '{user.email if user else None}', Password Valid: {password_valid}")

    if not user or not password_valid:
        return jsonify({'success': False, 'message': 'Invalid email or password'}), 401

    token = generate_token(user.id, user.role, user.team_id)
    team_obj = Team.query.filter_by(team_id=user.team_id).first() if user.team_id else None

    return jsonify({
        'success': True,
        'message': 'Login successful',
        'token': token,
        'user': user.to_dict(),
        'team': team_obj.to_dict() if team_obj else None
    }), 200

@auth_bp.route('/me', methods=['GET'])
@token_required
def get_me(current_user):
    team_obj = Team.query.filter_by(team_id=current_user.team_id).first() if current_user.team_id else None
    return jsonify({
        'success': True,
        'user': current_user.to_dict(),
        'team': team_obj.to_dict() if team_obj else None
    }), 200

# ============================================================================
# FEATURE: FORGOT PASSWORD & EMAIL RESET LINK
# ============================================================================

@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    import os
    import secrets
    from datetime import datetime, timedelta
    from models import PasswordResetToken
    from utils.email import send_password_reset_email

    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({'success': False, 'message': 'Email address is required.'}), 400

    # Case-insensitive user search
    user = User.query.filter(
        (db.func.lower(User.email) == email) |
        (db.func.lower(User.email) == f"{email}.com")
    ).first()

    # Generic response message for privacy & security
    generic_msg = "If an account exists with this email address, a password reset link has been sent to your inbox."

    if not user:
        print(f">> [Forgot Password] Email {email} not found in database. Returning generic response.")
        return jsonify({'success': True, 'message': generic_msg}), 200

    # Invalidate previous unused reset tokens for this user
    PasswordResetToken.query.filter_by(user_id=user.id, used=False).update({'used': True})

    # Generate a cryptographically secure token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=30)

    reset_record = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=expires_at,
        used=False
    )
    db.session.add(reset_record)
    db.session.commit()

    # Build reset link using configured FRONTEND_URL
    frontend_url = os.getenv('FRONTEND_URL', 'https://localhost:5173').rstrip('/')
    reset_url = f"{frontend_url}/reset-password/{token}"

    print(f">> [Forgot Password] Generated reset token for {user.email}: {reset_url} (Expires: {expires_at})")

    # Send real email via SMTP
    email_sent, email_err = send_password_reset_email(user.email, user.name, reset_url)

    resp_payload = {
        'success': True,
        'message': generic_msg,
        'email_sent': email_sent
    }
    if not email_sent:
        resp_payload['dev_reset_url'] = reset_url
        resp_payload['smtp_error'] = email_err

    return jsonify(resp_payload), 200

@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    from datetime import datetime
    from models import PasswordResetToken

    data = request.get_json() or {}
    token = data.get('token', '').strip()
    new_password = data.get('password', '').strip()

    if not token or not new_password:
        return jsonify({'success': False, 'message': 'Reset token and new password are required.'}), 400

    if len(new_password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters long.'}), 400

    # Look up token
    token_record = PasswordResetToken.query.filter_by(token=token).first()
    if not token_record or not token_record.is_valid():
        return jsonify({
            'success': False,
            'message': 'This password reset link is invalid or has expired. Please request a new one.'
        }), 400

    user = User.query.get(token_record.user_id)
    if not user:
        return jsonify({'success': False, 'message': 'User associated with this reset link was not found.'}), 404

    # Update password hash
    user.password_hash = generate_password_hash(new_password)
    token_record.used = True
    db.session.commit()

    print(f">> [Reset Password Success] Password successfully reset for user: {user.email}")
    return jsonify({
        'success': True,
        'message': 'Your password has been successfully reset! You can now sign in with your new password.'
    }), 200

