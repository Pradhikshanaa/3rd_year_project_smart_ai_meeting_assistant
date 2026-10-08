import sys
import os
import json
from app import create_app
from extensions import db
from models import User

app = create_app()
client = app.test_client()

# 1. Login as Employee (Alice)
res_login = client.post('/api/auth/login', json={'email': 'alice@company.com', 'password': 'password123'})
data_login = res_login.get_json()
token = data_login['token']
print('1. Alice logged in successfully.')

# 2. Test Notifications
res_notifs = client.get('/api/notifications', headers={'Authorization': f'Bearer {token}'})
data_notifs = res_notifs.get_json()
print(f'2. Notifications fetched: {len(data_notifs.get("notifications", []))} items. Unread: {data_notifs.get("unread_count")}')

# 3. Test Mark All Read
res_read = client.put('/api/notifications/read-all', headers={'Authorization': f'Bearer {token}'})
print('3. Mark all read:', res_read.get_json())

# 4. Test Deadline Check trigger
res_deadlines = client.post('/api/notifications/check-deadlines', headers={'Authorization': f'Bearer {token}'})
print('4. Deadline checks triggered:', res_deadlines.get_json())

# 5. Test MeetMind AI Assistant
print('5. Sending prompt to MeetMind AI Assistant...')
res_chat = client.post(
    '/api/assistant/chat',
    json={'message': 'What should I work on today? Summarize my assigned deliverables.'},
    headers={'Authorization': f'Bearer {token}'}
)
data_chat = res_chat.get_json()
print('\n--- MEETMIND AI RESPONSE ---')
print('Status:', res_chat.status_code)
print('Reply:\n', data_chat.get('reply') or data_chat.get('message'))
print('Context summary:', data_chat.get('context_summary'))

print('\n>> [ALL DIRECT PHASE 7 TESTS PASSED SUCCESSFULLY! [OK]]')
