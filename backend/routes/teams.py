from flask import Blueprint, jsonify
from extensions import db
from models import User, Team
from utils.auth import token_required

teams_bp = Blueprint('teams', __name__)

@teams_bp.route('/my-team', methods=['GET'])
@token_required
def get_my_team(current_user):
    if not current_user.team_id:
        return jsonify({'success': False, 'message': 'You are not currently assigned to any team'}), 404

    team = Team.query.filter_by(team_id=current_user.team_id).first()
    if not team:
        return jsonify({'success': False, 'message': 'Team not found in records'}), 404

    # Fetch leader info
    leader = None
    if team.created_by:
        leader_user = User.query.get(team.created_by)
        if leader_user:
            leader = {
                'id': leader_user.id,
                'name': leader_user.name,
                'email': leader_user.email,
                'role': leader_user.role,
                'created_at': leader_user.created_at.isoformat() if leader_user.created_at else None
            }
    
    # If no leader_user found via created_by, fallback to user with role='leader' in the team
    if not leader:
        first_leader = User.query.filter_by(team_id=current_user.team_id, role='leader').first()
        if first_leader:
            leader = {
                'id': first_leader.id,
                'name': first_leader.name,
                'email': first_leader.email,
                'role': first_leader.role,
                'created_at': first_leader.created_at.isoformat() if first_leader.created_at else None
            }

    # Fetch all members of this team
    members_query = User.query.filter_by(team_id=current_user.team_id).order_by(User.role.asc(), User.name.asc()).all()
    members = [{
        'id': m.id,
        'name': m.name,
        'email': m.email,
        'role': m.role,
        'profile_image': m.profile_image,
        'created_at': m.created_at.isoformat() if m.created_at else None
    } for m in members_query]

    team_dict = team.to_dict()
    team_dict['members'] = members

    return jsonify({
        'success': True,
        'team': team_dict,
        'leader': leader,
        'members': members,
        'total_members': len(members)
    }), 200
