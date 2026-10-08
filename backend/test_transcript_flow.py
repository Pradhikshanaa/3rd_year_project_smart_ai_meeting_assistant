import requests

BASE_URL = "http://127.0.0.1:5000/api"

def run_test():
    # 1. Login as leader
    login_payload = {
        "email": "john.leader@company.com",
        "password": "password123"
    }
    print(f">> Logging in as leader ({login_payload['email']})...")
    r = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
    if r.status_code != 200:
        print("Login failed, checking auth response:", r.text)
        return False

    auth_data = r.json()
    token = auth_data["token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f">> Logged in as: {auth_data['user']['name']} (Team: {auth_data['user']['team_id']})")

    # 2. Create a test meeting
    mtg_payload = {
        "title": "Q3 Architecture & Web Speech AI Integration Review",
        "description": "Sprint planning discussion on removing audio uploads and using Web Speech API.",
        "agenda": "Review speech recognition, test Gemini text analysis, assign follow-up tasks."
    }
    print(">> Creating meeting...")
    create_res = requests.post(f"{BASE_URL}/meetings", json=mtg_payload, headers=headers)
    assert create_res.status_code == 201, f"Create meeting failed: {create_res.text}"
    meeting_data = create_res.json()["meeting"]
    meeting_id = meeting_data["meeting_id"]
    print(f">> Meeting created: {meeting_id} - '{meeting_data['title']}'")

    # 3. Simulate spoken speech recognized by Web Speech API
    simulated_spoken_transcript = (
        "[03:55:00 PM] John Leader: Welcome everyone to today's architecture sync.\n"
        "[03:55:12 PM] Alex Rivera: Thanks John. I have tested the browser Web Speech API for our live captions.\n"
        "[03:55:30 PM] John Leader: That is great! We have decided to completely remove Deepgram and external audio recording, and rely 100% on the Web Speech API.\n"
        "[03:55:48 PM] Alex Rivera: Agreed. I will update the frontend meeting room to collect all participant captions into a running transcript and submit it on meeting end by Friday.\n"
        "[03:56:10 PM] John Leader: Excellent. John, please ensure the backend analyze endpoint passes this text transcript directly to Gemini for task extraction by next Monday.\n"
        "[03:56:35 PM] Alex Rivera: Sounds good. We also decided to schedule our next sprint review on 2026-08-28."
    )

    print(">> Saving spoken transcript to backend...")
    trans_res = requests.post(
        f"{BASE_URL}/meetings/{meeting_id}/transcript",
        json={"transcript": simulated_spoken_transcript},
        headers=headers
    )
    assert trans_res.status_code == 200, f"Save transcript failed: {trans_res.text}"
    print(">> Spoken transcript saved successfully!")

    # 4. Trigger Gemini text intelligence analysis
    print(">> Triggering Gemini text intelligence analysis on spoken transcript...")
    analyze_res = requests.post(
        f"{BASE_URL}/meetings/{meeting_id}/analyze",
        json={"transcript": simulated_spoken_transcript},
        headers=headers
    )
    assert analyze_res.status_code == 200, f"Analyze meeting failed: {analyze_res.text}"
    analysis = analyze_res.json()
    print(">> Gemini Analysis Successful!")
    print(f"   Summary: {analysis['analysis'].get('summary')}")
    print(f"   Decisions ({len(analysis['analysis'].get('decisions', []))}):")
    for d in analysis['analysis'].get('decisions', []):
        print(f"     - {d.get('decision_text')} (Reason: {d.get('reason')})")
    print(f"   Tasks ({len(analysis['analysis'].get('tasks', []))}):")
    for t in analysis['analysis'].get('tasks', []):
        print(f"     - {t.get('title')} -> Assigned: {t.get('assigned_to_name')}, Priority: {t.get('priority')}, Deadline: {t.get('deadline')}")

    # 5. Fetch full meeting details and verify
    print(">> Verifying meeting details from GET endpoint...")
    details_res = requests.get(f"{BASE_URL}/meetings/{meeting_id}", headers=headers)
    assert details_res.status_code == 200
    m_dict = details_res.json()["meeting"]
    assert m_dict["transcript"] == simulated_spoken_transcript, "Spoken transcript does not match in database!"
    assert m_dict["summary"] is not None, "Summary was not saved in database!"
    print(">> All verification assertions passed successfully!")
    return True

if __name__ == "__main__":
    run_test()
