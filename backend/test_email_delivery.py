import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from utils.email import send_password_reset_email

email = "pradhikshanaa18@gmail.com"
reset_url = "https://localhost:5173/reset-password/test-token-12345"

print(">> Sending test password reset email to", email)
success, err = send_password_reset_email(email, "Pradhikshanaa", reset_url)
print("Result:", success, "Error:", err)
