import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Flask configuration
    SECRET_KEY = os.environ.get("SECRET_KEY", "smart-ai-meeting-assistant-secret-key-2026")
    
    # Database configuration (SQLite with SQLAlchemy ORM by default, PostgreSQL/MySQL supported)
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    DEFAULT_SQLITE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'smart_meeting.db')}"
    
    # SQLAlchemy connection string (defaults to SQLite, or reads from DATABASE_URL / DATABASE_URI)
    raw_db_url = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URI") or DEFAULT_SQLITE_URI
    
    # Normalize Render / Supabase / Heroku postgres:// -> postgresql:// for SQLAlchemy 1.4/2.x
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)
    elif raw_db_url.startswith("mysql://") and not raw_db_url.startswith("mysql+pymysql://"):
        raw_db_url = raw_db_url.replace("mysql://", "mysql+pymysql://", 1)

    SQLALCHEMY_DATABASE_URI = raw_db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Connection pool options to prevent cloud disconnection & handle idle timeouts gracefully
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }
    
    # Google Gemini API
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
    
    # Email / SMTP Configuration (Flask-Mail & standard SMTP)
    MAIL_SERVER = os.environ.get("MAIL_SERVER") or os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT") or os.environ.get("SMTP_PORT", 587))
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME") or os.environ.get("SMTP_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD") or os.environ.get("SMTP_PASSWORD", "")
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "true").lower() in ["true", "1", "yes"]
    MAIL_USE_SSL = os.environ.get("MAIL_USE_SSL", "false").lower() in ["true", "1", "yes"]
    MAIL_SENDER_EMAIL = os.environ.get("MAIL_SENDER_EMAIL") or os.environ.get("SMTP_SENDER_EMAIL") or os.environ.get("MAIL_DEFAULT_SENDER") or MAIL_USERNAME
    MAIL_DEFAULT_SENDER = MAIL_SENDER_EMAIL
    
    # Backwards compatibility aliases for SMTP_*
    SMTP_SERVER = MAIL_SERVER
    SMTP_PORT = MAIL_PORT
    SMTP_USERNAME = MAIL_USERNAME
    SMTP_PASSWORD = MAIL_PASSWORD
    SMTP_SENDER_EMAIL = MAIL_SENDER_EMAIL

    # Frontend URL (for direct dashboard / task links in emails)
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
