from datetime import datetime
from extensions import db
import uuid

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=True)  # Nullable for Google OAuth users
    auth_provider = db.Column(db.String(30), nullable=False, default='local')  # 'local' or 'google'
    google_id = db.Column(db.String(120), nullable=True, index=True)
    role = db.Column(db.String(20), nullable=False, default='employee')  # 'leader' or 'employee'
    team_id = db.Column(db.String(64), nullable=True, index=True)  # custom team identifier / code
    profile_image = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, name=None, email=None, password_hash=None, auth_provider='local', google_id=None, role='employee', team_id=None, profile_image=None, created_at=None, **kwargs):
        self.name = name
        self.email = email
        self.password_hash = password_hash
        self.auth_provider = auth_provider
        self.google_id = google_id
        self.role = role
        self.team_id = team_id
        self.profile_image = profile_image
        if created_at is not None:
            self.created_at = created_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'team_id': self.team_id,
            'auth_provider': self.auth_provider,
            'profile_image': self.profile_image,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Team(db.Model):
    __tablename__ = 'teams'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(db.String(64), unique=True, nullable=False, index=True)  # unique join code e.g. TEAM-XXXX
    team_name = db.Column(db.String(120), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, team_id=None, team_name=None, created_by=None, created_at=None, **kwargs):
        self.team_id = team_id
        self.team_name = team_name
        self.created_by = created_by
        if created_at is not None:
            self.created_at = created_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        return {
            'id': self.id,
            'team_id': self.team_id,
            'team_name': self.team_name,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Meeting(db.Model):
    __tablename__ = 'meetings'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(db.String(64), unique=True, nullable=False, index=True)  # e.g. MEET-XXXX
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    agenda = db.Column(db.Text, nullable=True)
    team_id = db.Column(db.String(64), nullable=False, index=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    start_time = db.Column(db.DateTime, nullable=True)
    end_time = db.Column(db.DateTime, nullable=True)
    duration = db.Column(db.Integer, nullable=True)  # duration in minutes
    status = db.Column(db.String(30), default='scheduled')  # 'scheduled', 'live', 'completed', 'cancelled'
    transcript = db.Column(db.Text, nullable=True)
    summary = db.Column(db.Text, nullable=True)
    effectiveness_score = db.Column(db.Float, nullable=True)
    recording_reference = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, meeting_id=None, title=None, description=None, agenda=None, team_id=None, created_by=None, start_time=None, end_time=None, duration=None, status='scheduled', transcript=None, summary=None, effectiveness_score=None, recording_reference=None, created_at=None, **kwargs):
        self.meeting_id = meeting_id
        self.title = title
        self.description = description
        self.agenda = agenda
        self.team_id = team_id
        self.created_by = created_by
        self.start_time = start_time
        self.end_time = end_time
        self.duration = duration
        self.status = status
        self.transcript = transcript
        self.summary = summary
        self.effectiveness_score = effectiveness_score
        self.recording_reference = recording_reference
        if created_at is not None:
            self.created_at = created_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        return {
            'id': self.id,
            'meeting_id': self.meeting_id,
            'title': self.title,
            'description': self.description,
            'agenda': self.agenda,
            'team_id': self.team_id,
            'created_by': self.created_by,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'duration': self.duration,
            'status': self.status,
            'transcript': self.transcript,
            'summary': self.summary,
            'effectiveness_score': self.effectiveness_score,
            'recording_reference': self.recording_reference,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class MeetingParticipant(db.Model):
    __tablename__ = 'meeting_participants'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(db.String(64), db.ForeignKey('meetings.meeting_id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    invitation_status = db.Column(db.String(30), default='invited')  # 'invited', 'accepted', 'declined'
    attendance_status = db.Column(db.String(30), default='absent')  # 'present', 'absent'
    joined_at = db.Column(db.DateTime, nullable=True)
    left_at = db.Column(db.DateTime, nullable=True)

    def __init__(self, meeting_id=None, user_id=None, invitation_status='invited', attendance_status='absent', joined_at=None, left_at=None, **kwargs):
        self.meeting_id = meeting_id
        self.user_id = user_id
        self.invitation_status = invitation_status
        self.attendance_status = attendance_status
        self.joined_at = joined_at
        self.left_at = left_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        return {
            'id': self.id,
            'meeting_id': self.meeting_id,
            'user_id': self.user_id,
            'invitation_status': self.invitation_status,
            'attendance_status': self.attendance_status,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
            'left_at': self.left_at.isoformat() if self.left_at else None
        }

class Task(db.Model):
    __tablename__ = 'tasks'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(db.String(64), nullable=True, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    assigned_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    priority = db.Column(db.String(20), default='Medium')  # 'Low', 'Medium', 'High', 'Urgent'
    deadline = db.Column(db.DateTime, nullable=True)
    estimated_duration = db.Column(db.String(64), nullable=True)
    progress = db.Column(db.Integer, default=0)  # 0 to 100
    status = db.Column(db.String(30), default='pending')  # 'pending', 'in_progress', 'under_review', 'completed', 'rejected'
    rejection_feedback = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __init__(self, meeting_id=None, title=None, description=None, assigned_to=None, assigned_by=None, priority='Medium', deadline=None, estimated_duration=None, progress=0, status='pending', rejection_feedback=None, created_at=None, updated_at=None, **kwargs):
        self.meeting_id = meeting_id
        self.title = title
        self.description = description
        self.assigned_to = assigned_to
        self.assigned_by = assigned_by
        self.priority = priority
        self.deadline = deadline
        self.estimated_duration = estimated_duration
        self.progress = progress
        self.status = status
        self.rejection_feedback = rejection_feedback
        if created_at is not None:
            self.created_at = created_at
        if updated_at is not None:
            self.updated_at = updated_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        try:
            from utils.risk import calculate_task_risk
            risk_info = calculate_task_risk(self)
        except Exception:
            risk_info = {'level': 'Low', 'label': 'Low Risk', 'color': '#10b981', 'reason': ''}

        assignee_name = None
        assignee_email = None
        if self.assigned_to:
            assignee_user = User.query.get(self.assigned_to)
            if assignee_user:
                assignee_name = assignee_user.name
                assignee_email = assignee_user.email

        return {
            'id': self.id,
            'meeting_id': self.meeting_id,
            'title': self.title,
            'description': self.description,
            'assigned_to': self.assigned_to,
            'assigned_to_name': assignee_name,
            'assignee_name': assignee_name,
            'assignee_email': assignee_email,
            'assigned_by': self.assigned_by,
            'priority': self.priority,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'estimated_duration': self.estimated_duration,
            'progress': self.progress,
            'status': self.status,
            'rejection_feedback': self.rejection_feedback,
            'risk': risk_info,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class Decision(db.Model):
    __tablename__ = 'decisions'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(db.String(64), db.ForeignKey('meetings.meeting_id', ondelete='CASCADE'), nullable=False, index=True)
    decision_text = db.Column(db.Text, nullable=False)
    reason = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, meeting_id=None, decision_text=None, reason=None, created_at=None, **kwargs):
        self.meeting_id = meeting_id
        self.decision_text = decision_text
        self.reason = reason
        if created_at is not None:
            self.created_at = created_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        return {
            'id': self.id,
            'meeting_id': self.meeting_id,
            'decision_text': self.decision_text,
            'reason': self.reason,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Notification(db.Model):
    __tablename__ = 'notifications'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    meeting_id = db.Column(db.String(64), nullable=True)
    task_id = db.Column(db.Integer, nullable=True)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(30), default='info')  # 'meeting', 'task', 'system', 'reminder', 'message'
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, user_id=None, meeting_id=None, task_id=None, message=None, type='info', is_read=False, created_at=None, **kwargs):
        self.user_id = user_id
        self.meeting_id = meeting_id
        self.task_id = task_id
        self.message = message
        self.type = type
        self.is_read = is_read
        if created_at is not None:
            self.created_at = created_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'meeting_id': self.meeting_id,
            'task_id': self.task_id,
            'message': self.message,
            'type': self.type,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class PasswordResetToken(db.Model):
    __tablename__ = 'password_reset_tokens'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, user_id=None, token=None, expires_at=None, used=False, created_at=None, **kwargs):
        self.user_id = user_id
        self.token = token
        self.expires_at = expires_at
        self.used = used
        if created_at is not None:
            self.created_at = created_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def is_valid(self):
        return not self.used and self.expires_at > datetime.utcnow()

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'token': self.token,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'used': self.used,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    message_text = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, sender_id=None, receiver_id=None, message_text=None, is_read=False, created_at=None, **kwargs):
        self.sender_id = sender_id
        self.receiver_id = receiver_id
        self.message_text = message_text
        self.is_read = is_read
        if created_at is not None:
            self.created_at = created_at
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        sender = User.query.get(self.sender_id)
        receiver = User.query.get(self.receiver_id)
        return {
            'id': self.id,
            'sender_id': self.sender_id,
            'sender_name': sender.name if sender else 'Unknown',
            'sender_role': sender.role if sender else 'user',
            'receiver_id': self.receiver_id,
            'receiver_name': receiver.name if receiver else 'Unknown',
            'receiver_role': receiver.role if receiver else 'user',
            'message_text': self.message_text,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class EmailReminderLog(db.Model):
    __tablename__ = 'email_reminders_log'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    recipient_email = db.Column(db.String(120), nullable=True)
    subject = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(30), default='sent')  # 'sent', 'failed'

    def __init__(self, task_id=None, sent_at=None, recipient_email=None, subject=None, status='sent', **kwargs):
        self.task_id = task_id
        if sent_at is not None:
            self.sent_at = sent_at
        self.recipient_email = recipient_email
        self.subject = subject
        self.status = status
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'recipient_email': self.recipient_email,
            'subject': self.subject,
            'status': self.status
        }
