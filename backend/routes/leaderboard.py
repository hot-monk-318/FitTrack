from datetime import date as date_type, timedelta
from flask import Blueprint, jsonify, request, g
from sqlalchemy import and_, or_

from extensions import db
from models import FoodLog, FriendConnection, LeaderboardSelection, User, UserProfile
from utils.auth import require_auth

leaderboard_bp = Blueprint('leaderboard', __name__)


def _compute_target_calories(profile):
    if not profile:
        return None
    age = profile.age
    gender = profile.gender or 'male'
    height_cm = profile.height_cm
    current_weight_kg = profile.current_weight_kg
    target_weight_kg = profile.target_weight_kg or current_weight_kg
    activity_level = profile.activity_level or 'moderate'

    if not age or not height_cm or not current_weight_kg:
        return None

    if gender == 'female':
        bmr = 10 * current_weight_kg + 6.25 * height_cm - 5 * age - 161
    else:
        bmr = 10 * current_weight_kg + 6.25 * height_cm - 5 * age + 5

    multipliers = {'sedentary': 1.2, 'light': 1.375, 'moderate': 1.55, 'active': 1.725, 'very_active': 1.9}
    tdee = bmr * multipliers.get(activity_level, 1.55)
    weight_diff_kg = current_weight_kg - target_weight_kg
    daily_adjustment = min(max(weight_diff_kg * 157, -750), 750)
    return round(tdee - daily_adjustment)


def _accepted_friend_ids(user_id):
    rows = FriendConnection.query.filter(
        FriendConnection.status == 'accepted',
        or_(FriendConnection.requester_id == user_id, FriendConnection.addressee_id == user_id),
    ).all()
    ids = set()
    for c in rows:
        ids.add(c.addressee_id if c.requester_id == user_id else c.requester_id)
    return ids


@leaderboard_bp.route('/users/search', methods=['GET'])
@require_auth
def search_users():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])
    like = f'%{q.lower()}%'
    users = User.query.filter(
        User.id != g.current_user.id,
        or_(
            User.email.ilike(like),
            User.first_name.ilike(like),
            User.last_name.ilike(like),
        )
    ).limit(12).all()
    return jsonify([u.to_dict() for u in users])


@leaderboard_bp.route('/connections', methods=['GET'])
@require_auth
def get_connections():
    uid = g.current_user.id
    rows = FriendConnection.query.filter(
        or_(FriendConnection.requester_id == uid, FriendConnection.addressee_id == uid)
    ).order_by(FriendConnection.created_at.desc()).all()

    pending_sent = []
    pending_received = []
    accepted = []
    for row in rows:
        if row.status == 'pending':
            (pending_sent if row.requester_id == uid else pending_received).append(row.to_dict())
        elif row.status == 'accepted':
            accepted.append(row.to_dict())
    return jsonify({
        'pending_sent': pending_sent,
        'pending_received': pending_received,
        'accepted': accepted,
    })


@leaderboard_bp.route('/connections/request', methods=['POST'])
@require_auth
def request_connection():
    data = request.get_json() or {}
    target_user_id = data.get('user_id')
    if not target_user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if target_user_id == g.current_user.id:
        return jsonify({'error': 'Cannot connect with yourself'}), 400
    target_user = User.query.get(target_user_id)
    if not target_user:
        return jsonify({'error': 'User not found'}), 404

    existing = FriendConnection.query.filter(
        or_(
            and_(FriendConnection.requester_id == g.current_user.id, FriendConnection.addressee_id == target_user_id),
            and_(FriendConnection.requester_id == target_user_id, FriendConnection.addressee_id == g.current_user.id),
        )
    ).first()
    if existing:
        return jsonify({'error': f'Connection already {existing.status}'}), 409

    conn = FriendConnection(requester_id=g.current_user.id, addressee_id=target_user_id, status='pending')
    db.session.add(conn)
    db.session.commit()
    return jsonify(conn.to_dict()), 201


