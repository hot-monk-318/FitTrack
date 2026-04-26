# FitTrack — Claude Context

This file gives Claude enough context to work on the codebase without re-reading every module.

---

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | React 18 + Vite | SPA, dark theme |
| Styling | Tailwind CSS 3 | Custom colors: `ft-card`, `ft-border`, `ft-surface` |
| Charts | Recharts | PieChart on Dashboard, line/bar charts in Analytics |
| Routing | React Router v6 | BrowserRouter |
| HTTP | Axios | `src/api.js` — auto-injects auth token |
| Backend | Flask 3 + SQLAlchemy | Blueprint-per-feature pattern |
| Database | SQLite (dev) / PostgreSQL (prod) | Render.com deployment |
| Auth | JWT (PyJWT 2.8) | 30-day tokens, stored in `localStorage` key `fittrack_token` |
| PDF/CSV | ReportLab + csv stdlib | `/api/export/*` |
| Food search | USDA FoodData Central API | Key in `backend/.env` as `USDA_API_KEY` |
| Calorie burn | MET values (2024 Compendium) | `backend/met_lookup.py` |

---

## Directory Layout

```
FitTrack/
├── backend/
│   ├── app.py              # Flask factory, blueprint registration, _migrate_db(), _seed_exercises()
│   ├── extensions.py       # db = SQLAlchemy()
│   ├── models.py           # All ORM models (User, Workout, FoodLog, UserProfile, Exercise, WorkoutExercise, Set)
│   ├── met_lookup.py       # compute_workout_calories(workout, weight_kg) — MET-based calorie burn
│   ├── requirements.txt    # Includes PyJWT==2.8.0
│   ├── .env                # DATABASE_URL, SECRET_KEY, CORS_ORIGINS, USDA_API_KEY
│   ├── utils/
│   │   └── auth.py         # generate_token(user_id), require_auth decorator → sets g.current_user
│   └── routes/
│       ├── auth.py         # POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me
│       ├── workouts.py     # CRUD /api/workouts — filtered by user_id
│       ├── food.py         # CRUD /api/food + GET /api/food/search (USDA proxy) — filtered by user_id
│       ├── profile.py      # GET/PUT /api/profile — _get_or_create_profile() scoped to user_id
│       ├── analytics.py    # GET /api/analytics/{summary,volume,strength,frequency,food-trend,calories-burned}
│       ├── exercises.py    # GET/POST/DELETE /api/exercises — built-ins global, custom scoped by user_id
│       └── export.py       # GET /api/export/{csv,pdf} — accepts token as query param (window.open compat)
├── frontend/
│   └── src/
│       ├── api.js          # Axios instance — auto-injects Bearer token; redirects to /login on 401
│       ├── App.jsx         # BrowserRouter > AuthProvider > AppRoutes (protected routing logic)
│       ├── context/
│       │   └── AuthContext.jsx  # user, login(), signup(), logout() — token in localStorage
│       ├── components/
│       │   └── Navbar.jsx  # Desktop sidebar + mobile top bar/bottom tabs; profile avatar + sign-out
│       └── pages/
│           ├── Dashboard.jsx    # Home — greeting, workout summary card, nutrition card with pie charts
│           ├── Login.jsx
│           ├── Signup.jsx
│           ├── LogWorkout.jsx
│           ├── History.jsx
│           ├── FoodLog.jsx
│           ├── Analytics.jsx
│           └── Export.jsx
└── render.yaml             # Render.com deploy config (Flask + PostgreSQL)
```

---

## Auth Flow

1. **Sign up** → `POST /api/auth/signup` with `{first_name, last_name, email, password}` → returns `{token, user}`
2. **Log in** → `POST /api/auth/login` with `{email, password}` → returns `{token, user}`
3. **Token storage** → `localStorage.getItem('fittrack_token')` (key: `fittrack_token`), 30-day JWT expiry
4. **Request injection** → `api.js` interceptor adds `Authorization: Bearer <token>` to every Axios call
5. **Backend validation** → `@require_auth` decorator in `utils/auth.py` decodes JWT → sets `g.current_user`
6. **401 handling** → `api.js` response interceptor clears localStorage and redirects to `/login`
7. **Export endpoints** → token passed as `?token=` query param because `window.open()` can't set headers

---

## Database Models

All user-owned data has a nullable `user_id FK → users.id`. Existing rows (pre-auth) have `user_id = NULL`.

| Table | Key columns | Notes |
|-------|-------------|-------|
| `users` | id, email, password_hash, first_name, last_name | bcrypt via werkzeug.security |
| `workouts` | id, user_id, name, workout_type, date | relates to WorkoutExercise → Set |
| `workout_exercises` | id, workout_id, exercise_id, order | join table |
| `sets` | id, workout_exercise_id, set_number, weight, reps, completed | volume = weight × reps |
| `exercises` | id, name, category, muscle_group, is_custom, user_id | 53 built-ins (user_id=NULL), custom scoped |
| `food_logs` | id, user_id, date, meal_type, description, calories, protein, carbs, fat, sugar_total, sugar_added | |
| `user_profile` | id, user_id, age, gender, height_cm, current_weight_kg, target_weight_kg, activity_level | one per user via _get_or_create_profile() |

---

## Migration Pattern

`app.py::_migrate_db()` runs on every startup. It issues `ALTER TABLE … ADD COLUMN` statements wrapped in try/except so they silently skip if the column already exists. This handles both fresh DBs and existing ones. No Alembic.

---

## Key Patterns

- **Blueprint per feature** — each routes file exports `*_bp` registered in `app.py` under `/api/<feature>`
- **User scoping** — every query adds `.filter_by(user_id=g.current_user.id)` or `.filter(Model.user_id == uid)`
- **Profile singleton per user** — `_get_or_create_profile()` in `routes/profile.py` creates on first access
- **Calorie target** — computed client-side in `Dashboard.jsx::computeTargetCalories()` using Harris-Benedict BMR + TDEE multiplier
- **Tailwind custom colors** — `ft-card`, `ft-surface`, `ft-border` defined in `tailwind.config.js`
- **No Alembic** — schema changes go in `_migrate_db()` in `app.py`
- **Exercise library** — 53 seeded exercises are global (user_id=NULL); custom exercises get user_id set on creation

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | backend/.env | `sqlite:///fittrack.db` locally, `postgresql://` on Render |
| `SECRET_KEY` | backend/.env | JWT signing key |
| `CORS_ORIGINS` | backend/.env | `*` locally, comma-separated origins in prod |
| `USDA_API_KEY` | backend/.env | FoodData Central API key |
| `VITE_API_URL` | frontend/.env | Backend base URL, default `http://localhost:5000` |

---

## Running Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
python app.py          # runs on :8000

# Frontend
cd frontend
npm install
npm run dev            # runs on :5173 (proxied to :8000 via VITE_API_URL)
```
