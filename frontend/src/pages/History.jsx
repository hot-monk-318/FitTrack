import { useEffect, useState } from 'react'
import { getWorkout, getWorkouts, deleteWorkout } from '../api'
import { format, parseISO } from 'date-fns'

function WorkoutDetail({ workout }) {
  const totalVolume = workout.exercises.reduce(
    (sum, we) => sum + we.sets.reduce((s2, s) => s2 + s.volume, 0),
    0
  )

  return (
    <div className="mt-3 space-y-3">
      {workout.exercises.map((we) => (
        <div key={we.id} className="bg-ft-bg rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <p className="font-medium text-white text-sm">{we.exercise.name}</p>
            <span className="text-xs text-zinc-600 capitalize bg-ft-card px-2 py-0.5 rounded-full">
              {we.exercise.category}
            </span>
          </div>
          <div className="space-y-1">
            {we.sets.map((s) => {
              const isCardio = we.exercise.category === 'cardio'
              return (
                <div key={s.id} className="flex gap-3 text-sm text-zinc-400">
                  <span className="text-zinc-600 w-4">{s.set_number}</span>
                  {isCardio ? (
                    <>
                      <span>{s.weight} min</span>
                      <span className="text-zinc-600">·</span>
                      <span>intensity {s.reps}/10</span>
                    </>
                  ) : (
                    <>
                      <span>{s.weight} lbs</span>
                      <span className="text-zinc-600">×</span>
                      <span>{s.reps} reps</span>
                      <span className="ml-auto text-zinc-600">{s.volume} lbs</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-zinc-600">
          {workout.calories_burned != null && workout.calories_burned > 0 && (
            <>Est. burned: <span className="text-orange-400">~{workout.calories_burned.toLocaleString()} cal</span></>
          )}
        </p>
        <p className="text-xs text-zinc-600">
          Total volume:{' '}
          <span className="text-zinc-400">{totalVolume.toLocaleString()} lbs</span>
        </p>
      </div>
      {workout.notes && (
        <p className="text-xs text-zinc-500 italic">{workout.notes}</p>
      )}
    </div>
  )
}

export default function History() {
  const [workouts, setWorkouts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [expanded, setExpanded] = useState(null)
  const [cache, setCache] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getWorkouts({ page, per_page: 15 })
      .then((res) => {
        setWorkouts(res.data.workouts)
        setTotal(res.data.total)
        setPages(res.data.pages)
      })
      .finally(() => setLoading(false))
  }, [page])

  const toggle = async (id) => {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    if (!cache[id]) {
      const res = await getWorkout(id)
      setCache((prev) => ({ ...prev, [id]: res.data }))
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this workout?')) return
    await deleteWorkout(id)
    setWorkouts((prev) => prev.filter((w) => w.id !== id))
    setTotal((t) => t - 1)
    if (expanded === id) setExpanded(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-600">Loading…</div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">History</h2>
        <span className="text-sm text-zinc-500">{total} workouts</span>
      </div>

      {workouts.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-5xl mb-4">📋</p>
          <p>No workouts logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workouts.map((w) => (
            <div
              key={w.id}
              className="bg-ft-card border border-ft-border rounded-xl overflow-hidden"
            >
              <button
                className="w-full text-left p-4 flex items-center gap-3 hover:bg-ft-surface/40 transition-colors"
                onClick={() => toggle(w.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{w.name}</p>
                  <p className="text-sm text-zinc-500">
                    {format(parseISO(w.date), 'EEE, MMM d yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => handleDelete(w.id, e)}
                    className="text-zinc-700 hover:text-red-400 px-2 py-1 rounded transition-colors text-sm"
                  >
                    Delete
                  </button>
                  <span
                    className={`text-zinc-500 text-lg transition-transform duration-200 ${
                      expanded === w.id ? 'rotate-90' : ''
                    }`}
                  >
                    ›
                  </span>
                </div>
              </button>
              {expanded === w.id && cache[w.id] && (
                <div className="px-4 pb-4">
                  <WorkoutDetail workout={cache[w.id]} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 bg-ft-surface text-zinc-300 rounded-lg disabled:opacity-40 hover:bg-ft-muted transition-colors"
          >
            ← Prev
          </button>
          <span className="text-zinc-500 text-sm">
            {page} / {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 bg-ft-surface text-zinc-300 rounded-lg disabled:opacity-40 hover:bg-ft-muted transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
