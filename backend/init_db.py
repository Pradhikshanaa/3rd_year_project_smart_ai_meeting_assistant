import os
from dotenv import load_dotenv
from flask import Flask

load_dotenv()

from extensions import db
from config import Config
import models  # Ensure all SQLAlchemy models are registered

def setup_database():
    print(f">> Initializing SQLite Database with SQLAlchemy ORM...")
    print(f">> Database URI: {Config.SQLALCHEMY_DATABASE_URI}")
    try:
        app = Flask(__name__)
        app.config.from_object(Config)
        db.init_app(app)
        
        with app.app_context():
            db.create_all()
            print(">> All tables (users, teams, meetings, meeting_participants, tasks, decisions, notifications, password_reset_tokens, messages, email_reminders_log) created successfully in SQLite!")
        print(">> Database setup complete.")
        return True
    except Exception as e:
        print(f"\n[Database Initialization Error]: {e}")
        return False

if __name__ == '__main__':
    setup_database()
