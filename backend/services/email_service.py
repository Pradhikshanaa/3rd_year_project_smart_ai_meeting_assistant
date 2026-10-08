import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import Config

def get_smtp_config():
    """
    Retrieves SMTP configuration dynamically from environment variables / Config.
    Never hardcodes any credentials.
    """
    server = os.environ.get("MAIL_SERVER") or os.environ.get("SMTP_SERVER") or Config.MAIL_SERVER or "smtp.gmail.com"
    port = int(os.environ.get("MAIL_PORT") or os.environ.get("SMTP_PORT") or Config.MAIL_PORT or 587)
    username = os.environ.get("MAIL_USERNAME") or os.environ.get("SMTP_USERNAME") or Config.MAIL_USERNAME or ""
    password = os.environ.get("MAIL_PASSWORD") or os.environ.get("SMTP_PASSWORD") or Config.MAIL_PASSWORD or ""
    use_tls_raw = os.environ.get("MAIL_USE_TLS") or os.environ.get("SMTP_USE_TLS")
    use_tls = (use_tls_raw.lower() in ["true", "1", "yes"]) if use_tls_raw is not None else Config.MAIL_USE_TLS
    use_ssl_raw = os.environ.get("MAIL_USE_SSL") or os.environ.get("SMTP_USE_SSL")
    use_ssl = (use_ssl_raw.lower() in ["true", "1", "yes"]) if use_ssl_raw is not None else Config.MAIL_USE_SSL
    sender = (
        os.environ.get("MAIL_SENDER_EMAIL")
        or os.environ.get("SMTP_SENDER_EMAIL")
        or os.environ.get("MAIL_DEFAULT_SENDER")
        or Config.MAIL_SENDER_EMAIL
        or username
    )
    frontend_url = os.environ.get("FRONTEND_URL") or Config.FRONTEND_URL or "http://localhost:5173"

    return {
        "server": server,
        "port": port,
        "username": username,
        "password": password,
        "use_tls": use_tls,
        "use_ssl": use_ssl,
        "sender": sender,
        "frontend_url": frontend_url.rstrip("/")
    }

def send_email(to_address, subject, body, html_body=None):
    """
    Reusable email dispatch function via SMTP.
    Credentials are read exclusively from environment variables.
    
    :param to_address: Recipient email address
    :param subject: Email subject line
    :param body: Plain text email body
    :param html_body: Optional formatted HTML content
    :return: (bool, str) True if sent successfully, with log message
    """
    if not to_address or not to_address.strip():
        return False, "Recipient email address is missing or empty."

    cfg = get_smtp_config()
    smtp_server = cfg["server"]
    smtp_port = cfg["port"]
    smtp_user = cfg["username"]
    smtp_password = cfg["password"]
    sender_email = cfg["sender"] or smtp_user or "noreply@smartmeeting.local"

    if not smtp_user or not smtp_password:
        msg = f"[SMTP Notice] SMTP credentials not configured in environment (MAIL_USERNAME/MAIL_PASSWORD). Skipping delivery to {to_address}."
        print(f">> {msg}")
        return False, msg

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender_email
        msg["To"] = to_address

        # Attach plain text fallback
        msg.attach(MIMEText(body or "", "plain"))

        # Attach HTML content if provided
        if html_body:
            msg.attach(MIMEText(html_body, "html"))
        else:
            # Fallback simple HTML format
            basic_html = f"""
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
                <h3 style="color: #4f46e5;">{subject}</h3>
                <p style="font-size: 15px; line-height: 1.6;">{body}</p>
            </div>
            """
            msg.attach(MIMEText(basic_html, "html"))

        # Connect to SMTP server
        if cfg["use_ssl"] or smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=12)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=12)
            if cfg["use_tls"]:
                server.starttls()

        server.login(smtp_user, smtp_password)
        server.sendmail(sender_email, [to_address], msg.as_string())
        server.quit()

        success_msg = f"Email successfully dispatched to {to_address} (Subject: '{subject}')"
        print(f">> [SMTP] {success_msg}")
        return True, success_msg

    except Exception as e:
        err_msg = f"SMTP dispatch failed to {to_address}: {str(e)}"
        print(f">> [SMTP Error] {err_msg}")
        return False, err_msg

