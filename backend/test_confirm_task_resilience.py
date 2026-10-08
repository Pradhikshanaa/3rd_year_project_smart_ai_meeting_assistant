import os
import sys
from app import app
from models import Task, User, Meeting
from extensions import db

with app.app_context():
    leader = User.query.filter_by(role='leader').first()
    employee = User.query.filter_by(role='employee').first()
    meeting = Meeting.query.first()
    
    print(f"Leader: {leader.email}, Employee: {employee.email}, Meeting: {meeting.meeting_id}")
    
    # Generate token for leader
    import jwt
    from datetime import datetime, timedelta
    token = jwt.encode({
        'user_id': leader.id,
        'email': leader.email,
        'role': leader.role,
        'team_id': leader.team_id,
        'exp': datetime.utcnow() + timedelta(hours=24)
    }, app.config['SECRET_KEY'], algorithm='HS256')
    
    client = app.test_client()
    
    # Test 1: Confirm with non-existent/purged ID (e.g. 99999) - should fallback and succeed!
    payload = {
        'meeting_id': meeting.meeting_id,
        'title': 'Automated Test Suggested Task',
        'description': 'Created during AI transcript analysis',
        'assigned_to': employee.id,
        'priority': 'High',
        'deadline': '2026-09-01',
        'estimated_duration': '3 days'
    }
    
    res = client.post(
        '/api/tasks/99999/confirm',
        json=payload,
        headers={'Authorization': f'Bearer {token}'}
    )
    print(f"Test 1 (Purged ID 99999 Fallback) Status Code: {res.status_code}")
    print(f"Response: {res.get_json()}")
    assert res.status_code == 200, "Should return 200"
    
    task_data = res.get_json()['task']
    assert task_data['status'] == 'assigned', "Status should be assigned"
    assert task_data['assigned_to'] == employee.id, "Assignee should match"
    print(">> All task confirm resilience tests passed successfully!")
