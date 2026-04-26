import jwt
import os
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, g
from models import User

_SECRET = os.getenv('SECRET_KEY', 'dev-secret-change-in-prod')


def generate_token(user_id):
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(days=30),
    }
    return jwt.encode(payload, _SECRET, algorithm='HS256')


def _extract_token():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return request.args.get('token')


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        try:
            data = jwt.decode(token, _SECRET, algorithms=['HS256'])
            user = User.query.get(data['user_id'])
            if not user:
                return jsonify({'error': 'User not found'}), 401
            g.current_user = user
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated
