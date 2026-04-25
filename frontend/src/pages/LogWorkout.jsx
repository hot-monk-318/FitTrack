import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getExercises, createWorkout, getProfile } from '../api'
import { format } from 'date-fns'

const WORKOUT_TYPES = [
  { value: 'strength', label: 'Strength', emoji: '💪' },
  { value: 'cardio',   label: 'Cardio',   emoji: '🔥' },
  { value: 'running',  label: 'Running',  emoji: '🏃' },
  { value: 'walking',  label: 'Walking',  emoji: '🚶' },
  { value: 'sports',   label: 'Sports',   emoji: '⚽' },
  { value: 'yoga',     label: 'Yoga',     emoji: '🧘' },
]

// MET values from 2024 Compendium — mirrors backend met_lookup.py
const EXERCISE_MET = {
  walking: 3.5, jogging: 7.0, running: 8.0, cycling: 4.0,
  elliptical: 5.0, 'rowing machine': 7.0, 'jump rope': 6.0,
  'stair climber': 9.3, swimming: 5.8, hiit: 11.0,
  'pull-up': 7.5, 'push-up': 3.8, dip: 7.5, plank: 2.8,
  crunch: 2.8, 'leg raise': 2.8, lunges: 3.8, 'glute bridge': 3.8,
  'bench press': 5.8, squat: 3.5, deadlift: 3.5, 'overhead press': 5.8,
  'barbell row': 5.8, 'romanian deadlift': 3.5, 'incline bench press': 5.8,
}
const CATEGORY_MET = { machine: 5.8, barbell: 5.8, dumbbell: 5.8, bodyweight: 3.8, cardio: 7.0, other: 5.0 }
const MINS_PER_SET = 3

function getMet(name, category) {
  return EXERCISE_MET[name.toLowerCase().trim()] || CATEGORY_MET[category] || 5.0
}

function estimateCalories(workoutExercises, weightKg) {
  if (!weightKg) return 0
  return Math.round(
    workoutExercises.reduce((total, we) => {
      const active = we.sets.filter((s) => s.weight > 0 || s.reps > 0)
      if (!active.length) return total
      const met = getMet(we.exercise.name, we.exercise.category)
      const isCardio = we.exercise.category === 'cardio'
      const durationMin = isCardio
        ? active.reduce((sum, s) => sum + (s.weight || 0), 0)
        : active.length * MINS_PER_SET
      return total + met * weightKg * (durationMin / 60)
    }, 0)
  )
}

const CATEGORY_COLOR = {
  machine:    'text-sky-400',
  barbell:    'text-orange-400',
  dumbbell:   'text-yellow-400',
  bodyweight: 'text-green-400',
  cardio:     'text-pink-400',
  other:      'text-zinc-400',
}

function SetRow({ set, onChange, onRemove, isCardio }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-600 text-xs w-5 text-center font-mono">{set.set_number}</span>
      <input
        type="number"
        inputMode="decimal"
        placeholder={isCardio ? 'min' : 'lbs'}
        value={set.weight || ''}
        onChange={(e) => onChange({ ...set, weight: parseFloat(e.target.value) || 0 })}
        className="flex-1 bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 min-w-0"
        min="0"
        step={isCardio ? '1' : '2.5'}
      />
      <input
        type="number"
        inputMode="numeric"
        placeholder={isCardio ? '1-10' : 'reps'}
        value={set.reps || ''}
        onChange={(e) => onChange({ ...set, reps: parseInt(e.target.value) || 0 })}
        className="flex-1 bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 min-w-0"
        min="0"
        max={isCardio ? '10' : undefined}
      />
      <span className="text-xs text-zinc-600 w-14 text-right shrink-0">
        {isCardio
          ? set.weight ? `${set.weight}min` : '—'
          : set.weight && set.reps ? `${Math.round(set.weight * set.reps)}lb` : '—'}
      </span>
      <button
        onClick={onRemove}
        className="text-zinc-700 hover:text-red-400 text-xl w-6 shrink-0 transition-colors"
      >
        ×
      </button>
    </div>
  )
}

function ExerciseBlock({ we, onUpdate, onRemove }) {
  const addSet = () => {
    const last = we.sets.at(-1)
    onUpdate({
      ...we,
      sets: [
        ...we.sets,
        { set_number: we.sets.length + 1, weight: last?.weight || 0, reps: last?.reps || 0, completed: true },
      ],
    })
  }

  const updateSet = (i, updated) =>
    onUpdate({ ...we, sets: we.sets.map((s, idx) => (idx === i ? updated : s)) })

  const removeSet = (i) =>
    onUpdate({
      ...we,
      sets: we.sets.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, set_number: idx + 1 })),
    })

  const isCardio = we.exercise.category === 'cardio'
  const catColor = CATEGORY_COLOR[we.exercise.category] || 'text-zinc-400'

  return (
    <div className="bg-ft-card border border-ft-border rounded-xl mb-3 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ft-border/60 bg-ft-surface/30">
        <div>
          <p className="font-semibold text-white">{we.exercise.name}</p>
          <p className={`text-xs mt-0.5 capitalize font-medium ${catColor}`}>
            {we.exercise.category}
            {we.exercise.muscle_group ? ` · ${we.exercise.muscle_group}` : ''}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="text-zinc-600 hover:text-red-400 text-xs transition-colors px-2 py-1 hover:bg-red-400/10 rounded-lg"
        >
          Remove
        </button>
      </div>

      <div className="px-4 pt-2 pb-3">
        <div className="flex text-[10px] text-zinc-600 mb-2 gap-2 uppercase tracking-wider">
          <span className="w-5" />
          <span className="flex-1 text-center">{isCardio ? 'Duration (min)' : 'Weight (lbs)'}</span>
          <span className="flex-1 text-center">{isCardio ? 'Intensity (1-10)' : 'Reps'}</span>
          <span className="w-14" />
          <span className="w-6" />
        </div>

        <div className="space-y-2 mb-3">
          {we.sets.map((s, i) => (
            <SetRow
              key={i}
              set={s}
              isCardio={isCardio}
              onChange={(u) => updateSet(i, u)}
              onRemove={() => removeSet(i)}
            />
          ))}
        </div>

        <button
          onClick={addSet}
          className="w-full py-2 text-xs text-violet-400 border border-dashed border-zinc-700 rounded-lg hover:border-violet-500 hover:bg-violet-500/5 transition-all"
        >
          + Add Set
        </button>
      </div>
    </div>
  )
}

