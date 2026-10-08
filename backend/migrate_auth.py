from app import app
from extensions import db
from sqlalchemy import text

with app.app_context():
    db.create_all()
    print(">> db.create_all() finished.")
    
    # 1. Modify password_hash to allow NULL
    try:
        db.session.execute(text("ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;"))
        db.session.commit()
        print(">> [Migration] password_hash modified to NULL successfully")
    except Exception as e:
        db.session.rollback()
        print(">> [Migration] password_hash notice:", e)

    # 2. Add auth_provider column
    try:
        db.session.execute(text("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(30) NOT NULL DEFAULT 'local';"))
        db.session.commit()
        print(">> [Migration] auth_provider column added successfully")
    except Exception as e:
        db.session.rollback()
        print(">> [Migration] auth_provider notice:", e)

    # 3. Add google_id column
    try:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR(120) NULL;"))
        db.session.commit()
        print(">> [Migration] google_id column added successfully")
    except Exception as e:
        db.session.rollback()
        print(">> [Migration] google_id notice:", e)

    print(">> Schema migration completed.")
