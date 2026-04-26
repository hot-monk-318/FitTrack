# FitTrack

A personal fitness tracking app for logging workouts, nutrition, and monitoring progress over time. Supports multiple users with isolated data.

## Features

- **Workout logging** — log exercises with sets, reps, and weight; supports strength, cardio, and custom exercises
- **Nutrition tracking** — log meals with macro breakdown (protein, carbs, fat, sugars); food search powered by the USDA FoodData Central API
- **Calorie burn estimation** — MET-based calorie calculation using the 2024 Compendium of Physical Activities
- **Analytics** — volume trends, strength progression, workout frequency, and nutrition trends over time
- **Data export** — download your workout history as CSV or PDF
- **Multi-user** — each user's data is fully isolated; JWT-based authentication with 30-day sessions
- **Mobile-friendly** — responsive design with a bottom tab bar on mobile and a sidebar on desktop

## Tech Stack

**Frontend** — React 18, Vite, Tailwind CSS, Recharts, React Router v6, Axios

**Backend** — Flask 3, SQLAlchemy, SQLite (dev) / PostgreSQL (prod), PyJWT, ReportLab

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+

### Backend

```bash
cd backend

# Create a virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set SECRET_KEY and optionally USDA_API_KEY

# Run
python app.py
# Starts on http://localhost:8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env        # or create frontend/.env
# Set VITE_API_URL=http://localhost:8000

# Run
npm run dev
# Starts on http://localhost:5173
```

Open `http://localhost:5173`, create an account, and start tracking.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No | Defaults to `sqlite:///fittrack.db`. Use `postgresql://` in production. |
| `SECRET_KEY` | Yes | Secret used to sign JWT tokens. Change in production. |
| `CORS_ORIGINS` | No | Comma-separated allowed origins. Defaults to `*`. |
| `USDA_API_KEY` | No | API key for food search. Defaults to `DEMO_KEY` (rate-limited). Get one free at [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-guide.html). |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend base URL. Defaults to `http://localhost:5000`. |

## Project Structure

```
FitTrack/
├── backend/
│   ├── app.py              # Flask app factory, migrations, exercise seeding
│   ├── models.py           # SQLAlchemy models
│   ├── extensions.py       # Shared db instance
│   ├── met_lookup.py       # MET-based calorie burn calculation
│   ├── utils/
│   │   └── auth.py         # JWT helpers and @require_auth decorator
│   └── routes/
│       ├── auth.py         # /api/auth — signup, login, me
│       ├── workouts.py     # /api/workouts
│       ├── food.py         # /api/food
│       ├── profile.py      # /api/profile
│       ├── analytics.py    # /api/analytics
│       ├── exercises.py    # /api/exercises
│       └── export.py       # /api/export
└── frontend/
    └── src/
        ├── api.js              # Axios instance with auth interceptors
        ├── App.jsx             # Root component with protected routing
        ├── context/
        │   └── AuthContext.jsx # Auth state and token management
        ├── components/
        │   └── Navbar.jsx      # Sidebar (desktop) + top/bottom bars (mobile)
        └── pages/
            ├── Dashboard.jsx
            ├── Login.jsx
            ├── Signup.jsx
            ├── LogWorkout.jsx
            ├── FoodLog.jsx
            ├── History.jsx
            ├── Analytics.jsx
            └── Export.jsx
```

## Deploying to Render

The included `render.yaml` configures deployment on [Render.com](https://render.com):

1. Push to GitHub
2. Create a new Blueprint on Render and point it at your repo
3. Set the environment variables (`SECRET_KEY`, `USDA_API_KEY`, frontend `VITE_API_URL`) in the Render dashboard
4. Render provisions a PostgreSQL database and connects it automatically via `DATABASE_URL`

## Authentication

User accounts are stored with bcrypt-hashed passwords. On login or sign-up the server returns a JWT (30-day expiry) which the frontend stores in `localStorage`. The token is automatically attached to every API request. On expiry or logout the token is cleared and the user is redirected to the login page.

## Database Migrations

There is no Alembic. Schema changes are handled in `app.py::_migrate_db()`, which runs `ALTER TABLE … ADD COLUMN` on startup and silently skips columns that already exist. Add new migrations there.