export default function LogWorkout() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState([])
  const [workoutExercises, setWorkoutExercises] = useState([])
  const [workoutType, setWorkoutType] = useState('strength')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [weightKg, setWeightKg] = useState(70)

  useEffect(() => {
    getExercises().then((res) => setExercises(res.data))
    getProfile()
      .then((res) => { if (res.data?.current_weight_kg) setWeightKg(res.data.current_weight_kg) })
      .catch(() => {})
  }, [])

  const estCalories = estimateCalories(workoutExercises, weightKg)

  const filtered = search.trim()
    ? exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase().trim()))
    : exercises

  const addExercise = (exercise) => {
    setWorkoutExercises((prev) => [
      ...prev,
      { exercise, exercise_id: exercise.id, sets: [{ set_number: 1, weight: 0, reps: 0, completed: true }] },
    ])
    setShowPicker(false)
    setSearch('')
  }

  const save = async () => {
    if (workoutExercises.length === 0) return
    setSaving(true)
    try {
      const typeLabel = WORKOUT_TYPES.find((t) => t.value === workoutType)?.label || workoutType
      await createWorkout({
        name: typeLabel,
        workout_type: workoutType,
        date: new Date(date + 'T12:00:00').toISOString(),
        exercises: workoutExercises.map((we, i) => ({
          exercise_id: we.exercise_id,
          order: i,
          sets: we.sets.filter((s) => s.reps > 0 || s.weight > 0),
        })),
      })
      navigate('/')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-white">Log Workout</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-ft-surface border border-ft-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
        />
      </div>

      {/* Workout type pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-none -mx-4 px-4">
        {WORKOUT_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setWorkoutType(t.value)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
              workoutType === t.value
                ? 'bg-green-500 text-black shadow-lg shadow-green-500/30'
                : 'bg-ft-card border border-ft-border text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
            }`}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Added exercises */}
      {workoutExercises.map((we, i) => (
        <ExerciseBlock
          key={i}
          we={we}
          onUpdate={(u) => setWorkoutExercises((prev) => prev.map((e, idx) => (idx === i ? u : e)))}
          onRemove={() => setWorkoutExercises((prev) => prev.filter((_, idx) => idx !== i))}
        />
      ))}

      {/* Add exercise button */}
      <button
        onClick={() => setShowPicker(true)}
        className="w-full py-3.5 border-2 border-dashed border-zinc-700 rounded-xl text-zinc-500 hover:border-violet-500 hover:text-violet-400 hover:bg-violet-500/5 transition-all mb-4 text-sm font-medium"
      >
        + Add Exercise
      </button>

      {/* Live calorie estimate */}
      {estCalories > 0 && (
        <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-4">
          <span className="text-2xl">🔥</span>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Est. Calories Burned</p>
            <p className="text-orange-400 font-bold text-xl leading-tight">~{estCalories.toLocaleString()} cal</p>
          </div>
          <span className="text-[10px] text-zinc-700 ml-auto">MET · 2024</span>
        </div>
      )}

      {/* Save */}
      <button
        onClick={save}
        disabled={saving || workoutExercises.length === 0}
        className="w-full bg-green-500 hover:bg-green-400 disabled:bg-ft-surface disabled:text-zinc-600 text-black font-bold py-4 rounded-xl transition-all shadow-lg shadow-green-500/20 text-base"
      >
        {saving ? 'Saving…' : 'Save Workout'}
      </button>

      {/* Exercise picker — bottom sheet on mobile, centered modal on desktop */}
      {showPicker && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowPicker(false); setSearch('') } }}
        >
          <div className="bg-ft-card border border-ft-border rounded-t-3xl md:rounded-2xl w-full max-w-lg flex flex-col max-h-[88vh] md:max-h-[70vh] md:m-4">
            {/* Pull indicator (mobile only) */}
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mt-3 md:hidden" />

            <div className="p-4 border-b border-ft-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white">Choose Exercise</h3>
                <button
                  onClick={() => { setShowPicker(false); setSearch('') }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ft-surface text-zinc-400 hover:text-white text-xl transition-colors"
                >
                  ×
                </button>
              </div>
              <input
                type="text"
                placeholder="Search exercises…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full bg-ft-surface border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500 placeholder-zinc-600"
              />
              {search.trim() && (
                <p className="text-xs text-zinc-600 mt-2">
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="text-center text-zinc-600 py-12 text-sm">
                  No exercises match &ldquo;{search}&rdquo;
                </p>
              ) : (
                filtered.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => addExercise(e)}
                    className="w-full text-left px-4 py-3.5 hover:bg-ft-surface/60 border-b border-ft-border/40 transition-colors flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{e.name}</p>
                      <p className={`text-xs capitalize mt-0.5 ${CATEGORY_COLOR[e.category] || 'text-zinc-500'}`}>
                        {e.category}{e.muscle_group ? ` · ${e.muscle_group}` : ''}
                      </p>
                    </div>
                    <span className="text-zinc-600 text-lg shrink-0">+</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
