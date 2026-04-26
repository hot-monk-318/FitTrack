from flask import Blueprint, request, jsonify, g
from extensions import db
from models import Workout, WorkoutExercise, Set, Exercise, UserProfile
from datetime import datetime
from met_lookup import compute_workout_calories
from utils.auth import require_auth


def _parse_date(s):
    # Python 3.9 fromisoformat can't handle JS's 'Z' suffix or milliseconds
    return datetime.fromisoformat(s.replace('Z', '+00:00').split('.')[0].replace('+00:00', ''))

workouts_bp = Blueprint('workouts', __name__)


@workouts_bp.route('', methods=['GET'])
@require_auth
def get_workouts():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    pag = Workout.query.filter_by(user_id=g.current_user.id).order_by(Workout.date.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        'workouts': [w.to_dict(include_exercises=False) for w in pag.items],
        'total': pag.total,
        'pages': pag.pages,
        'current_page': pag.page,
    })


@workouts_bp.route('/<int:workout_id>', methods=['GET'])
@require_auth
def get_workout(workout_id):
    workout = Workout.query.filter_by(id=workout_id, user_id=g.current_user.id).first_or_404()
    profile = UserProfile.query.filter_by(user_id=g.current_user.id).first()
    weight_kg = (profile.current_weight_kg if profile else None) or 70.0
    d = workout.to_dict()
    d['calories_burned'] = compute_workout_calories(workout, weight_kg)
    return jsonify(d)


@workouts_bp.route('', methods=['POST'])
@require_auth
def create_workout():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    workout = Workout(
        name=data.get('name', 'Workout'),
        workout_type=data.get('workout_type', 'strength'),
        date=_parse_date(data['date']) if data.get('date') else datetime.utcnow(),
        user_id=g.current_user.id,
    )
    db.session.add(workout)
    db.session.flush()

    for i, ex_data in enumerate(data.get('exercises', [])):
        exercise = Exercise.query.get(ex_data['exercise_id'])
        if not exercise:
            continue
        we = WorkoutExercise(
            workout_id=workout.id,
            exercise_id=exercise.id,
            order=i,
        )
        db.session.add(we)
        db.session.flush()

        for j, s_data in enumerate(ex_data.get('sets', [])):
            db.session.add(Set(
                workout_exercise_id=we.id,
                set_number=j + 1,
                weight=s_data.get('weight', 0),
                reps=s_data.get('reps', 0),
                completed=s_data.get('completed', True),
            ))

    db.session.commit()
    return jsonify(workout.to_dict()), 201


@workouts_bp.route('/<int:workout_id>', methods=['PUT'])
@require_auth
def update_workout(workout_id):
    workout = Workout.query.filter_by(id=workout_id, user_id=g.current_user.id).first_or_404()
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    if 'name' in data:
        workout.name = data['name']
    if 'workout_type' in data:
        workout.workout_type = data['workout_type']
    if 'date' in data:
        workout.date = _parse_date(data['date'])
    db.session.commit()
    return jsonify(workout.to_dict())


@workouts_bp.route('/<int:workout_id>', methods=['DELETE'])
@require_auth
def delete_workout(workout_id):
    workout = Workout.query.filter_by(id=workout_id, user_id=g.current_user.id).first_or_404()
    db.session.delete(workout)
    db.session.commit()
    return '', 204
