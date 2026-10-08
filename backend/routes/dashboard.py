from flask import Blueprint, jsonify
from extensions import db
from models import User, Team, Meeting, MeetingParticipant, Task
from utils.auth import token_required
from utils.effectiveness import calculate_meeting_effectiveness

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/stats', methods=['GET'])
@token_required
def get_dashboard_stats(current_user):
    team_id = current_user.team_id
    if not team_id:
        return jsonify({
            'success': True,
            'role': current_user.role,
            'has_team': False,
            'stats': {},
            'message': 'No team assigned yet'
        }), 200

    team = Team.query.filter_by(team_id=team_id).first()
    
    if current_user.role == 'leader':
        # Team Leader Stats
        total_members = User.query.filter_by(team_id=team_id).count()
        total_meetings = Meeting.query.filter_by(team_id=team_id).count()
        live_meetings = Meeting.query.filter_by(team_id=team_id, status='live').count()
        scheduled_meetings = Meeting.query.filter_by(team_id=team_id, status='scheduled').count()
        completed_meetings = Meeting.query.filter_by(team_id=team_id, status='completed').all()

        # Compute average effectiveness score across completed meetings
        effectiveness_scores = []
        for m in completed_meetings:
            eff = calculate_meeting_effectiveness(m)
            effectiveness_scores.append(eff['score'])
        avg_effectiveness = int(sum(effectiveness_scores) / len(effectiveness_scores)) if effectiveness_scores else 80

        # Task counts across the team
        from sqlalchemy import or_
        team_users = User.query.filter_by(team_id=team_id).all()
        team_user_ids = [u.id for u in team_users]

        team_meetings = Meeting.query.filter_by(team_id=team_id).all()
        meeting_ids = [m.meeting_id for m in team_meetings]

        all_team_tasks = Task.query.filter(
            or_(
                Task.assigned_to.in_(team_user_ids),
                Task.assigned_by == current_user.id,
                Task.meeting_id.in_(meeting_ids)
            ),
            Task.status != 'suggested'
        ).order_by(Task.created_at.desc()).all()
        
        total_tasks = len(all_team_tasks)
        completed_tasks = sum(1 for t in all_team_tasks if t.status == 'completed')
        pending_tasks = sum(1 for t in all_team_tasks if t.status in ['pending', 'assigned'])
        review_tasks = sum(1 for t in all_team_tasks if t.status in ['submitted', 'under_review'])
        in_progress_tasks = sum(1 for t in all_team_tasks if t.status == 'in_progress')

        # Risk distribution calculation
        risk_dist = {'high': 0, 'medium': 0, 'low': 0, 'completed': completed_tasks}
        for t in all_team_tasks:
            t_dict = t.to_dict()
            risk_lvl = t_dict.get('risk', {}).get('level', 'Low').lower()
            if risk_lvl == 'high':
                risk_dist['high'] += 1
            elif risk_lvl == 'medium':
                risk_dist['medium'] += 1
            elif risk_lvl == 'low':
                risk_dist['low'] += 1

        # Recent members in team
        recent_members = User.query.filter_by(team_id=team_id).order_by(User.created_at.desc()).limit(5).all()
        members_data = [m.to_dict() for m in recent_members]

        # Recent meetings with effectiveness data
        recent_meetings_data = []
        for m in team_meetings[:5]:
            m_dict = m.to_dict()
            m_dict['effectiveness'] = calculate_meeting_effectiveness(m)
            recent_meetings_data.append(m_dict)

        return jsonify({
            'success': True,
            'role': 'leader',
            'has_team': True,
            'team': team.to_dict() if team else None,
            'stats': {
                'total_members': total_members,
                'total_meetings': total_meetings,
                'live_meetings': live_meetings,
                'scheduled_meetings': scheduled_meetings,
                'completed_meetings': len(completed_meetings),
                'total_tasks': total_tasks,
                'completed_tasks': completed_tasks,
                'pending_tasks': pending_tasks,
                'in_progress_tasks': in_progress_tasks,
                'review_tasks': review_tasks,
                'avg_effectiveness': avg_effectiveness,
                'risk_distribution': risk_dist
            },
            'recent_members': members_data,
            'recent_meetings': recent_meetings_data,
            'recent_tasks': [t.to_dict() for t in all_team_tasks[:5]]
        }), 200

    else:
        # Employee Dashboard Stats
        my_tasks = Task.query.filter(
            Task.assigned_to == current_user.id,
            Task.status != 'suggested'
        ).order_by(Task.created_at.desc()).all()
        
        assigned_tasks_count = len(my_tasks)
        completed_tasks_count = sum(1 for t in my_tasks if t.status == 'completed')
        pending_tasks_count = sum(1 for t in my_tasks if t.status in ['pending', 'assigned'])
        in_progress_count = sum(1 for t in my_tasks if t.status == 'in_progress')
        submitted_count = sum(1 for t in my_tasks if t.status in ['submitted', 'under_review'])

        # Risk distribution for employee's own tasks
        risk_dist = {'high': 0, 'medium': 0, 'low': 0, 'completed': completed_tasks_count}
        for t in my_tasks:
            t_dict = t.to_dict()
            risk_lvl = t_dict.get('risk', {}).get('level', 'Low').lower()
            if risk_lvl == 'high':
                risk_dist['high'] += 1
            elif risk_lvl == 'medium':
                risk_dist['medium'] += 1
            elif risk_lvl == 'low':
                risk_dist['low'] += 1

        # Attended/Invited meetings
        participations = MeetingParticipant.query.filter_by(user_id=current_user.id).all()
        meeting_count = len(participations)

        return jsonify({
            'success': True,
            'role': 'employee',
            'has_team': True,
            'team': team.to_dict() if team else None,
            'stats': {
                'assigned_tasks': assigned_tasks_count,
                'completed_tasks': completed_tasks_count,
                'pending_tasks': pending_tasks_count,
                'in_progress_tasks': in_progress_count,
                'submitted_tasks': submitted_count,
                'joined_meetings': meeting_count,
                'risk_distribution': risk_dist
            },
            'my_tasks': [t.to_dict() for t in my_tasks[:5]],
            'upcoming_meetings': []
        }), 200
