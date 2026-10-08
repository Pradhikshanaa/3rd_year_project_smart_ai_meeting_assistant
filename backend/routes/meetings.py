import re
import difflib
from datetime import datetime
from flask import Blueprint, request, jsonify
from extensions import db
from models import Meeting, MeetingParticipant, Notification, User, Team
from utils.auth import token_required, leader_required

meetings_bp = Blueprint('meetings', __name__)

def find_best_member_match(assigned_name, team_members):
    if not assigned_name or str(assigned_name).strip().lower() in ['not mentioned', 'none', 'null', '', 'unassigned']:
        return None
    
    clean_target = re.sub(r'\s*\([^)]*\)', '', str(assigned_name)).strip().lower()
    if not clean_target:
        return None

    # 1. Exact match
    for m in team_members:
        if m.name.strip().lower() == clean_target:
            return m

    # 2. Token / word exact match (e.g. 'Shalini' matches 'shalini s' or 's. shalini')
    target_words = [w for w in re.findall(r'\w+', clean_target) if len(w) > 1]
    for m in team_members:
        m_words = [w for w in re.findall(r'\w+', m.name.lower()) if len(w) > 1]
        if any(w in m_words for w in target_words):
            return m

    # 3. Substring match
    for m in team_members:
        m_clean = m.name.strip().lower()
        if clean_target in m_clean or m_clean in clean_target:
            return m

    # 4. Prefix match (e.g. 'rasitha' in 'rasithabanu')
    for m in team_members:
        m_clean = m.name.strip().lower()
        if (len(clean_target) >= 4 and m_clean.startswith(clean_target)) or (len(m_clean) >= 4 and clean_target.startswith(m_clean)):
            return m

    # 5. Email matching (e.g. 'sivakumarshalini05' or 'rrasidhabanu')
    for m in team_members:
        if m.email:
            email_user = m.email.split('@')[0].lower()
            if any(w in email_user for w in target_words if len(w) >= 3):
                return m

    # 6. Fuzzy similarity
    best_score = 0.0
    best_m = None
    for m in team_members:
        ratio = difflib.SequenceMatcher(None, clean_target, m.name.lower()).ratio()
        if ratio > best_score and ratio >= 0.6:
            best_score = ratio
            best_m = m

    return best_m

def generate_meeting_id():
    total_meetings = Meeting.query.count()
    return f"MTG{total_meetings + 1:03d}"

@meetings_bp.route('', methods=['POST'])
@token_required
def create_meeting(current_user):
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    agenda = data.get('agenda', '').strip()
    start_time_str = data.get('start_time')
    duration = data.get('duration', 30)
    participant_ids = data.get('participant_ids', [])

    if not title:
        return jsonify({'success': False, 'message': 'Meeting title is required'}), 400

    if not current_user.team_id:
        return jsonify({'success': False, 'message': 'You must belong to a team to create meetings'}), 400

    # Parse start_time
    start_time = None
    if start_time_str:
        try:
            start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        except Exception:
            start_time = datetime.utcnow()
    else:
        start_time = datetime.utcnow()

    # Generate unique Meeting ID
    meeting_id = generate_meeting_id()
    while Meeting.query.filter_by(meeting_id=meeting_id).first():
        num = int(meeting_id.replace('MTG', '')) + 1
        meeting_id = f"MTG{num:03d}"

    # Create meeting
    meeting = Meeting(
        meeting_id=meeting_id,
        title=title,
        description=description,
        agenda=agenda,
        team_id=current_user.team_id,
        created_by=current_user.id,
        start_time=start_time,
        duration=int(duration) if duration else 30,
        status='scheduled'
    )
    db.session.add(meeting)
    db.session.flush()

    # Add host as participant
    host_participant = MeetingParticipant(
        meeting_id=meeting_id,
        user_id=current_user.id,
        invitation_status='accepted',
        attendance_status='absent'
    )
    db.session.add(host_participant)

    # Validate and add invited participants (must be from the same team)
    valid_participants = []
    if participant_ids:
        team_members = User.query.filter(
            User.id.in_(participant_ids),
            User.team_id == current_user.team_id
        ).all()

        for member in team_members:
            if member.id != current_user.id:
                mp = MeetingParticipant(
                    meeting_id=meeting_id,
                    user_id=member.id,
                    invitation_status='invited',
                    attendance_status='absent'
                )
                db.session.add(mp)
                valid_participants.append(member)

                # Create in-app Notification for each invited user
                notification = Notification(
                    user_id=member.id,
                    meeting_id=meeting_id,
                    message=f"You have been invited by {current_user.name} to meeting: {title}",
                    type='meeting'
                )
                db.session.add(notification)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Meeting {meeting_id} created successfully',
        'meeting': meeting.to_dict(),
        'invited_count': len(valid_participants)
    }), 201

