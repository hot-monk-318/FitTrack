import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell } from 'recharts'
import { getSummary, getWorkouts, getFoodLogs, getProfile } from '../api'
import { format, parseISO } from 'date-fns'

function computeTargetCalories(profile) {
  const { age, gender, height_cm, current_weight_kg, target_weight_kg, activity_level } = profile
  if (!age || !height_cm || !current_weight_kg) return null
  const bmr =
    gender === 'female'
      ? 10 * current_weight_kg + 6.25 * height_cm - 5 * age - 161
      : 10 * current_weight_kg + 6.25 * height_cm - 5 * age + 5
  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 }
  const tdee = bmr * (multipliers[activity_level] || 1.55)
  const weightDiffKg = current_weight_kg - (target_weight_kg || current_weight_kg)
  const dailyAdjustment = Math.min(Math.max(weightDiffKg * 157, -750), 750)
  return Math.round(tdee - dailyAdjustment)
}

const MACRO_DEFS = [
  { key: 'protein',       label: 'Protein', color: '#3b82f6' },
  { key: 'nonSugarCarbs', label: 'Carbs',   color: '#eab308' },
  { key: 'sugar',         label: 'Sugar',   color: '#ef4444' },
  { key: 'fat',           label: 'Fat',     color: '#f97316' },
]

