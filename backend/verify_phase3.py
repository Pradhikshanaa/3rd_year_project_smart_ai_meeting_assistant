import requests

base_url = 'http://127.0.0.1:5000/api'

# 1. Login as Leader (John Leader)
r_leader = requests.post(f'{base_url}/auth/login', json={'email': 'john.leader@company.com', 'password': 'password123'})
leader_data = r_leader.json()
leader_token = leader_data['token']
print('1. Leader Login Success:', leader_data['user']['name'])

# 2. Get Team Members to get Alice & Bob user IDs
r_team = requests.get(f'{base_url}/teams/my-team', headers={'Authorization': f'Bearer {leader_token}'})
members = r_team.json()['members']
member_ids = [m['id'] for m in members if m['role'] != 'leader']
print('2. Team Members for Invite:', [(m['name'], m['id']) for m in members])

# 3. Leader Creates Meeting MTG001
r_create = requests.post(f'{base_url}/meetings', json={
    'title': 'Sprint 1 Planning & Gemini AI Architecture',
    'description': 'Discussion on WebRTC, Gemini audio pipeline, and task allocation',
    'agenda': '1. Architecture review\n2. Real-time signaling\n3. Action item delegation',
    'start_time': '2026-08-20T10:00:00',
    'duration': 45,
    'participant_ids': member_ids
}, headers={'Authorization': f'Bearer {leader_token}'})
created_meeting = r_create.json()
meeting_id = created_meeting['meeting']['meeting_id']
print(f'3. Created Meeting ID: {meeting_id}, Invited: {created_meeting["invited_count"]} members')

# 4. Login as Employee 1 (Alice)
r_alice = requests.post(f'{base_url}/auth/login', json={'email': 'alice@company.com', 'password': 'password123'})
alice_token = r_alice.json()['token']

# Check Alice's In-App Notifications
r_notif = requests.get(f'{base_url}/notifications', headers={'Authorization': f'Bearer {alice_token}'})
alice_notifs = r_notif.json()
print(f'4. Alice Unread Notifications: {alice_notifs["unread_count"]}, Message: "{alice_notifs["notifications"][0]["message"]}"')

# Alice RSVPs 'accepted' for MTG001
r_rsvp = requests.patch(f'{base_url}/meetings/{meeting_id}/rsvp', json={'status': 'accepted'}, headers={'Authorization': f'Bearer {alice_token}'})
print('5. Alice RSVP Result:', r_rsvp.json())

# 5. Login as Employee 2 (Bob)
r_bob = requests.post(f'{base_url}/auth/login', json={'email': 'bob@company.com', 'password': 'password123'})
bob_token = r_bob.json()['token']

# Bob Views Meeting Lobby
r_lobby = requests.get(f'{base_url}/meetings/{meeting_id}', headers={'Authorization': f'Bearer {bob_token}'})
lobby_data = r_lobby.json()
print('6. Bob Lobby View - Meeting Title:', lobby_data['meeting']['title'])
print('   Participants Status:')
for p in lobby_data['participants']:
    print(f'   - {p["name"]} ({p["role"]}): invitation_status={p["invitation_status"]}')