@meetings_bp.route('', methods=['GET'])
@token_required
def get_meetings(current_user):
    if not current_user.team_id:
        return jsonify({'success': True, 'meetings': []}), 200

    status_filter = request.args.get('status')
    
    # Query meetings of the user's team
    query = Meeting.query.filter_by(team_id=current_user.team_id)

    if status_filter:
        query = query.filter_by(status=status_filter)

    meetings = query.order_by(Meeting.created_at.desc()).all()
    results = []

    for m in meetings:
        m_dict = m.to_dict()
        
        # Get creator name
        creator = User.query.get(m.created_by)
        m_dict['creator_name'] = creator.name if creator else 'Unknown Host'
        
        # Get participant counts & statuses
        participants = MeetingParticipant.query.filter_by(meeting_id=m.meeting_id).all()
        m_dict['total_participants'] = len(participants)
        
        # User's own status in this meeting
        user_part = next((p for p in participants if p.user_id == current_user.id), None)
        m_dict['my_invitation_status'] = user_part.invitation_status if user_part else 'not_invited'
        m_dict['my_attendance_status'] = user_part.attendance_status if user_part else 'absent'
        m_dict['is_host'] = (m.created_by == current_user.id)

        results.append(m_dict)

    return jsonify({
        'success': True,
        'meetings': results,
        'count': len(results)
    }), 200

@meetings_bp.route('/<meeting_id>', methods=['GET'])
@token_required
def get_meeting_details(current_user, meeting_id):
    meeting = Meeting.query.filter_by(meeting_id=meeting_id).first()
    if not meeting:
        return jsonify({'success': False, 'message': f'Meeting {meeting_id} not found'}), 404

    if meeting.team_id != current_user.team_id:
        return jsonify({'success': False, 'message': 'Unauthorized access to meeting outside your team'}), 403

    creator = User.query.get(meeting.created_by)
    participants_query = db.session.query(MeetingParticipant, User).join(
        User, MeetingParticipant.user_id == User.id
    ).filter(MeetingParticipant.meeting_id == meeting_id).all()

    participants_data = []
    for mp, user in participants_query:
        participants_data.append({
            'user_id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role,
            'invitation_status': mp.invitation_status,
            'attendance_status': mp.attendance_status,
            'joined_at': mp.joined_at.isoformat() if mp.joined_at else None
        })

    meeting_dict = meeting.to_dict()
    meeting_dict['creator_name'] = creator.name if creator else 'Unknown Host'
    meeting_dict['is_host'] = (meeting.created_by == current_user.id)

    try:
        from utils.effectiveness import calculate_meeting_effectiveness
        effectiveness_data = calculate_meeting_effectiveness(meeting)
    except Exception as e:
        print(f">> [Effectiveness Calc Error]: {e}")
        effectiveness_data = {
            'score': meeting.effectiveness_score or 70,
            'grade': 'Good',
            'badge_color': '#3b82f6',
            'badge_class': 'badge-primary',
            'summary_text': 'Meeting outcomes tracked.',
            'breakdown': {},
            'suggestions': []
        }
    meeting_dict['effectiveness'] = effectiveness_data

    return jsonify({
        'success': True,
        'meeting': meeting_dict,
        'participants': participants_data
    }), 200

@meetings_bp.route('/<meeting_id>/status', methods=['PATCH'])
@token_required
def update_meeting_status(current_user, meeting_id):
    meeting = Meeting.query.filter_by(meeting_id=meeting_id).first()
    if not meeting:
        return jsonify({'success': False, 'message': f'Meeting {meeting_id} not found'}), 404

    # Only host / leader can change meeting status
    if meeting.created_by != current_user.id and current_user.role != 'leader':
        return jsonify({'success': False, 'message': 'Only the meeting host can change meeting status'}), 403

    data = request.get_json() or {}
    new_status = data.get('status')
    if new_status not in ['scheduled', 'live', 'completed', 'cancelled']:
        return jsonify({'success': False, 'message': 'Invalid status'}), 400

    meeting.status = new_status
    if new_status == 'live' and not meeting.start_time:
        meeting.start_time = datetime.utcnow()
    elif new_status == 'completed':
        meeting.end_time = datetime.utcnow()

    db.session.commit()
    return jsonify({
        'success': True,
        'message': f'Meeting status updated to {new_status}',
        'meeting': meeting.to_dict()
    }), 200

