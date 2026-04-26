from extensions import db
from datetime import datetime, date as date_type


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
        }


class FriendConnection(db.Model):
    __tablename__ = 'friend_connections'
    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    addressee_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')  # pending | accepted
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    requester = db.relationship('User', foreign_keys=[requester_id])
    addressee = db.relationship('User', foreign_keys=[addressee_id])

    def to_dict(self):
        return {
            'id': self.id,
            'requester_id': self.requester_id,
            'addressee_id': self.addressee_id,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'requester': self.requester.to_dict() if self.requester else None,
            'addressee': self.addressee.to_dict() if self.addressee else None,
        }


class LeaderboardSelection(db.Model):
    __tablename__ = 'leaderboard_selections'
    id = db.Column(db.Integer, primary_key=True)
    owner_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    target_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    owner = db.relationship('User', foreign_keys=[owner_user_id])
    target = db.relationship('User', foreign_keys=[target_user_id])


class Exercise(db.Model):
    __tablename__ = 'exercises'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), default='other')
    muscle_group = db.Column(db.String(50), default='other')
    is_custom = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'muscle_group': self.muscle_group,
            'is_custom': self.is_custom,
        }


class Workout(db.Model):
    __tablename__ = 'workouts'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), default='Workout')
    workout_type = db.Column(db.String(50), default='strength')
    date = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    exercises = db.relationship(
        'WorkoutExercise',
        back_populates='workout',
        cascade='all, delete-orphan',
        order_by='WorkoutExercise.order',
    )

    def to_dict(self, include_exercises=True):
        d = {
            'id': self.id,
            'name': self.name,
            'workout_type': self.workout_type or 'strength',
            'date': self.date.isoformat(),
        }
        if include_exercises:
            d['exercises'] = [we.to_dict() for we in self.exercises]
        return d


class FoodLog(db.Model):
    __tablename__ = 'food_logs'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, default=date_type.today)
    meal_type = db.Column(db.String(20), nullable=False)
    description = db.Column(db.String(200), default='')
    calories = db.Column(db.Integer, default=0)
    protein = db.Column(db.Float, default=0)
    carbs = db.Column(db.Float, default=0)
    fat = db.Column(db.Float, default=0)
    sugar_total = db.Column(db.Float, default=0)
    sugar_added = db.Column(db.Float, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat(),
            'meal_type': self.meal_type,
            'description': self.description,
            'calories': self.calories,
            'protein': self.protein or 0,
            'carbs': self.carbs or 0,
            'fat': self.fat or 0,
            'sugar_total': self.sugar_total or 0,
            'sugar_added': self.sugar_added or 0,
        }


class UserProfile(db.Model):
    __tablename__ = 'user_profile'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    age = db.Column(db.Integer, default=25)
    gender = db.Column(db.String(10), default='male')
    height_cm = db.Column(db.Float, default=170)
    current_weight_kg = db.Column(db.Float, default=70)
    target_weight_kg = db.Column(db.Float, default=70)
    activity_level = db.Column(db.String(20), default='moderate')

    def to_dict(self):
        return {
            'id': self.id,
            'age': self.age,
            'gender': self.gender,
            'height_cm': self.height_cm,
            'current_weight_kg': self.current_weight_kg,
            'target_weight_kg': self.target_weight_kg,
            'activity_level': self.activity_level,
        }


class WorkoutExercise(db.Model):
    __tablename__ = 'workout_exercises'
    id = db.Column(db.Integer, primary_key=True)
    workout_id = db.Column(db.Integer, db.ForeignKey('workouts.id'), nullable=False)
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id'), nullable=False)
    order = db.Column(db.Integer, default=0)
    workout = db.relationship('Workout', back_populates='exercises')
    exercise = db.relationship('Exercise')
    sets = db.relationship(
        'Set',
        back_populates='workout_exercise',
        cascade='all, delete-orphan',
        order_by='Set.set_number',
    )

    def to_dict(self):
        return {
            'id': self.id,
            'exercise': self.exercise.to_dict(),
            'order': self.order,
            'sets': [s.to_dict() for s in self.sets],
        }


class Set(db.Model):
    __tablename__ = 'sets'
    id = db.Column(db.Integer, primary_key=True)
    workout_exercise_id = db.Column(db.Integer, db.ForeignKey('workout_exercises.id'), nullable=False)
    set_number = db.Column(db.Integer, nullable=False)
    weight = db.Column(db.Float, default=0)
    reps = db.Column(db.Integer, default=0)
    completed = db.Column(db.Boolean, default=True)
    workout_exercise = db.relationship('WorkoutExercise', back_populates='sets')

    def to_dict(self):
        return {
            'id': self.id,
            'set_number': self.set_number,
            'weight': self.weight,
            'reps': self.reps,
            'completed': self.completed,
            'volume': round(self.weight * self.reps, 1),
        }