def render_task_reminder_html(task_title, description, deadline_str, priority, status, days_until_deadline, dashboard_url):
    """
    Renders clean, modern, professional HTML template for daily task deadline reminders.
    """
    # Determine urgency styling and status text
    if days_until_deadline < 0:
        overdue_days = abs(days_until_deadline)
        urgency_label = f"OVERDUE BY {overdue_days} DAY{'S' if overdue_days != 1 else ''}"
        badge_bg = "#fee2e2"
        badge_text = "#dc2626"
        header_color = "#dc2626"
        status_banner = f"This task was due {overdue_days} day{'s' if overdue_days != 1 else ''} ago on <strong>{deadline_str}</strong>. Please complete or submit it for review as soon as possible."
    elif days_until_deadline == 0:
        urgency_label = "DUE TODAY"
        badge_bg = "#ffedd5"
        badge_text = "#ea580c"
        header_color = "#ea580c"
        status_banner = f"This task is due <strong>TODAY ({deadline_str})</strong>. Please ensure your submission is completed on time."
    elif days_until_deadline == 1:
        urgency_label = "DUE TOMORROW"
        badge_bg = "#fef3c7"
        badge_text = "#d97706"
        header_color = "#d97706"
        status_banner = f"This task is due <strong>tomorrow ({deadline_str})</strong>. Please wrap up remaining requirements."
    else:
        urgency_label = f"DUE IN {days_until_deadline} DAYS"
        badge_bg = "#e0e7ff"
        badge_text = "#4338ca"
        header_color = "#4f46e5"
        status_banner = f"This task is due in <strong>{days_until_deadline} days</strong> on <strong>{deadline_str}</strong>."

    # Priority badge styling
    priority_upper = (priority or "Medium").upper()
    priority_colors = {
        "URGENT": {"bg": "#fee2e2", "text": "#991b1b"},
        "HIGH": {"bg": "#ffedd5", "text": "#9a3412"},
        "MEDIUM": {"bg": "#e0f2fe", "text": "#075985"},
        "LOW": {"bg": "#f1f5f9", "text": "#475569"}
    }
    p_style = priority_colors.get(priority_upper, priority_colors["MEDIUM"])

    desc_display = description if description and description.strip() else "No detailed description provided."

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Task Deadline Reminder</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 10px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        
                        <!-- Header Banner -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 24px 32px; text-align: left;">
                                <div style="display: inline-block; vertical-align: middle;">
                                    <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">
                                        ⚡ Smart AI Meeting Assistant
                                    </h1>
                                    <p style="color: #cbd5e1; font-size: 13px; margin: 4px 0 0 0;">
                                        Automated Daily Task Deadline Notification
                                    </p>
                                </div>
                            </td>
                        </tr>

                        <!-- Body Content -->
                        <tr>
                            <td style="padding: 32px 32px 24px 32px;">
                                
                                <!-- Urgency Pill -->
                                <div style="margin-bottom: 20px;">
                                    <span style="background-color: {badge_bg}; color: {badge_text}; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 9999px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px;">
                                        {urgency_label}
                                    </span>
                                </div>

                                <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">
                                    {task_title}
                                </h2>

                                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; background-color: #f1f5f9; padding: 14px 18px; border-radius: 8px; border-left: 4px solid {header_color};">
                                    {status_banner}
                                </p>

                                <!-- Task Details Card -->
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                                    <tr>
                                        <td style="padding: 16px 20px;">
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                                <tr>
                                                    <td width="30%" style="font-size: 13px; color: #64748b; font-weight: 600; padding-bottom: 10px;">DEADLINE</td>
                                                    <td width="70%" style="font-size: 14px; color: #0f172a; font-weight: 700; padding-bottom: 10px;">{deadline_str}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 13px; color: #64748b; font-weight: 600; padding-bottom: 10px;">PRIORITY</td>
                                                    <td style="padding-bottom: 10px;">
                                                        <span style="background-color: {p_style['bg']}; color: {p_style['text']}; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">
                                                            {priority or 'Medium'}
                                                        </span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 13px; color: #64748b; font-weight: 600; padding-bottom: 10px;">CURRENT STATUS</td>
                                                    <td style="font-size: 14px; color: #334155; font-weight: 600; padding-bottom: 10px; text-transform: capitalize;">{status}</td>
                                                </tr>
                                                <tr>
                                                    <td style="font-size: 13px; color: #64748b; font-weight: 600; vertical-align: top;">DESCRIPTION</td>
                                                    <td style="font-size: 13px; color: #475569; line-height: 1.5;">{desc_display}</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>

                                <!-- CTA Button -->
                                <div style="text-align: center; margin: 28px 0 10px 0;">
                                    <a href="{dashboard_url}" target="_blank" style="background-color: #4f46e5; color: #ffffff; font-size: 15px; font-weight: 600; padding: 12px 28px; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">
                                        Open My Tasks Dashboard &rarr;
                                    </a>
                                </div>

                            </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f1f5f9; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
                                <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                                    This is an automated daily reminder from your team workspace.<br>
                                    Reminders stop automatically once this task is submitted or completed.
                                </p>
                            </td>
                        </tr>

                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

