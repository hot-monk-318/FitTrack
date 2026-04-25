# MET values sourced from the 2024 Compendium of Physical Activities (Ainsworth et al.)
# Stored in docs/1_2024-adult-compendium_1_2024.pdf
# Formula: Calories = MET × weight_kg × duration_hours

# Exercise name → MET (lowercase keys for case-insensitive lookup)
EXERCISE_MET = {
    # ── Cardio ─────────────────────────────────────────────────────────────
    'walking':        3.5,   # code 16010 – walking, normal pace
    'jogging':        7.0,   # code 12010 – jogging, general
    'running':        8.0,   # code 12150 – running, general
    'cycling':        4.0,   # code 01010 – bicycling, <10 mph, leisure
    'elliptical':     5.0,   # code 02045 – elliptical trainer, moderate effort
    'rowing machine': 7.0,   # code 02071 – rowing stationary, moderate (<100 W)
    'jump rope':      6.0,   # code 02090 – rope skipping, general
    'stair climber':  9.3,   # code 02065 – stair treadmill ergometer, general
    'swimming':       5.8,   # code 18310 – swimming, freestyle, slow, recreational
    'hiit':           11.0,  # code 02069 – HIIT, vigorous (Tabata, burpees, etc.)

    # ── Sports (stored as cardio category / sports muscle_group) ───────────
    'soccer':      10.0,  # code 15620 – soccer, competitive
    'basketball':   6.5,  # code 15060 – basketball, general
    'tennis':       7.3,  # code 15690 – tennis, general, moderate effort
    'volleyball':   6.0,  # code 15710 – volleyball, competitive, gymnasium

    # ── Bodyweight ─────────────────────────────────────────────────────────
    'pull-up':     7.5,  # code 02020 – calisthenics, vigorous (pull-ups, burpees)
    'push-up':     3.8,  # code 02022 – calisthenics, moderate (push-ups, lunges)
    'dip':         7.5,  # code 02020 – calisthenics, vigorous
    'plank':       2.8,  # code 02024 – calisthenics, light (plank, crunches)
    'crunch':      2.8,  # code 02024 – calisthenics, light
    'leg raise':   2.8,  # code 02024 – calisthenics, light
    'lunges':      3.8,  # code 02022 – calisthenics, moderate
    'glute bridge':3.8,  # code 02022 – calisthenics, moderate

    # ── Barbell ────────────────────────────────────────────────────────────
    'bench press':         5.8,  # code 02055 – resistance, multiple exercises, 8-15 reps
    'squat':               3.5,  # code 02054 – squats/deadlift, slow or explosive effort
    'deadlift':            3.5,  # code 02054 – squats/deadlift, slow or explosive effort
    'overhead press':      5.8,  # code 02055
    'barbell row':         5.8,  # code 02055
    'romanian deadlift':   3.5,  # code 02054 – slow/explosive effort
    'incline bench press': 5.8,  # code 02055

    # ── Machine ────────────────────────────────────────────────────────────
    'chest press':          5.8,  # code 02055
    'shoulder press':       5.8,
    'lat pulldown':         5.8,
    'seated cable row':     5.8,
    'leg press':            5.8,
    'leg extension':        5.8,
    'leg curl':             5.8,
    'pec deck / cable fly': 5.8,
    'tricep pushdown':      5.8,
    'bicep curl machine':   5.8,
    'hip abductor':         5.8,
    'hip adductor':         5.8,
    'calf raise machine':   5.8,
    'back extension':       5.8,
    'assisted pull-up':     5.8,
    'assisted dip':         5.8,

    # ── Dumbbell ───────────────────────────────────────────────────────────
    'dumbbell curl':             5.8,  # code 02055
    'dumbbell press':            5.8,
    'lateral raise':             5.8,
    'tricep overhead extension': 5.8,
    'dumbbell row':              5.8,
    'goblet squat':              5.8,
    'dumbbell fly':              5.8,
    'hammer curl':               5.8,
    'bulgarian split squat':     5.8,
}

# Fallback MET by exercise category when exercise name is not in the table above
CATEGORY_MET = {
    'machine':    5.8,   # code 02055 – weight training, multiple exercises
    'barbell':    5.8,   # code 02055
    'dumbbell':   5.8,   # code 02055
    'bodyweight': 3.8,   # code 02022 – calisthenics, moderate
    'cardio':     7.0,   # general cardio fallback
    'other':      5.0,
}

# Estimated minutes per completed strength set (active work + rest interval)
_MINS_PER_STRENGTH_SET = 3


def get_met(exercise_name: str, exercise_category: str) -> float:
    """Return MET for an exercise by name, falling back to category average."""
    return (
        EXERCISE_MET.get(exercise_name.lower().strip())
        or CATEGORY_MET.get(exercise_category, 5.0)
    )


def compute_workout_calories(workout, weight_kg: float) -> int:
    """Estimate calories burned for a workout given the user's body weight.

    For cardio exercises: set.weight stores duration in minutes (LogWorkout.jsx convention).
    For strength exercises: assumes _MINS_PER_STRENGTH_SET minutes per completed set.

    Returns 0 if weight_kg is unavailable.
    """
    if not weight_kg or weight_kg <= 0:
        return 0
    total = 0.0
    for we in workout.exercises:
        ex = we.exercise
        completed = [s for s in we.sets if s.completed]
        if not completed:
            continue
        met = get_met(ex.name, ex.category)
        duration_min = (
            sum(s.weight or 0 for s in completed)
            if ex.category == 'cardio'
            else len(completed) * _MINS_PER_STRENGTH_SET
        )
        if duration_min > 0:
            total += met * weight_kg * (duration_min / 60.0)
    return round(total)