@meetings_bp.route('/<meeting_id>/rsvp', methods=['PATCH'])
@token_required
def rsvp_meeting(current_user, meeting_id):
    participant = MeetingParticipant.query.filter_by(
        meeting_id=meeting_id,
        user_id=current_user.id
    ).first()

    if not participant:
        return jsonify({'success': False, 'message': 'You are not on the invite list for this meeting'}), 404

    data = request.get_json() or {}
    status = data.get('status')
    if status not in ['accepted', 'declined']:
        return jsonify({'success': False, 'message': 'RSVP status must be accepted or declined'}), 400

    participant.invitation_status = status
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Invitation {status}',
        'invitation_status': status
    }), 200

@meetings_bp.route('/<meeting_id>/join', methods=['POST'])
@token_required
def join_meeting_session(current_user, meeting_id):
    meeting = Meeting.query.filter_by(meeting_id=meeting_id).first()
    if not meeting:
        return jsonify({'success': False, 'message': f'Meeting {meeting_id} not found'}), 404

    if meeting.team_id != current_user.team_id:
        return jsonify({'success': False, 'message': 'Unauthorized access to meeting outside your team'}), 403

    # If meeting was scheduled and host joins, auto-transition to live
    if meeting.status == 'scheduled' and (meeting.created_by == current_user.id or current_user.role == 'leader'):
        meeting.status = 'live'
        if not meeting.start_time:
            meeting.start_time = datetime.utcnow()

    participant = MeetingParticipant.query.filter_by(
        meeting_id=meeting_id,
        user_id=current_user.id
    ).first()

    if not participant:
        participant = MeetingParticipant(
            meeting_id=meeting_id,
            user_id=current_user.id,
            invitation_status='accepted',
            attendance_status='present',
            joined_at=datetime.utcnow()
        )
        db.session.add(participant)
    else:
        participant.attendance_status = 'present'
        if not participant.joined_at:
            participant.joined_at = datetime.utcnow()

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Joined meeting {meeting_id}',
        'meeting': meeting.to_dict(),
        'participant': participant.to_dict()
    }), 200

@meetings_bp.route('/<meeting_id>/leave', methods=['POST'])
@token_required
def leave_meeting_session(current_user, meeting_id):
    participant = MeetingParticipant.query.filter_by(
        meeting_id=meeting_id,
        user_id=current_user.id
    ).first()

    if participant:
        participant.attendance_status = 'left'
        participant.left_at = datetime.utcnow()
        db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Left meeting {meeting_id}'
    }), 200

@meetings_bp.route('/<meeting_id>/transcript', methods=['POST'])
@token_required
def save_meeting_transcript(current_user, meeting_id):
    meeting = Meeting.query.filter_by(meeting_id=meeting_id).first()
    if not meeting:
        return jsonify({'success': False, 'message': f'Meeting {meeting_id} not found'}), 404

    data = request.get_json() or {}
    transcript = data.get('transcript', '').strip()
    if not transcript:
        return jsonify({'success': False, 'message': 'Transcript text is required'}), 400

    meeting.transcript = transcript
    db.session.commit()

    print(f">> [Spoken Transcript Saved] Meeting {meeting_id}: {len(transcript)} chars")

    return jsonify({
        'success': True,
        'message': 'Spoken transcript saved successfully',
        'transcript': meeting.transcript,
        'meeting': meeting.to_dict()
    }), 200

