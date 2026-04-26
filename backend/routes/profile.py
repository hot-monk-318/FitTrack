from flask import Blueprint, request, jsonify, g
from extensions import db
from models import UserProfile
from utils.auth import require_auth

profile_bp = Blueprint('profile', __name__)


def _get_or_create_profile():
    p = UserProfile.query.filter_by(user_id=g.current_user.id).first()
    if not p:
        p = UserProfile(user_id=g.current_user.id)
        db.session.add(p)
        db.session.commit()
    return p


@profile_bp.route('', methods=['GET'])
@require_auth
def get_profile():
    return jsonify(_get_or_create_profile().to_dict())


@profile_bp.route('', methods=['PUT'])
@require_auth
def update_profile():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    p = _get_or_create_profile()
    for field in ('age', 'gender', 'height_cm', 'current_weight_kg', 'target_weight_kg', 'activity_level'):
        if field in data:
            setattr(p, field, data[field])
    db.session.commit()
    return jsonify(p.to_dict())
