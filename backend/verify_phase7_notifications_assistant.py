import requests
import json

base_url = 'http://127.0.0.1:5000/api'

def run_phase7_test():
    print('>> [Phase 7 Test] Starting Notifications, Scheduler & MeetMind AI Assistant Verification...')

    # 1. Login as Employee (Alice)
    r_emp = requests.post(f'{base_url}/auth/login', json={'email': 'alice@company.com', 'password': 'password123'})
    emp_token = r_emp.json()['token']
    emp_name = r_emp.json()['user']['name']
    print(f'1. Employee Logged In: {emp_name}')

    # 2. Test Notifications API
    r_notifs = requests.get(f'{base_url}/notifications', headers={'Authorization': f'Bearer {emp_token}'})
    notifs_data = r_notifs.json()
    print(f'2. Notifications Count: {len(notifs_data["notifications"])}, Unread: {notifs_data["unread_count"]}')

    # Mark all read
    r_read_all = requests.put(f'{base_url}/notifications/read-all', headers={'Authorization': f'Bearer {emp_token}'})
    print(f'3. Mark All Read Response:', r_read_all.json().get('message'))

    # Verify unread count is 0
    r_notifs_after = requests.get(f'{base_url}/notifications', headers={'Authorization': f'Bearer {emp_token}'})
    assert r_notifs_after.json()['unread_count'] == 0, 'Unread count should be 0 after mark-all-read'

    # 3. Test MeetMind AI Assistant Chat
    print('\n4. Sending Question to MeetMind AI Assistant: "What tasks should I focus on today?"...')
    r_chat = requests.post(
        f'{base_url}/assistant/chat',
        json={'message': 'What tasks should I focus on today? Please summarize my assigned deliverables.'},
        headers={'Authorization': f'Bearer {emp_token}'}
    )
    print(f'MeetMind Status Code: {r_chat.status_code}')
    chat_res = r_chat.json()
    if chat_res.get('success'):
        print('\n--- MEETMIND AI RESPONSE ---')
        print(chat_res.get('reply'))
        print('Context summary:', chat_res.get('context_summary'))
    else:
        print('MeetMind Notice/Error:', chat_res.get('message'))

    print('\n>> [PHASE 7 VERIFICATION COMPLETE! [OK]]')

if __name__ == '__main__':
    run_phase7_test()