@meetings_bp.route('/<meeting_id>/end', methods=['POST'])
@token_required
def end_meeting_session(current_user, meeting_id):
    meeting = Meeting.query.filter_by(meeting_id=meeting_id).first()
    if not meeting:
        return jsonify({'success': False, 'message': f'Meeting {meeting_id} not found'}), 404

    if meeting.created_by != current_user.id and current_user.role != 'leader':
        return jsonify({'success': False, 'message': 'Only the host or team leader can end the meeting'}), 403

    data = request.get_json() or {}
    transcript = data.get('transcript', '').strip()
    if transcript:
        meeting.transcript = transcript
        print(f">> [Meeting End] Saved transcript for {meeting_id}: {len(transcript)} chars")

    meeting.status = 'completed'
    meeting.end_time = datetime.utcnow()
    if meeting.start_time:
        duration_delta = meeting.end_time - meeting.start_time
        meeting.duration = max(1, int(duration_delta.total_seconds() / 60))

    # Mark all currently present participants as left
    present_participants = MeetingParticipant.query.filter_by(
        meeting_id=meeting_id,
        attendance_status='present'
    ).all()
    for p in present_participants:
        p.attendance_status = 'left'
        if not p.left_at:
            p.left_at = datetime.utcnow()

    db.session.commit()

    # Emit meeting-ended event to socket room
    try:
        from extensions import socketio
        socketio.emit('meeting-ended', {'meeting_id': meeting_id}, to=meeting_id)
    except Exception as e:
        print(f">> Notice: Could not broadcast meeting-ended socket event: {e}")

    return jsonify({
        'success': True,
        'message': f'Meeting {meeting_id} has been ended and marked completed',
        'meeting': meeting.to_dict()
    }), 200

@meetings_bp.route('/<meeting_id>/analyze', methods=['POST'])
@token_required
def analyze_meeting(current_user, meeting_id):
    import json
    from models import Decision, Task
    from services.gemini_service import analyze_meeting_transcript

    meeting = Meeting.query.filter_by(meeting_id=meeting_id).first()
    if not meeting:
        return jsonify({'success': False, 'message': f'Meeting {meeting_id} not found'}), 404

    data = request.get_json() or {}
    incoming_transcript = data.get('transcript', '').strip()

    if incoming_transcript:
        meeting.transcript = incoming_transcript
        db.session.commit()

    transcript_to_analyze = incoming_transcript or meeting.transcript

    if not transcript_to_analyze or not transcript_to_analyze.strip():
        return jsonify({
            'success': False,
            'message': 'No spoken transcript available to analyze. Please ensure spoken dialogue was captured during the meeting or provide a transcript text.',
            'step': 'validation'
        }), 400

    # Extract structured analysis from transcript via Gemini
    team_members = User.query.filter_by(team_id=meeting.team_id).all()
    team_members_names = [m.name for m in team_members]

    print(f">> [Gemini Intelligence Analysis] Analyzing transcript for meeting '{meeting.title}' ({len(transcript_to_analyze)} chars, Team: {team_members_names})...")
    try:
        analysis_result = analyze_meeting_transcript(
            transcript=transcript_to_analyze,
            meeting_title=meeting.title,
            team_members_names=team_members_names
        )
        print(f">> [Gemini Intelligence Success] Summary: {analysis_result.get('summary', '')[:120]}...")
    except Exception as e:
        print(f">> [Gemini Analysis Error]: {e}")
        return jsonify({
            'success': False,
            'message': f'Gemini Intelligence Analysis Error: {str(e)}',
            'step': 'analysis'
        }), 500

    # Update meeting fields in MySQL
    summary_data = {
        'summary': analysis_result.get('summary', 'No summary generated.'),
        'key_points': analysis_result.get('key_points', []),
        'risks': analysis_result.get('risks', []),
        'next_meeting_date': analysis_result.get('next_meeting_date', 'Not Mentioned')
    }
    meeting.summary = json.dumps(summary_data)
    meeting.effectiveness_score = analysis_result.get('effectiveness_score', 0.0)

    # Store decisions in MySQL decisions table
    raw_decisions = analysis_result.get('decisions', [])
    # Clear prior decisions for this meeting if re-running analysis
    Decision.query.filter_by(meeting_id=meeting_id).delete()

    created_decisions = []
    for d in raw_decisions:
        dec_text = d.get('decision_text', '').strip()
        if dec_text and dec_text.lower() != 'not mentioned':
            dec_entry = Decision(
                meeting_id=meeting_id,
                decision_text=dec_text,
                reason=d.get('reason', 'Not Mentioned')
            )
            db.session.add(dec_entry)
            created_decisions.append(dec_entry)

    # Pre-create/Match tasks in tasks table for Phase 6 workflow
    raw_tasks = analysis_result.get('tasks', [])
    Task.query.filter_by(meeting_id=meeting_id).delete()

    for t in raw_tasks:
        task_title = t.get('title', '').strip()
        if task_title and task_title.lower() != 'not mentioned':
            # Intelligent match assigned user ID from team members
            raw_assigned_name = t.get('assigned_to_name', '')
            assigned_user = find_best_member_match(raw_assigned_name, team_members)
            if assigned_user:
                print(f">> [Task Assignee Match] '{raw_assigned_name}' -> User ID {assigned_user.id} ({assigned_user.name})")
            else:
                print(f">> [Task Assignee Notice] '{raw_assigned_name}' could not be matched to team roster; left unassigned.")
            
            deadline_val = None
            raw_deadline = t.get('deadline', '')
            if raw_deadline and str(raw_deadline).strip().lower() not in ['not mentioned', 'none', 'null', '']:
                try:
                    clean_d = str(raw_deadline).strip()
                    if len(clean_d) == 10 and clean_d.count('-') == 2:
                        deadline_val = datetime.strptime(clean_d, '%Y-%m-%d')
                    else:
                        deadline_val = datetime.fromisoformat(clean_d.replace('Z', '+00:00'))
                except Exception as dErr:
                    print(f">> [Gemini Task Deadline Parse Warning]: {dErr}")

            task_entry = Task(
                meeting_id=meeting_id,
                title=task_title,
                description=t.get('description', ''),
                assigned_to=assigned_user.id if assigned_user else None,
                assigned_by=meeting.created_by,
                priority=t.get('priority', 'Medium'),
                deadline=deadline_val,
                estimated_duration=t.get('estimated_duration', 'Not Mentioned'),
                progress=0,
                status='suggested'
            )
            db.session.add(task_entry)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Meeting transcription and Gemini analysis completed successfully',
        'meeting': meeting.to_dict(),
        'analysis': analysis_result,
        'decisions_count': len(created_decisions),
        'tasks_count': len(raw_tasks)
    }), 200

