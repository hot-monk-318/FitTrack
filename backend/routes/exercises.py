from flask import Blueprint, request, jsonify
from extensions import db
from models import Exercise

exercises_bp = Blueprint('exercises', __name__)


@exercises_bp.route('', methods=['GET'])
def get_exercises():
    category = request.args.get('category')
    muscle_group = request.args.get('muscle_group')
    q = Exercise.query
    if category:
        q = q.filter_by(category=category)
    if muscle_group:
        q = q.filter_by(muscle_group=muscle_group)
    return jsonify([e.to_dict() for e in q.order_by(Exercise.category, Exercise.name).all()])


@exercises_bp.route('', methods=['POST'])
def create_exercise():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    exercise = Exercise(
        name=data['name'],
        category=data.get('category', 'other'),
        muscle_group=data.get('muscle_group', 'other'),
        is_custom=True,
    )
    db.session.add(exercise)
    db.session.commit()
    return jsonify(exercise.to_dict()), 201


@exercises_bp.route('/<int:exercise_id>', methods=['DELETE'])
def delete_exercise(exercise_id):
    exercise = Exercise.query.get_or_404(exercise_id)
    if not exercise.is_custom:
        return jsonify({'error': 'Cannot delete built-in exercises'}), 403
    db.session.delete(exercise)
    db.session.commit()
    return '', 204