function WorkoutSummaryCard({ todayWorkouts, caloriesBurnedToday }) {
  return (
    <div className="bg-ft-card border border-ft-border border-t-2 border-t-green-500/50 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>💪</span> Today's Workout
        </h3>
        <Link
          to="/log"
          className="bg-green-500 hover:bg-green-400 text-black font-semibold px-3 py-1.5 rounded-lg text-xs transition-all shadow-sm shadow-green-500/20"
        >
          + Log Workout
        </Link>
      </div>

      {todayWorkouts.length === 0 ? (
        <div className="py-5 text-center">
          <p className="text-zinc-500 text-sm">No workout logged today.</p>
          <p className="text-xs text-zinc-700 mt-1">Tap "Log Workout" to get started.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {todayWorkouts.map((w) => (
            <Link
              key={w.id}
              to="/history"
              className="flex items-center justify-between py-2 hover:opacity-80 transition-opacity"
            >
              <div>
                <p className="text-sm font-medium text-white">{w.name}</p>
                <p className="text-xs text-zinc-500 capitalize">{w.workout_type}</p>
              </div>
              <span className="text-zinc-600 text-lg">›</span>
            </Link>
          ))}
          {caloriesBurnedToday > 0 && (
            <div className="pt-2 mt-1 border-t border-ft-border flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">Est. burned today:</span>
              <span className="text-xs font-semibold text-orange-400">
                ~{caloriesBurnedToday.toLocaleString()} cal
              </span>
              <span className="text-xs text-zinc-700">(MET)</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FoodSummaryCard({ calories, targetCalories, protein, carbs, fat, sugar, caloriesBurnedToday }) {
  const burned = caloriesBurnedToday || 0
  const netRemaining = targetCalories != null ? targetCalories - calories + burned : null
  const calOver = netRemaining !== null && netRemaining < 0

  const donutData = targetCalories
    ? [{ value: calories }, { value: Math.max(targetCalories - calories, 0) }]
    : [{ value: calories || 1 }, { value: 0 }]

  const nonSugarCarbs = Math.max(carbs - sugar, 0)
  const macroValues = { protein, nonSugarCarbs, sugar, fat }
  const macroSlices = MACRO_DEFS
    .map((d) => ({ ...d, value: Math.round(macroValues[d.key]) }))
    .filter((s) => s.value > 0)
  const hasMacros = macroSlices.length > 0

  return (
    <div className="bg-ft-card border border-ft-border border-t-2 border-t-orange-500/50 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>🥗</span> Today's Nutrition
        </h3>
        <Link
          to="/food"
          className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-all shadow-sm shadow-orange-500/20"
        >
          + Log Food
        </Link>
      </div>

      {/* Net calorie balance banner */}
      {netRemaining !== null && (
        <div
          className={`rounded-lg px-3 py-2 mb-4 ${
            calOver
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-green-500/10 border border-green-500/20'
          }`}
        >
          <p className={`text-base font-bold ${calOver ? 'text-red-400' : 'text-green-400'}`}>
            {calOver
              ? `${Math.abs(netRemaining).toLocaleString()} cal over budget`
              : `${netRemaining.toLocaleString()} cal remaining`}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Goal {targetCalories.toLocaleString()}
            {' '}− Consumed {calories.toLocaleString()}
            {burned > 0 ? ` + Burned ${burned.toLocaleString()}` : ''}
          </p>
        </div>
      )}

      {calories === 0 ? (
        <p className="text-sm text-zinc-600 text-center py-4">
          No food logged today.{' '}
          <Link to="/food" className="text-green-500 hover:underline">
            Log your meals
          </Link>
        </p>
      ) : (
        <>
          {/* Charts row */}
          <div className="flex items-center justify-around mb-3">
            {/* Calorie donut */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <PieChart width={120} height={120}>
                  <Pie
                    data={donutData}
                    cx={60} cy={60}
                    innerRadius={36} outerRadius={56}
                    dataKey="value"
                    startAngle={90} endAngle={-270}
                    strokeWidth={0}
                  >
                    <Cell fill={calOver ? '#ef4444' : '#22c55e'} />
                    <Cell fill="#2a2347" />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-sm font-bold text-white leading-tight">
                    {calories >= 1000 ? `${(calories / 1000).toFixed(1)}k` : calories}
                  </span>
                  <span className="text-[10px] text-zinc-600 leading-none">cal</span>
                </div>
              </div>
              <span className="text-[10px] text-zinc-600">Calories</span>
            </div>

            {/* Macro pie */}
            {hasMacros && (
              <div className="flex flex-col items-center gap-1">
                <PieChart width={120} height={120}>
                  <Pie
                    data={macroSlices}
                    cx={60} cy={60}
                    outerRadius={52}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {macroSlices.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                </PieChart>
                <span className="text-[10px] text-zinc-600">Macros</span>
              </div>
            )}
          </div>

          {/* Macro legend */}
          {hasMacros && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
              {macroSlices.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label} <span className="text-zinc-500">{s.value}g</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [recentWorkouts, setRecentWorkouts] = useState([])
  const [foodData, setFoodData] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    Promise.all([
      getSummary(),
      getWorkouts({ per_page: 10 }),
      getFoodLogs(today),
      getProfile(),
    ])
      .then(([s, w, food, prof]) => {
        setSummary(s.data)
        setRecentWorkouts(w.data.workouts)
        const logs = food.data || []
        setFoodData({
          calories: logs.reduce((acc, l) => acc + l.calories, 0),
          protein:  logs.reduce((acc, l) => acc + (l.protein || 0), 0),
          carbs:    logs.reduce((acc, l) => acc + (l.carbs || 0), 0),
          fat:      logs.reduce((acc, l) => acc + (l.fat || 0), 0),
          sugar:    logs.reduce((acc, l) => acc + (l.sugar_total || 0), 0),
        })
        setProfile(prof.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [today])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-600">Loading...</div>
  }

  const targetCalories = profile ? computeTargetCalories(profile) : null
  const todayWorkouts = recentWorkouts.filter((w) => w.date.startsWith(today))
  const caloriesBurnedToday = summary?.calories_burned_today || 0

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-white mb-6">Dashboard</h2>

      <WorkoutSummaryCard
        todayWorkouts={todayWorkouts}
        caloriesBurnedToday={caloriesBurnedToday}
      />

      {foodData && (
        <FoodSummaryCard
          calories={foodData.calories}
          targetCalories={targetCalories}
          protein={foodData.protein}
          carbs={foodData.carbs}
          fat={foodData.fat}
          sugar={foodData.sugar}
          caloriesBurnedToday={caloriesBurnedToday}
        />
      )}
    </div>
  )
}