@meetings_bp.route('/<meeting_id>/suggested-tasks', methods=['GET'])
@token_required
def get_meeting_suggested_tasks(current_user, meeting_id):
    from models import Task, User
    tasks = Task.query.filter_by(meeting_id=meeting_id, status='suggested').all()
    results = []
    for t in tasks:
        t_dict = t.to_dict()
        if t.assigned_to:
            u = User.query.get(t.assigned_to)
            t_dict['assignee_name'] = u.name if u else 'Unknown Member'
        else:
            t_dict['assignee_name'] = 'Unassigned'
        results.append(t_dict)

    return jsonify({
        'success': True,
        'tasks': results,
        'count': len(results)
    }), 200

@meetings_bp.route('/<meeting_id>/decisions', methods=['GET'])
@token_required
def get_meeting_decisions(current_user, meeting_id):
    from models import Decision
    decisions = Decision.query.filter_by(meeting_id=meeting_id).order_by(Decision.created_at.asc()).all()
    return jsonify({
        'success': True,
        'decisions': [d.to_dict() for d in decisions],
        'count': len(decisions)
    }), 200

@meetings_bp.route('/<meeting_id>/audio', methods=['GET'])
def get_meeting_audio(meeting_id):
    from flask import send_file
    meeting = Meeting.query.filter_by(meeting_id=meeting_id).first()
    if not meeting or not meeting.recording_reference:
        return jsonify({'success': False, 'message': 'No audio recording found'}), 404

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, meeting.recording_reference)
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'message': 'Audio file not found on disk'}), 404

    return send_file(file_path, mimetype='audio/webm')

@meetings_bp.route('/<meeting_id>/transcribe-audio', methods=['POST'])
@token_required
def transcribe_audio_chunk(current_user, meeting_id):
    import time
    if 'audio' not in request.files:
        return jsonify({'success': False, 'message': 'No audio file provided in request'}), 400

    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({'success': False, 'message': 'Empty audio file'}), 400

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    upload_dir = os.path.join(base_dir, 'instance', 'temp_audio')
    os.makedirs(upload_dir, exist_ok=True)

    temp_filename = f"chunk_{meeting_id}_{int(time.time() * 1000)}.webm"
    temp_path = os.path.join(upload_dir, temp_filename)
    audio_file.save(temp_path)

    try:
        from services.gemini_service import transcribe_audio_file
        transcript = transcribe_audio_file(temp_path)

        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

        return jsonify({
            'success': True,
            'transcript': transcript or '',
            'message': 'Audio transcribed successfully'
        }), 200
    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        print(f">> [Audio Transcription Chunk Error]: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


