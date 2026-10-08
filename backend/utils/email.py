import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header

def send_password_reset_email(recipient_email, recipient_name, reset_url):
    """
    Sends a password reset email to the specified recipient using configured SMTP settings.
    Ensures UTF-8 charset encoding so both plain-text and HTML bodies render properly in Gmail.
    Returns (success: bool, error_message: str or None)
    """
    smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com').strip()
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_username = (os.getenv('SMTP_USERNAME') or os.getenv('SMTP_EMAIL') or '').strip()
    smtp_password = (os.getenv('SMTP_PASSWORD') or os.getenv('SMTP_APP_PASSWORD') or '').strip()
    sender_email = (os.getenv('SMTP_SENDER_EMAIL') or smtp_username or 'noreply@smartmeeting.ai').strip()

    print(f">> [SMTP Email] Preparing password reset email for {recipient_email} (Server: {smtp_server}:{smtp_port}, Sender: {sender_email})...")

    if not smtp_username or not smtp_password:
        err_msg = "SMTP credentials (SMTP_USERNAME and SMTP_PASSWORD) are not configured in backend/.env."
        print(f">> [SMTP Warning] {err_msg}")
        return False, err_msg

    # Create email container with explicit UTF-8 encoding
    msg = MIMEMultipart('alternative')
    msg['Subject'] = Header('Reset Your Smart AI Meeting Assistant Password', 'utf-8')
    msg['From'] = f"Smart AI Meeting Assistant <{sender_email}>"
    msg['To'] = recipient_email

    display_name = recipient_name if recipient_name else 'User'

    # Plain text version (fallback for clients that don't render HTML)
    text_content = f"""Hello {display_name},

We received a request to reset your password for Smart AI Meeting Assistant.

Click the link below to reset your password (valid for 30 minutes):
{reset_url}

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
The Smart AI Meeting Assistant Team
"""

    # Clean, ultra-compatible HTML version
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden;">
    <tr>
      <td style="background-color: #1e3a8a; padding: 25px 30px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 22px; font-weight: bold; color: #ffffff;">Smart AI Meeting Assistant</h1>
        <p style="margin: 5px 0 0; font-size: 13px; color: #bfdbfe;">AI Meeting Intelligence & Team Workflow</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px;">
        <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; margin-bottom: 20px; text-align: center; color: #92400e; font-size: 13px; font-weight: 600;">
          Link expires in 30 minutes
        </div>

        <p style="font-size: 15px; line-height: 1.5; color: #334155; margin: 0 0 16px;">
          Hello <strong>{display_name}</strong>,
        </p>

        <p style="font-size: 15px; line-height: 1.5; color: #334155; margin: 0 0 20px;">
          We received a request to reset the password for your account associated with <strong>{recipient_email}</strong>.
        </p>

        <p style="font-size: 15px; line-height: 1.5; color: #334155; margin: 0 0 25px;">
          Click the button below to choose a new password:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="{reset_url}" target="_blank" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
            Reset My Password
          </a>
        </div>

        <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 25px 0 8px;">
          If the button above doesn't work, copy and paste this link into your browser:
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 12px; color: #1e40af; margin-bottom: 25px;">
          <a href="{reset_url}" style="color: #1e40af; text-decoration: underline;">{reset_url}</a>
        </div>

        <p style="font-size: 13px; line-height: 1.5; color: #94a3b8; margin: 0;">
          If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 15px 30px; text-align: center; font-size: 12px; color: #94a3b8;">
        &copy; 2026 Smart AI Meeting Assistant. All rights reserved.
      </td>
    </tr>
  </table>
</body>
</html>
"""

    # Attach both plain and html parts with explicit utf-8 charset
    part1 = MIMEText(text_content, 'plain', 'utf-8')
    part2 = MIMEText(html_content, 'html', 'utf-8')
    msg.attach(part1)
    msg.attach(part2)

    # Clean password (remove spaces if user copied from Google App Password UI)
    clean_password = smtp_password.replace(" ", "")

    # Attempt delivery with automatic port fallback (SSL 465 / STARTTLS 587)
    connection_attempts = []
    if smtp_port == 465:
        connection_attempts = [(465, True), (587, False)]
    else:
        connection_attempts = [(smtp_port, False), (465, True)]

    last_error = None
    for port, use_ssl in connection_attempts:
        try:
            print(f">> [SMTP] Attempting delivery via {smtp_server}:{port} (SSL={use_ssl})...")
            if use_ssl:
                server = smtplib.SMTP_SSL(smtp_server, port, timeout=12)
            else:
                server = smtplib.SMTP(smtp_server, port, timeout=12)
                server.ehlo()
                server.starttls()
                server.ehlo()

            try:
                server.login(smtp_username, clean_password)
            except smtplib.SMTPAuthenticationError:
                # Retry with unstripped password just in case
                server.login(smtp_username, smtp_password)

            server.sendmail(sender_email, [recipient_email], msg.as_string())
            server.quit()
            print(f">> [SMTP Success] Password reset email successfully delivered to {recipient_email} via port {port}!")
            return True, None
        except smtplib.SMTPAuthenticationError as auth_err:
            err_msg = f"SMTP Authentication failed: Check your Gmail App Password / username. Details: {auth_err}"
            print(f">> [SMTP Auth Error]: {err_msg}")
            return False, err_msg
        except Exception as e:
            print(f">> [SMTP Port {port} Attempt Failed]: {e}")
            last_error = e
            continue

    err_msg = f"Failed to send email via SMTP ({smtp_server}): {str(last_error)}"
    print(f">> [SMTP Error]: {err_msg}")
    return False, err_msg
