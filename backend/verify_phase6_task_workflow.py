import requests
import json

base_url = 'http://127.0.0.1:5000/api'

def run_phase6_test():
    print('>> [Phase 6 Test] Starting End-to-End Task Lifecycle & Approval Verification...')

    # Step 1: Login as Leader and Employee
    r_leader = requests.post(f'{base_url}/auth/login', json={'email': 'john.leader@company.com', 'password': 'password123'})
    leader_token = r_leader.json()['token']
    leader_id = r_leader.json()['user']['id']
    print(f'1. Leader logged in: ID={leader_id}')

    r_emp = requests.post(f'{base_url}/auth/login', json={'email': 'alice@company.com', 'password': 'password123'})
    emp_token = r_emp.json()['token']
    emp_id = r_emp.json()['user']['id']
    print(f'2. Employee logged in: ID={emp_id} (Alice)')

    # Step 2: Leader creates a task (simulating Gemini suggested task confirmation)
    r_create = requests.post(
        f'{base_url}/tasks',
        json={
            'title': 'Build MySQL Schema & ORM for Phase 6',
            'description': 'Implement tasks table, approvals, and API endpoints',
            'assigned_to': emp_id,
            'priority': 'High',
            'estimated_duration': '3 hours'
        },
        headers={'Authorization': f'Bearer {leader_token}'}
    )
    task = r_create.json()['task']
    task_id = task['id']
    print(f'3. Task Created: ID={task_id}, Title="{task["title"]}", Status={task["status"]}, Assignee={task["assigned_to"]}')
    assert task['status'] == 'assigned', 'Task should be in assigned status'

    # Step 3: Employee updates progress to 50%
    r_prog = requests.patch(
        f'{base_url}/tasks/{task_id}/progress',
        json={'progress': 50},
        headers={'Authorization': f'Bearer {emp_token}'}
    )
    task_prog = r_prog.json()['task']
    print(f'4. Employee updated progress to 50%: Status={task_prog["status"]}, Progress={task_prog["progress"]}%')
    assert task_prog['status'] == 'in_progress', 'Task should be in_progress'

    # Step 4: Employee finishes and clicks "Submit for Verification"
    r_submit = requests.patch(
        f'{base_url}/tasks/{task_id}/submit',
        headers={'Authorization': f'Bearer {emp_token}'}
    )
    task_sub = r_submit.json()['task']
    print(f'5. Employee submitted for review: Status={task_sub["status"]}, Progress={task_sub["progress"]}%')
    assert task_sub['status'] == 'submitted', 'Task should be submitted'

    # Step 5: Leader checks Approvals queue
    r_approvals = requests.get(f'{base_url}/tasks/approvals', headers={'Authorization': f'Bearer {leader_token}'})
    approvals_list = r_approvals.json()['approvals']
    print(f'6. Leader Approvals Queue Count: {len(approvals_list)}')
    assert any(a['id'] == task_id for a in approvals_list), 'Submitted task must appear in Leader Approvals'

    # Step 6: Leader rejects task with feedback (rework test)
    r_reject = requests.patch(
        f'{base_url}/tasks/{task_id}/reject',
        json={'feedback': 'Please add index on meeting_id column and re-test.'},
        headers={'Authorization': f'Bearer {leader_token}'}
    )
    task_rej = r_reject.json()['task']
    print(f'7. Leader rejected with feedback: Status={task_rej["status"]}, Feedback="{task_rej["rejection_feedback"]}"')
    assert task_rej['status'] == 'rejected', 'Task should be rejected'

    # Step 7: Employee reworks and re-submits
    requests.patch(
        f'{base_url}/tasks/{task_id}/progress',
        json={'progress': 100},
        headers={'Authorization': f'Bearer {emp_token}'}
    )
    r_resubmit = requests.patch(
        f'{base_url}/tasks/{task_id}/submit',
        headers={'Authorization': f'Bearer {emp_token}'}
    )
    task_resub = r_resubmit.json()['task']
    print(f'8. Employee re-submitted task: Status={task_resub["status"]}')
    assert task_resub['status'] == 'submitted', 'Task should be submitted again'

    # Step 8: Leader approves task
    r_approve = requests.patch(
        f'{base_url}/tasks/{task_id}/approve',
        headers={'Authorization': f'Bearer {leader_token}'}
    )
    task_app = r_approve.json()['task']
    print(f'9. Leader Approved Task: Status={task_app["status"]}, Progress={task_app["progress"]}%')
    assert task_app['status'] == 'completed', 'Task should be completed'

    # Step 9: Employee verifies task list has no direct complete button ability and shows completed
    r_emp_tasks = requests.get(f'{base_url}/tasks', headers={'Authorization': f'Bearer {emp_token}'})
    emp_tasks = r_emp_tasks.json()['tasks']
    completed_task = next((t for t in emp_tasks if t['id'] == task_id), None)
    print(f'10. Final Task in Employee View: ID={completed_task["id"]}, Status={completed_task["status"]}')
    assert completed_task['status'] == 'completed', 'Task must be completed'

    print('\n>> [ALL PHASE 6 TASK WORKFLOW TESTS PASSED SUCCESSFULLY! [OK]]')

if __name__ == '__main__':
    run_phase6_test()
