import os
from app import app
from models import User, Team, PasswordResetToken
from extensions import db
from werkzeug.security import check_password_hash

with app.app_context():
    client = app.test_client()
    print(">> Starting Auth Features Automated Tests...")

    # -------------------------------------------------------------
    # TEST 1: Forgot Password Token Generation & Invalidation
    # -------------------------------------------------------------
    test_user = User.query.filter_by(role='leader').first()
    assert test_user is not None, "Leader user should exist in DB"
    test_email = test_user.email
    print(f">> Test User: {test_email}")

    res = client.post('/api/auth/forgot-password', json={'email': test_email})
    assert res.status_code == 200, f"Forgot password returned {res.status_code}"
    data = res.get_json()
    assert data['success'] is True, "Forgot password should return success=True"
    print(f">> [Test 1 Passed] Forgot password generic response: {data['message']}")

    # Verify token exists in database
    token_record = PasswordResetToken.query.filter_by(user_id=test_user.id, used=False).order_by(PasswordResetToken.id.desc()).first()
    assert token_record is not None, "PasswordResetToken should be created in DB"
    assert token_record.is_valid() is True, "Token should be valid and unexpired"
    print(f">> [Test 1 Passed] Generated Token in DB: {token_record.token[:16]}... (Expires: {token_record.expires_at})")

    # -------------------------------------------------------------
    # TEST 2: Reset Password with Invalid / Expired Token
    # -------------------------------------------------------------
    res_fake = client.post('/api/auth/reset-password', json={
        'token': 'fake-invalid-token-12345',
        'password': 'newpassword123'
    })
    assert res_fake.status_code == 400, "Fake token should return 400"
    print(">> [Test 2 Passed] Invalid token rejected correctly with 400")

    # -------------------------------------------------------------
    # TEST 3: Reset Password with Valid Token & Login Verification
    # -------------------------------------------------------------
    new_pw = "freshResetPassword2026!"
    res_reset = client.post('/api/auth/reset-password', json={
        'token': token_record.token,
        'password': new_pw
    })
    assert res_reset.status_code == 200, f"Reset password returned {res_reset.status_code}"
    assert res_reset.get_json()['success'] is True
    print(">> [Test 3 Passed] Password reset completed successfully")

    # Verify password hash in DB
    updated_user = User.query.get(test_user.id)
    assert check_password_hash(updated_user.password_hash, new_pw) is True, "New password hash must match"

    # Verify token marked as used
    used_token = PasswordResetToken.query.get(token_record.id)
    assert used_token.used is True, "Token must be marked as used"
    print(">> [Test 3 Passed] Token marked as used and cannot be reused")

    # Verify login with new password succeeds
    login_res = client.post('/api/auth/login', json={
        'email': test_email,
        'password': new_pw
    })
    assert login_res.status_code == 200, "Login with new password should succeed"
    assert login_res.get_json()['token'] is not None
    print(">> [Test 3 Passed] Login with newly reset password succeeded with HTTP 200")

    # Restore original password for test user
    from werkzeug.security import generate_password_hash
    updated_user.password_hash = generate_password_hash('password123')
    db.session.commit()

    # -------------------------------------------------------------
    # TEST 4: Google Auth for Existing User
    # -------------------------------------------------------------
    res_google_existing = client.post('/api/auth/google', json={
        'email': test_email,
        'name': test_user.name,
        'google_id': 'google-1092837465',
        'picture': 'https://lh3.googleusercontent.com/a/default-user'
    })
    assert res_google_existing.status_code == 200
    g_data = res_google_existing.get_json()
    assert g_data['success'] is True
    assert g_data['is_new_user'] is False
    assert g_data['token'] is not None
    print(f">> [Test 4 Passed] Google OAuth for existing user logged in directly (is_new_user=False)")

    # -------------------------------------------------------------
    # TEST 5: Google Auth for New User & Profile Completion
    # -------------------------------------------------------------
    new_google_email = "new.google.user.2026@gmail.com"
    # Clean up if existed from prior run
    old_test_g = User.query.filter_by(email=new_google_email).first()
    if old_test_g:
        db.session.delete(old_test_g)
        db.session.commit()

    res_google_new = client.post('/api/auth/google', json={
        'email': new_google_email,
        'name': 'Alex Google',
        'google_id': 'google-999888777'
    })
    assert res_google_new.status_code == 200
    g_new_data = res_google_new.get_json()
    assert g_new_data['is_new_user'] is True
    print(">> [Test 5 Passed] New Google user correctly flagged for profile completion (is_new_user=True)")

    # Complete Google user profile as Leader
    res_complete = client.post('/api/auth/google/complete-profile', json={
        'email': new_google_email,
        'name': 'Alex Google',
        'google_id': 'google-999888777',
        'picture': 'https://example.com/alex.jpg',
        'role': 'leader',
        'team_name': 'Google Innovation Team'
    })
    assert res_complete.status_code == 201
    comp_data = res_complete.get_json()
    assert comp_data['success'] is True
    assert comp_data['user']['auth_provider'] == 'google'
    assert comp_data['team'] is not None
    print(f">> [Test 5 Passed] Google profile completed successfully with Team ID: {comp_data['team']['team_id']}")

    print("\n=======================================================")
    print(">> ALL AUTHENTICATION TESTS (GOOGLE OAUTH & RESET) PASSED!")
    print("=======================================================")
