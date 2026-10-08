import os
import smtplib
import traceback
from email.mime.text import MIMEText
from dotenv import load_dotenv

# Step 1: Load environment variables from .env file
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path)

# Step 2: Read SMTP configuration
smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com').strip()
smtp_port = int(os.getenv('SMTP_PORT', '587'))
smtp_username = (os.getenv('SMTP_USERNAME') or os.getenv('SMTP_EMAIL') or '').strip()
smtp_password = (os.getenv('SMTP_PASSWORD') or os.getenv('SMTP_APP_PASSWORD') or '').strip()
smtp_sender = (os.getenv('SMTP_SENDER_EMAIL') or smtp_username).strip()

print("==================================================")
print("       SMTP STANDALONE DIAGNOSTIC TEST            ")
print("==================================================")
print(f">> Loaded .env path  : {dotenv_path}")
print(f">> SMTP Server       : {smtp_server}:{smtp_port}")
print(f">> Loaded Username   : {smtp_username if smtp_username else '[EMPTY / NOT FOUND IN .ENV]'}")
print(f">> Password Configured: {'YES (' + str(len(smtp_password)) + ' chars)' if smtp_password else 'NO (EMPTY)'}")
print("==================================================")

if not smtp_username or not smtp_password:
    print("\n❌ FAILED: SMTP_USERNAME or SMTP_PASSWORD is blank in your backend/.env file.")
    print("Please open backend/.env and add your Gmail address and 16-character App Password.")
    exit(1)

# Step 3: Create simple test email message (self-email)
recipient = smtp_username
msg = MIMEText("Hello! This is a test email sent directly from Smart AI Meeting Assistant to verify SMTP delivery.")
msg['Subject'] = '✅ SMTP Test Email - Smart AI Meeting Assistant'
msg['From'] = f"Smart AI Meeting Assistant <{smtp_sender}>"
msg['To'] = recipient

# Step 4: Connect, Authenticate, and Send
try:
    print(f"\n[1/4] Connecting to {smtp_server}:{smtp_port}...")
    server = smtplib.SMTP(smtp_server, smtp_port, timeout=15)
    
    print("[2/4] Initializing TLS encryption (STARTTLS)...")
    server.ehlo()
    server.starttls()
    server.ehlo()
    
    print(f"[3/4] Authenticating with user '{smtp_username}'...")
    server.login(smtp_username, smtp_password)
    
    print(f"[4/4] Sending test email to {recipient}...")
    server.sendmail(smtp_sender, [recipient], msg.as_string())
    server.quit()

    print("\n==================================================")
    print("🎉 SUCCESS! Test email sent successfully!")
    print(f"Please check your inbox at: {recipient}")
    print("==================================================")

except Exception as err:
    print("\n==================================================")
    print("❌ SMTP CONNECTION / AUTHENTICATION ERROR:")
    print(f"Error Type   : {type(err).__name__}")
    print(f"Error Message: {err}")
    print("\nFull Traceback:")
    traceback.print_exc()
    print("==================================================")
