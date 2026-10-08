from flask import Blueprint, jsonify
from extensions import db, socketio
from sqlalchemy import text
from datetime import datetime

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def health_check():
    db_status = "connected"
    db_error = None
    try:
        db.session.execute(text('SELECT 1'))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        db_status = "disconnected"
        db_error = str(e)
    finally:
        db.session.remove()
        
    db_engine = "unknown"
    try:
        db_engine = db.engine.name
    except Exception:
        pass
        
    return jsonify({
        'status': 'online',
        'service': 'Smart AI Meeting Assistant API',
        'timestamp': datetime.utcnow().isoformat(),
        'database': {
            'status': db_status,
            'engine': db_engine,
            'error': db_error
        },
        'socketio_async_mode': getattr(socketio, 'async_mode', 'threading')
    }), 200