def send_task_deadline_reminder(to_address, task_data, days_until_deadline):
    """
    Sends a formatted daily deadline reminder email for a specific task.
    """
    cfg = get_smtp_config()
    task_title = task_data.get("title", "Untitled Task")
    description = task_data.get("description", "")
    deadline_str = task_data.get("deadline_str", "Upcoming")
    priority = task_data.get("priority", "Medium")
    status = task_data.get("status", "in_progress")
    dashboard_url = f"{cfg['frontend_url']}/tasks"

    # Determine Subject
    if days_until_deadline < 0:
        overdue_days = abs(days_until_deadline)
        subject = f"Overdue: '{task_title}' was due {overdue_days} day{'s' if overdue_days != 1 else ''} ago"
    elif days_until_deadline == 0:
        subject = f"Reminder: '{task_title}' is due today"
    elif days_until_deadline == 1:
        subject = f"Reminder: '{task_title}' is due in 1 day"
    else:
        subject = f"Reminder: '{task_title}' is due in {days_until_deadline} days"

    # Plain text summary
    plain_body = f"""
Daily Task Deadline Reminder:

Task: {task_title}
Deadline: {deadline_str}
Status: {status}
Priority: {priority}

Description:
{description or 'No description provided.'}

View and submit your task here: {dashboard_url}
"""

    html_content = render_task_reminder_html(
        task_title=task_title,
        description=description,
        deadline_str=deadline_str,
        priority=priority,
        status=status,
        days_until_deadline=days_until_deadline,
        dashboard_url=dashboard_url
    )

    success, msg = send_email(
        to_address=to_address,
        subject=subject,
        body=plain_body.strip(),
        html_body=html_content
    )

    return success, subject, msg

def send_notification_email(recipient_email, subject, message_body, meeting_link=None):
    """
    Backwards compatibility helper for general system notification emails.
    """
    cfg = get_smtp_config()
    app_link = meeting_link or f"{cfg['frontend_url']}/dashboard"
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #4f46e5; color: white; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px;">Smart AI Meeting Assistant</h2>
        </div>
        <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
            <h3 style="margin-top: 0; color: #334155;">{subject}</h3>
            <p style="font-size: 15px;">{message_body}</p>
            <div style="margin-top: 20px;">
                <a href="{app_link}" style="background-color: #4f46e5; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Open Application</a>
            </div>
        </div>
        <div style="background-color: #f8fafc; padding: 12px 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
            This is an automated notification from your Smart AI Meeting Assistant system.
        </div>
    </div>
    """

    success, _ = send_email(
        to_address=recipient_email,
        subject=f"[Smart AI Assistant] {subject}",
        body=f"{subject}\n\n{message_body}\n\nOpen application: {app_link}",
        html_body=html_content
    )
    return success
