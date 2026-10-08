import requests

base_url = 'http://127.0.0.1:5000/api'

def test_auth():
    print('>> [Auth Test] Verifying signup & login...')
    
    # Test signup with extra whitespace in email and password
    r_signup = requests.post(f'{base_url}/auth/signup', json={
        'name': '  Test User  ',
        'email': '  TEST.USER@COMPANY.COM  ',
        'password': '  mysecretpassword123  ',
        'role': 'employee',
        'team_id': 'TEAM-KQZEMD'
    })
    print('Signup status:', r_signup.status_code, r_signup.json().get('message'))

    # Test login with lowercase and mixed case
    for login_email in ['test.user@company.com', '  TEST.USER@COMPANY.COM  ']:
        r_login = requests.post(f'{base_url}/auth/login', json={
            'email': login_email,
            'password': 'mysecretpassword123'
        })
        print(f"Login '{login_email}': Status {r_login.status_code}, Success: {r_login.json().get('success')}")
        assert r_login.json().get('success') == True, f"Login failed for {login_email}"

    print('>> [AUTH TEST PASSED!]')

if __name__ == '__main__':
    from app import create_app
    app = create_app()
    client = app.test_client()
    
    # 1. Test existing user john.leader@company.com
    r = client.post('/api/auth/login', json={'email': '  john.leader@company.com  ', 'password': '  password123  '})
    print('Login Leader John:', r.status_code, r.get_json().get('success'))
    assert r.get_json().get('success') == True

    # 2. Test existing user alice@company.com
    r = client.post('/api/auth/login', json={'email': 'ALICE@COMPANY.COM', 'password': 'password123'})
    print('Login Alice (Uppercase):', r.status_code, r.get_json().get('success'))
    assert r.get_json().get('success') == True

    # 3. Test existing user bob@company.com
    r = client.post('/api/auth/login', json={'email': 'bob@company.com', 'password': 'password123'})
    print('Login Bob:', r.status_code, r.get_json().get('success'))
    assert r.get_json().get('success') == True

    print('\n>> [ALL AUTHENTICATION EDGE CASES VERIFIED SUCCESSFULLY!]')
