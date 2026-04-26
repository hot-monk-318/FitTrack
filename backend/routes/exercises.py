from flask import Blueprint, request, jsonify, g
from extensions import db
from models import Exercise
from utils.auth import require_auth

exercises_bp = Blueprint('exercises', __name__)


@exercises_bp.route('', methods=['GET'])
@require_auth
def get_exercises():
    category = request.args.get('category')
    muscle_group = request.args.get('muscle_group')
    # Return all built-in exercises plus this user's custom ones
    q = Exercise.query.filter(
        (Exercise.user_id == None) | (Exercise.user_id == g.current_user.id)
    )
    if category:
        q = q.filter_by(category=category)
    if muscle_group:
        q = q.filter_by(muscle_group=muscle_group)
    return jsonify([e.to_dict() for e in q.order_by(Exercise.category, Exercise.name).all()])


@exercises_bp.route('', methods=['POST'])
@require_auth
def create_exercise():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    exercise = Exercise(
        name=data['name'],
        category=data.get('category', 'other'),
        muscle_group=data.get('muscle_group', 'other'),
        is_custom=True,
        user_id=g.current_user.id,
    )
    db.session.add(exercise)
    db.session.commit()
    return jsonify(exercise.to_dict()), 201


@exercises_bp.route('/<int:exercise_id>', methods=['DELETE'])
@require_auth
def delete_exercise(exercise_id):
    exercise = Exercise.query.get_or_404(exercise_id)
    if not exercise.is_custom:
        return jsonify({'error': 'Cannot delete built-in exercises'}), 403
    if exercise.user_id != g.current_user.id:
        return jsonify({'error': 'Not your exercise'}), 403
    db.session.delete(exercise)
    db.session.commit()
    return '', 204