@leaderboard_bp.route('/connections/<int:connection_id>/accept', methods=['POST'])
@require_auth
def accept_connection(connection_id):
    conn = FriendConnection.query.get_or_404(connection_id)
    if conn.addressee_id != g.current_user.id:
        return jsonify({'error': 'Not allowed'}), 403
    conn.status = 'accepted'
    db.session.commit()
    return jsonify(conn.to_dict())


@leaderboard_bp.route('/connections/<int:connection_id>', methods=['DELETE'])
@require_auth
def delete_connection(connection_id):
    conn = FriendConnection.query.get_or_404(connection_id)
    uid = g.current_user.id
    if conn.requester_id != uid and conn.addressee_id != uid:
        return jsonify({'error': 'Not allowed'}), 403
    db.session.delete(conn)
    db.session.commit()
    return '', 204


@leaderboard_bp.route('/settings', methods=['GET'])
@require_auth
def get_settings():
    uid = g.current_user.id
    accepted_friend_ids = _accepted_friend_ids(uid)
    selected_rows = LeaderboardSelection.query.filter_by(owner_user_id=uid).all()
    selected_ids = [r.target_user_id for r in selected_rows if r.target_user_id in accepted_friend_ids]
    if not selected_ids:
        selected_ids = sorted(list(accepted_friend_ids))
    return jsonify({
        'selected_user_ids': selected_ids,
        'available_user_ids': sorted(list(accepted_friend_ids)),
    })


@leaderboard_bp.route('/settings', methods=['PUT'])
@require_auth
def update_settings():
    uid = g.current_user.id
    data = request.get_json() or {}
    requested_ids = set(data.get('selected_user_ids', []))
    accepted_friend_ids = _accepted_friend_ids(uid)
    filtered_ids = sorted(list(requested_ids.intersection(accepted_friend_ids)))

    LeaderboardSelection.query.filter_by(owner_user_id=uid).delete()
    for target_user_id in filtered_ids:
        db.session.add(LeaderboardSelection(owner_user_id=uid, target_user_id=target_user_id))
    db.session.commit()
    return jsonify({'selected_user_ids': filtered_ids})


@leaderboard_bp.route('/rankings', methods=['GET'])
@require_auth
def get_rankings():
    uid = g.current_user.id
    try:
        days = int(request.args.get('days', '7'))
    except ValueError:
        return jsonify({'error': 'days must be a number'}), 400
    days = max(1, min(days, 30))

    accepted_friend_ids = sorted(list(_accepted_friend_ids(uid)))
    participant_ids = [uid] + accepted_friend_ids
    start_date = date_type.today() - timedelta(days=days - 1)

    users = User.query.filter(User.id.in_(participant_ids)).all()
    profiles = UserProfile.query.filter(UserProfile.user_id.in_(participant_ids)).all()
    logs = FoodLog.query.filter(FoodLog.user_id.in_(participant_ids), FoodLog.date >= start_date).all()

    profiles_by_user = {p.user_id: p for p in profiles}
    calories_by_user = {}
    for l in logs:
        calories_by_user[l.user_id] = calories_by_user.get(l.user_id, 0) + (l.calories or 0)

    rankings = []
    for u in users:
        target = _compute_target_calories(profiles_by_user.get(u.id))
        total_target = (target or 0) * days
        consumed = calories_by_user.get(u.id, 0)
        achievement_pct = round((consumed / total_target) * 100, 1) if total_target > 0 else 0
        closeness = abs(100 - achievement_pct) if total_target > 0 else 9999
        rankings.append({
            'user_id': u.id,
            'name': f"{u.first_name} {u.last_name}".strip(),
            'consumed_calories': consumed,
            'target_calories': total_target,
            'achievement_pct': achievement_pct,
            'is_current_user': u.id == uid,
            'score_delta': closeness,
        })

    rankings.sort(key=lambda x: (x['score_delta'], -x['achievement_pct']))
    for i, row in enumerate(rankings, start=1):
        row['rank'] = i

    return jsonify({
        'days': days,
        'start_date': start_date.isoformat(),
        'rankings': rankings,
    })
