from flask import Blueprint, request, jsonify, g
from extensions import db
from models import Workout, WorkoutExercise, Set, Exercise, FoodLog, UserProfile
from sqlalchemy import func
from datetime import datetime, timedelta, date as date_type
from met_lookup import compute_workout_calories
from utils.auth import require_auth

analytics_bp = Blueprint('analytics', __name__)


@analytics_bp.route('/volume', methods=['GET'])
@require_auth
def get_volume():
    days = request.args.get('days', 90, type=int)
    exercise_id = request.args.get('exercise_id', type=int)
    since = datetime.utcnow() - timedelta(days=days)

    q = (
        db.session.query(Workout.id, Workout.date, func.sum(Set.weight * Set.reps).label('volume'))
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .join(Set, Set.workout_exercise_id == WorkoutExercise.id)
        .filter(Workout.user_id == g.current_user.id, Workout.date >= since, Set.completed == True)
    )
    if exercise_id:
        q = q.filter(WorkoutExercise.exercise_id == exercise_id)

    results = q.group_by(Workout.id).order_by(Workout.date).all()
    return jsonify([{'date': r.date.isoformat(), 'volume': round(r.volume or 0, 1)} for r in results])


@analytics_bp.route('/strength', methods=['GET'])
@require_auth
def get_strength():
    days = request.args.get('days', 90, type=int)
    exercise_id = request.args.get('exercise_id', type=int)
    since = datetime.utcnow() - timedelta(days=days)

    q = (
        db.session.query(
            Workout.date,
            WorkoutExercise.exercise_id,
            Exercise.name.label('exercise_name'),
            func.max(Set.weight).label('max_weight'),
        )
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .join(Set, Set.workout_exercise_id == WorkoutExercise.id)
        .join(Exercise, Exercise.id == WorkoutExercise.exercise_id)
        .filter(Workout.user_id == g.current_user.id, Workout.date >= since, Set.completed == True)
    )
    if exercise_id:
        q = q.filter(WorkoutExercise.exercise_id == exercise_id)

    results = q.group_by(Workout.id, WorkoutExercise.exercise_id).order_by(Workout.date).all()

    by_exercise = {}
    for r in results:
        key = str(r.exercise_id)
        if key not in by_exercise:
            by_exercise[key] = {'name': r.exercise_name, 'data': []}
        by_exercise[key]['data'].append({'date': r.date.isoformat(), 'max_weight': r.max_weight})

    return jsonify(list(by_exercise.values()))


@analytics_bp.route('/summary', methods=['GET'])
@require_auth
def get_summary():
    uid = g.current_user.id
    total_workouts = Workout.query.filter_by(user_id=uid).count()
    week_ago = datetime.utcnow() - timedelta(days=7)
    workouts_this_week = Workout.query.filter(Workout.user_id == uid, Workout.date >= week_ago).count()
    total_volume = (
        db.session.query(func.sum(Set.weight * Set.reps))
        .join(WorkoutExercise, WorkoutExercise.id == Set.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .filter(Workout.user_id == uid, Set.completed == True)
        .scalar() or 0
    )
    most_logged = (
        db.session.query(Exercise.name, func.count(WorkoutExercise.id).label('cnt'))
        .join(WorkoutExercise, WorkoutExercise.exercise_id == Exercise.id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .filter(Workout.user_id == uid)
        .group_by(Exercise.id)
        .order_by(func.count(WorkoutExercise.id).desc())
        .first()
    )

    # Calories burned today using MET values from 2024 Compendium
    profile = UserProfile.query.filter_by(user_id=uid).first()
    weight_kg = profile.current_weight_kg if profile else None
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_workouts = Workout.query.filter(Workout.user_id == uid, Workout.date >= today_start).all()
    calories_burned_today = (
        sum(compute_workout_calories(w, weight_kg) for w in today_workouts)
        if weight_kg else None
    )

    return jsonify({
        'total_workouts': total_workouts,
        'workouts_this_week': workouts_this_week,
        'total_volume_lbs': round(total_volume, 1),
        'most_logged_exercise': most_logged[0] if most_logged else None,
        'calories_burned_today': calories_burned_today,
    })


@analytics_bp.route('/calories-burned', methods=['GET'])
@require_auth
def get_calories_burned():
    days = request.args.get('days', 30, type=int)
    since = datetime.utcnow() - timedelta(days=days)
    uid = g.current_user.id
    profile = UserProfile.query.filter_by(user_id=uid).first()
    weight_kg = (profile.current_weight_kg if profile else None) or 70.0
    workouts = Workout.query.filter(Workout.user_id == uid, Workout.date >= since).all()

    daily = {}
    for w in workouts:
        key = w.date.date().isoformat()
        cal = compute_workout_calories(w, weight_kg)
        daily[key] = daily.get(key, 0) + cal

    return jsonify([{'date': k, 'calories_burned': v} for k, v in sorted(daily.items())])


@analytics_bp.route('/food-trend', methods=['GET'])
@require_auth
def get_food_trend():
    days = request.args.get('days', 30, type=int)
    since = date_type.today() - timedelta(days=days)
    logs = FoodLog.query.filter(
        FoodLog.user_id == g.current_user.id,
        FoodLog.date >= since,
    ).order_by(FoodLog.date).all()

    daily = {}
    for log in logs:
        key = log.date.isoformat()
        if key not in daily:
            daily[key] = {'calories': 0, 'protein': 0.0, 'carbs': 0.0, 'fat': 0.0}
        daily[key]['calories'] += log.calories
        daily[key]['protein'] += log.protein or 0
        daily[key]['carbs'] += log.carbs or 0
        daily[key]['fat'] += log.fat or 0

    for v in daily.values():
        v['protein'] = round(v['protein'], 1)
        v['carbs'] = round(v['carbs'], 1)
        v['fat'] = round(v['fat'], 1)

    return jsonify([{'date': k, **v} for k, v in sorted(daily.items())])


@analytics_bp.route('/frequency', methods=['GET'])
@require_auth
def get_frequency():
    weeks = request.args.get('weeks', 12, type=int)
    since = datetime.utcnow() - timedelta(weeks=weeks)
    workouts = Workout.query.filter(
        Workout.user_id == g.current_user.id,
        Workout.date >= since,
    ).order_by(Workout.date).all()

    week_counts = {}
    for w in workouts:
        week_start = w.date - timedelta(days=w.date.weekday())
        key = week_start.strftime('%Y-%m-%d')
        week_counts[key] = week_counts.get(key, 0) + 1

    return jsonify([{'week': k, 'count': v} for k, v in sorted(week_counts.items())])
