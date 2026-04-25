from flask import Blueprint, request, jsonify
from extensions import db
from models import UserProfile

profile_bp = Blueprint('profile', __name__)


def _get_or_create_profile():
    p = UserProfile.query.first()
    if not p:
        p = UserProfile()
        db.session.add(p)
        db.session.commit()
    return p


@profile_bp.route('', methods=['GET'])
def get_profile():
    return jsonify(_get_or_create_profile().to_dict())


@profile_bp.route('', methods=['PUT'])
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
