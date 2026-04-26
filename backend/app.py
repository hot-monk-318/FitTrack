from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()


def create_app():
    app = Flask(__name__)

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-change-in-prod')

    db_url = os.getenv('DATABASE_URL', 'sqlite:///fittrack.db')
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    cors_origins = os.getenv('CORS_ORIGINS', '*')
    origins = cors_origins.split(',') if cors_origins != '*' else '*'
    CORS(app, origins=origins, supports_credentials=False,
         allow_headers=['Content-Type', 'Authorization'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

    from extensions import db
    db.init_app(app)

    from routes.exercises import exercises_bp
    from routes.workouts import workouts_bp
    from routes.analytics import analytics_bp
    from routes.export import export_bp
    from routes.food import food_bp
    from routes.profile import profile_bp
    from routes.auth import auth_bp
    from routes.leaderboard import leaderboard_bp

    app.register_blueprint(exercises_bp, url_prefix='/api/exercises')
    app.register_blueprint(workouts_bp, url_prefix='/api/workouts')
    app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
    app.register_blueprint(export_bp, url_prefix='/api/export')
    app.register_blueprint(food_bp, url_prefix='/api/food')
    app.register_blueprint(profile_bp, url_prefix='/api/profile')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(leaderboard_bp, url_prefix='/api/leaderboard')

    with app.app_context():
        db.create_all()
        _migrate_db(db)
        _seed_exercises(db)

    @app.route('/api/health')
    def health():
        return {'status': 'ok'}

    return app


def _migrate_db(db):
    from sqlalchemy import text
    additions = [
        ('food_logs', 'protein', 'REAL', '0'),
        ('food_logs', 'carbs', 'REAL', '0'),
        ('food_logs', 'fat', 'REAL', '0'),
        ('food_logs', 'sugar_total', 'REAL', '0'),
        ('food_logs', 'sugar_added', 'REAL', '0'),
        ('workouts', 'user_id', 'INTEGER', 'NULL'),
        ('food_logs', 'user_id', 'INTEGER', 'NULL'),
        ('user_profile', 'user_id', 'INTEGER', 'NULL'),
        ('exercises', 'user_id', 'INTEGER', 'NULL'),
    ]
    with db.engine.connect() as conn:
        for table, col, col_type, default in additions:
            try:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {col_type} DEFAULT {default}'))
                conn.commit()
            except Exception:
                pass  # column already exists


def _seed_exercises(db):
    from models import Exercise
    if Exercise.query.count() > 0:
        return

    defaults = [
        # Machine
        ('Chest Press', 'machine', 'chest'),
        ('Shoulder Press', 'machine', 'shoulders'),
        ('Lat Pulldown', 'machine', 'back'),
        ('Seated Cable Row', 'machine', 'back'),
        ('Leg Press', 'machine', 'legs'),
        ('Leg Extension', 'machine', 'legs'),
        ('Leg Curl', 'machine', 'legs'),
        ('Pec Deck / Cable Fly', 'machine', 'chest'),
        ('Tricep Pushdown', 'machine', 'arms'),
        ('Bicep Curl Machine', 'machine', 'arms'),
        ('Hip Abductor', 'machine', 'legs'),
        ('Hip Adductor', 'machine', 'legs'),
        ('Calf Raise Machine', 'machine', 'legs'),
        ('Back Extension', 'machine', 'back'),
        ('Assisted Pull-Up', 'machine', 'back'),
        ('Assisted Dip', 'machine', 'arms'),
        # Barbell
        ('Bench Press', 'barbell', 'chest'),
        ('Squat', 'barbell', 'legs'),
        ('Deadlift', 'barbell', 'back'),
        ('Overhead Press', 'barbell', 'shoulders'),
        ('Barbell Row', 'barbell', 'back'),
        ('Romanian Deadlift', 'barbell', 'legs'),
        ('Incline Bench Press', 'barbell', 'chest'),
        # Dumbbell
        ('Dumbbell Curl', 'dumbbell', 'arms'),
        ('Dumbbell Press', 'dumbbell', 'chest'),
        ('Lateral Raise', 'dumbbell', 'shoulders'),
        ('Tricep Overhead Extension', 'dumbbell', 'arms'),
        ('Dumbbell Row', 'dumbbell', 'back'),
        ('Goblet Squat', 'dumbbell', 'legs'),
        ('Dumbbell Fly', 'dumbbell', 'chest'),
        ('Hammer Curl', 'dumbbell', 'arms'),
        ('Bulgarian Split Squat', 'dumbbell', 'legs'),
        # Bodyweight
        ('Pull-Up', 'bodyweight', 'back'),
        ('Push-Up', 'bodyweight', 'chest'),
        ('Dip', 'bodyweight', 'arms'),
        ('Plank', 'bodyweight', 'core'),
        ('Crunch', 'bodyweight', 'core'),
        ('Lunges', 'bodyweight', 'legs'),
        ('Leg Raise', 'bodyweight', 'core'),
        ('Glute Bridge', 'bodyweight', 'legs'),
        # Cardio
        ('Walking', 'cardio', 'cardio'),
        ('Running', 'cardio', 'cardio'),
        ('Jogging', 'cardio', 'cardio'),
        ('Cycling', 'cardio', 'cardio'),
        ('Elliptical', 'cardio', 'cardio'),
        ('Rowing Machine', 'cardio', 'cardio'),
        ('Jump Rope', 'cardio', 'cardio'),
        ('Stair Climber', 'cardio', 'cardio'),
        ('Swimming', 'cardio', 'cardio'),
        ('Soccer', 'cardio', 'sports'),
        ('Basketball', 'cardio', 'sports'),
        ('Tennis', 'cardio', 'sports'),
        ('Volleyball', 'cardio', 'sports'),
        ('HIIT', 'cardio', 'cardio'),
    ]

    for name, category, muscle_group in defaults:
        db.session.add(Exercise(name=name, category=category, muscle_group=muscle_group))
    db.session.commit()


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0', port=8000)
