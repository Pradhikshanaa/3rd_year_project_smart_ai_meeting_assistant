import requests
import json

base_url = 'http://127.0.0.1:5000/api'

# 1. Login as Leader
r_leader = requests.post(f'{base_url}/auth/login', json={'email': 'john.leader@company.com', 'password': 'password123'})
leader_data = r_leader.json()
leader_token = leader_data['token']
print('1. Leader Login Success:', leader_data['user']['name'])

# 2. Get Meetings
r_meetings = requests.get(f'{base_url}/meetings', headers={'Authorization': f'Bearer {leader_token}'})
meetings = r_meetings.json()['meetings']
if not meetings:
    print('No meetings found to test.')
    exit()

test_meeting = meetings[0]
meeting_id = test_meeting['meeting_id']
print(f'2. Testing Analysis on Meeting: {meeting_id} ({test_meeting["title"]})')

# 3. Simulate audio transcript for Gemini Analysis
sample_transcript = (
    "John Leader: Welcome everyone. We need to decide on our WebRTC signaling strategy. "
    "Alice Member: I propose we use Flask-SocketIO with eventlet so we can support multiple simultaneous real-time connections without socket blocking. "
    "Bob Engineer: I agree. I will write the client-side RTCPeerConnection mesh handlers by Thursday. "
    "John Leader: Excellent. Decision approved: We will use Eventlet async mode for signaling. "
    "Alice Member: I will create the MySQL database tables and ORM schemas by Friday. "
    "John Leader: Let's also decide that only Team Leaders have the authority to approve task completion to maintain quality. "
    "Bob Engineer: Agreed. That prevents accidental task closures. "
    "John Leader: Great meeting. Let's reconvene on 2026-08-25 for our next review."
)

print('\n3. Triggering AI Analysis with Transcript...')
r_analyze = requests.post(
    f'{base_url}/meetings/{meeting_id}/analyze',
    json={'transcript': sample_transcript},
    headers={'Authorization': f'Bearer {leader_token}'}
)

print(f'Analysis Status Code: {r_analyze.status_code}')
try:
    analysis_res = r_analyze.json()
    print('Response Message:', analysis_res.get('message'))
    
    if analysis_res.get('success'):
        print('\n--- GEMINI AI OUTPUT ---')
        analysis = analysis_res.get('analysis', {})
        print('Executive Summary:', analysis.get('summary'))
        print('Key Points:', analysis.get('key_points'))
        print('Decisions:', analysis.get('decisions'))
        print('Extracted Tasks:', analysis.get('tasks'))
        print('Effectiveness Score:', analysis.get('effectiveness_score'))
        print('Next Meeting Date:', analysis.get('next_meeting_date'))
        
        # 4. Check Decisions table in MySQL
        r_dec = requests.get(f'{base_url}/meetings/{meeting_id}/decisions', headers={'Authorization': f'Bearer {leader_token}'})
        print('\n4. Stored Decisions in MySQL:', r_dec.json().get('decisions'))
    else:
        print('Notice / Error:', analysis_res.get('message'))
except Exception as e:
    print('Response Text:', r_analyze.text)
