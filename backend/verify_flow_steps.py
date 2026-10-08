import json
import requests

BASE_URL = "http://127.0.0.1:5000/api"

def test_full_six_steps():
    results = {}
    print("=================================================================")
    print("STARTING FULL END-TO-END VERIFICATION (STEPS 1 TO 6)")
    print("=================================================================\n")

    # Auth setup: Leader and Employee
    leader_creds = {"email": "john.leader@company.com", "password": "password123"}
    employee_creds = {"email": "alice@company.com", "password": "password123"}

    leader_login = requests.post(f"{BASE_URL}/auth/login", json=leader_creds)
    assert leader_login.status_code == 200, f"Leader login failed: {leader_login.text}"
    leader_token = leader_login.json()["token"]
    leader_headers = {"Authorization": f"Bearer {leader_token}"}
    leader_user = leader_login.json()["user"]

    emp_login = requests.post(f"{BASE_URL}/auth/login", json=employee_creds)
    assert emp_login.status_code == 200, f"Employee login failed: {emp_login.text}"
    emp_token = emp_login.json()["token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}
    emp_user = emp_login.json()["user"]

    print(f"Leader: {leader_user['name']} (ID: {leader_user['id']})")
    print(f"Employee: {emp_user['name']} (ID: {emp_user['id']}, Team: {emp_user['team_id']})\n")

    # -------------------------------------------------------------
    # STEP 1: Host a meeting, speak sentences with task, assignee, deadline
    # -------------------------------------------------------------
    print("--- [STEP 1] Hosting meeting and simulating spoken dialogue ---")
    try:
        create_res = requests.post(
            f"{BASE_URL}/meetings",
            json={
                "title": "Core Sprint Deliverables & Security Patch Review",
                "description": "Weekly alignment on deliverables and security updates",
                "agenda": "Assign security patch to Alice, confirm architecture decisions"
            },
            headers=leader_headers
        )
        assert create_res.status_code == 201, f"Create meeting error: {create_res.text}"
        meeting = create_res.json()["meeting"]
        meeting_id = meeting["meeting_id"]

        spoken_transcript = (
            "[10:00:00 AM] John Leader: Welcome team. Let us finalize our deliverables today.\n"
            "[10:00:15 AM] Alice Member: I am ready.\n"
            "[10:00:30 AM] John Leader: Alice, please implement the user authentication security patch and deploy it before 2026-08-30.\n"
            "[10:00:45 AM] Alice Member: Understood, I will complete the security patch by August 30th.\n"
            "[10:01:00 AM] John Leader: Great. We also decided to migrate to PostgreSQL for analytics database."
        )
        print(f"Meeting created: {meeting_id} - \"{meeting['title']}\"")
        print(f"Spoken text formatted with speaker names and timestamps ({len(spoken_transcript)} chars)")
        results["STEP 1"] = "PASS"
    except Exception as e:
        results["STEP 1"] = f"FAIL - {str(e)}"
        print(f"Step 1 Exception: {e}")

    # -------------------------------------------------------------
    # STEP 2: End the meeting — confirm spoken transcript saved in DB
    # -------------------------------------------------------------
    print("\n--- [STEP 2] Ending meeting and verifying spoken transcript saved ---")
    try:
        end_res = requests.post(
            f"{BASE_URL}/meetings/{meeting_id}/end",
            json={"transcript": spoken_transcript},
            headers=leader_headers
        )
        assert end_res.status_code == 200, f"End meeting error: {end_res.text}"
        
        # Verify in database
        check_res = requests.get(f"{BASE_URL}/meetings/{meeting_id}", headers=leader_headers)
        assert check_res.status_code == 200, f"Get meeting details error: {check_res.text}"
        saved_meeting = check_res.json()["meeting"]
        assert saved_meeting["status"] == "completed", f"Status expected completed, got {saved_meeting['status']}"
        assert saved_meeting["transcript"] == spoken_transcript, "Saved transcript does not match spoken text!"
        print(f"Confirmed transcript saved in MySQL database: {len(saved_meeting['transcript'])} chars")
        results["STEP 2"] = "PASS"
    except Exception as e:
        results["STEP 2"] = f"FAIL - {str(e)}"
        print(f"Step 2 Exception: {e}")

    # -------------------------------------------------------------
    # STEP 3: Gemini AI text analysis — summary, decisions, suggested tasks
    # -------------------------------------------------------------
    print("\n--- [STEP 3] Triggering Gemini AI text intelligence analysis ---")
    try:
        analyze_res = requests.post(
            f"{BASE_URL}/meetings/{meeting_id}/analyze",
            json={"transcript": spoken_transcript},
            headers=leader_headers
        )
        assert analyze_res.status_code == 200, f"Analyze meeting error: {analyze_res.text}"
        ai_data = analyze_res.json()
        analysis = ai_data["analysis"]

        summary = analysis.get("summary")
        decisions = analysis.get("decisions", [])
        tasks = analysis.get("tasks", [])

        assert summary and len(summary) > 10, "Summary was empty or too short"
        assert len(decisions) >= 1, "Expected at least 1 decision extracted"
        assert len(tasks) >= 1, "Expected at least 1 task extracted"

        print(f"Summary: {summary[:120]}...")
        print(f"Decisions extracted: {len(decisions)}")
        for d in decisions:
            print(f" - Decision: {d.get('decision_text')}")
        print(f"Suggested tasks extracted: {len(tasks)}")
        for t in tasks:
            print(f" - Task: {t.get('title')} | Assigned: {t.get('assigned_to_name')} | Deadline: {t.get('deadline')}")

        # Check suggested tasks endpoint in database
        suggested_res = requests.get(f"{BASE_URL}/meetings/{meeting_id}/suggested-tasks", headers=leader_headers)
        assert suggested_res.status_code == 200
        saved_suggested = suggested_res.json()["tasks"]
        assert len(saved_suggested) >= 1, "No suggested tasks found in database"
        
        target_suggested_task = saved_suggested[0]
        results["STEP 3"] = "PASS"
    except Exception as e:
        results["STEP 3"] = f"FAIL - {str(e)}"
        print(f"Step 3 Exception: {e}")

    # -------------------------------------------------------------
    # STEP 4: Confirm & Finalize suggested task
    # -------------------------------------------------------------
    print("\n--- [STEP 4] Leader clicking 'Confirm & Finalize' on suggested task ---")
    try:
        task_id = target_suggested_task["id"]
        confirm_payload = {
            "task_id": task_id,
            "meeting_id": meeting_id,
            "title": target_suggested_task["title"],
            "description": target_suggested_task.get("description", "Security patch deployment"),
            "assigned_to": emp_user["id"],  # Alice Member
            "priority": "High",
            "deadline": "2026-08-30",
            "estimated_duration": "2 days"
        }
        confirm_res = requests.post(
            f"{BASE_URL}/tasks/{task_id}/confirm",
            json=confirm_payload,
            headers=leader_headers
        )
        assert confirm_res.status_code == 200, f"Confirm task error: {confirm_res.text}"
        confirmed_task = confirm_res.json()["task"]
        assert confirmed_task["status"] == "assigned", f"Expected status 'assigned', got {confirmed_task['status']}"
        assert confirmed_task["assigned_to"] == emp_user["id"], f"Expected assigned_to {emp_user['id']}, got {confirmed_task['assigned_to']}"
        assert confirmed_task["priority"] == "High", f"Expected priority High, got {confirmed_task['priority']}"
        assert "2026-08-30" in str(confirmed_task["deadline"]), f"Expected deadline 2026-08-30, got {confirmed_task['deadline']}"

        print(f"Confirmed Task #{confirmed_task['id']}: \"{confirmed_task['title']}\" assigned to {confirmed_task.get('assigned_to_name')} (Deadline: {confirmed_task['deadline']})")
        results["STEP 4"] = "PASS"
    except Exception as e:
        results["STEP 4"] = f"FAIL - {str(e)}"
        print(f"Step 4 Exception: {e}")

    # -------------------------------------------------------------
    # STEP 5: Finalized task visible on Leader Dashboard & Employee Tasks
    # -------------------------------------------------------------
    print("\n--- [STEP 5] Verifying task visibility on Leader Dashboard & Employee Board ---")
    try:
        # Leader tasks list
        leader_tasks_res = requests.get(f"{BASE_URL}/tasks", headers=leader_headers)
        assert leader_tasks_res.status_code == 200
        leader_tasks = leader_tasks_res.json()["tasks"]
        found_in_leader = any(t["id"] == confirmed_task["id"] for t in leader_tasks)
        assert found_in_leader, f"Task #{confirmed_task['id']} not found in leader tasks list!"

        # Leader stats
        leader_stats_res = requests.get(f"{BASE_URL}/dashboard/stats", headers=leader_headers)
        assert leader_stats_res.status_code == 200
        print(f"Leader Dashboard Stats: {leader_stats_res.json()['stats']}")

        # Employee tasks list (Alice)
        emp_tasks_res = requests.get(f"{BASE_URL}/tasks", headers=emp_headers)
        assert emp_tasks_res.status_code == 200
        emp_tasks = emp_tasks_res.json()["tasks"]
        found_in_emp = any(t["id"] == confirmed_task["id"] for t in emp_tasks)
        assert found_in_emp, f"Task #{confirmed_task['id']} not found in employee's assigned tasks list!"

        # Employee stats
        emp_stats_res = requests.get(f"{BASE_URL}/dashboard/stats", headers=emp_headers)
        assert emp_stats_res.status_code == 200
        print(f"Employee Dashboard Stats: {emp_stats_res.json()['stats']}")

        print(f"Task #{confirmed_task['id']} confirmed visible on both Leader and Employee boards.")
        results["STEP 5"] = "PASS"
    except Exception as e:
        results["STEP 5"] = f"FAIL - {str(e)}"
        print(f"Step 5 Exception: {e}")

    # -------------------------------------------------------------
    # STEP 6: Employee update progress, Submit for review & Leader Approve/Reject
    # -------------------------------------------------------------
    print("\n--- [STEP 6] Employee progress update, submission & Leader approval ---")
    try:
        final_task_id = confirmed_task["id"]

        # 6a. Employee updates progress to 60%
        prog_res = requests.patch(
            f"{BASE_URL}/tasks/{final_task_id}/progress",
            json={"progress": 60},
            headers=emp_headers
        )
        assert prog_res.status_code == 200, f"Update progress failed: {prog_res.text}"
        prog_data = prog_res.json()["task"]
        assert prog_data["progress"] == 60
        assert prog_data["status"] == "in_progress"
        print(f"Employee updated progress to {prog_data['progress']}% (Status: {prog_data['status']})")

        # 6b. Employee submits task for verification
        sub_res = requests.patch(
            f"{BASE_URL}/tasks/{final_task_id}/submit",
            headers=emp_headers
        )
        assert sub_res.status_code == 200, f"Submit task failed: {sub_res.text}"
        sub_data = sub_res.json()["task"]
        assert sub_data["status"] == "submitted"
        assert sub_data["progress"] == 100
        print(f"Employee submitted task for review (Status: {sub_data['status']}, Progress: {sub_data['progress']}%)")

        # 6c. Leader checks Approvals page
        approvals_res = requests.get(f"{BASE_URL}/tasks/approvals", headers=leader_headers)
        assert approvals_res.status_code == 200, f"Get approvals failed: {approvals_res.text}"
        pending = approvals_res.json()["approvals"]
        found_pending = any(t["id"] == final_task_id for t in pending)
        assert found_pending, f"Task #{final_task_id} not found in Leader Approvals queue!"
        print(f"Leader Approvals Queue contains {len(pending)} pending tasks (Task #{final_task_id} verified present)")

        # 6d. Leader Approves task
        approve_res = requests.patch(
            f"{BASE_URL}/tasks/{final_task_id}/approve",
            headers=leader_headers
        )
        assert approve_res.status_code == 200, f"Approve task failed: {approve_res.text}"
        app_data = approve_res.json()["task"]
        assert app_data["status"] == "completed"
        print(f"Leader approved Task #{final_task_id} (Status: {app_data['status']})")

        results["STEP 6"] = "PASS"
    except Exception as e:
        results["STEP 6"] = f"FAIL - {str(e)}"
        print(f"Step 6 Exception: {e}")

    print("\n=================================================================")
    print("FINAL STEP STATUS SUMMARY:")
    print("=================================================================")
    for step, status in results.items():
        print(f"{step}: {status}")

    return all(s == "PASS" for s in results.values())

if __name__ == "__main__":
    test_full_six_steps()
