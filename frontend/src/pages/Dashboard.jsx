import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell } from 'recharts'
import { getSummary, getWorkouts, getFoodLogs, getProfile, updateProfile } from '../api'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../context/AuthContext'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

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

function computeMacroGoals(profile, targetCalories) {
  if (!profile || !targetCalories || !profile.current_weight_kg) return null
  const { current_weight_kg, activity_level } = profile
  const proteinMultiplier = ['active', 'very_active'].includes(activity_level) ? 2.0 : 1.6
  const protein_g = Math.round(current_weight_kg * proteinMultiplier)
  const fat_g = Math.round((targetCalories * 0.25) / 9)
  const carb_g = Math.max(0, Math.round((targetCalories - protein_g * 4 - fat_g * 9) / 4))
  return { protein_g, fat_g, carb_g }
}

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary (desk job, no exercise)' },
  { value: 'light', label: 'Light (1-3 days/week)' },
  { value: 'moderate', label: 'Moderate (3-5 days/week)' },
  { value: 'active', label: 'Active (6-7 days/week)' },
  { value: 'very_active', label: 'Very Active (athlete/physical job)' },
]

const KG_PER_LB = 0.453592
const CM_PER_INCH = 2.54

function lbsToKg(lbs) { return Math.round(lbs * KG_PER_LB * 100) / 100 }
function kgToLbs(kg) { return Math.round(kg / KG_PER_LB * 10) / 10 }
function cmToFtIn(cm) {
  const totalIn = cm / CM_PER_INCH
  return { ft: Math.floor(totalIn / 12), inches: Math.round(totalIn % 12) }
}
function ftInToCm(ft, inches) { return Math.round((ft * 12 + inches) * CM_PER_INCH) }

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

function ProfileModal({ profile, onSave, onClose }) {
  const { ft: initFt, inches: initIn } = cmToFtIn(profile.height_cm || 170)
  const [form, setForm] = useState({
    age: profile.age,
    gender: profile.gender,
    height_ft: initFt,
    height_in: initIn,
    weight_lbs: kgToLbs(profile.current_weight_kg || 70),
    target_lbs: kgToLbs(profile.target_weight_kg || 70),
    activity_level: profile.activity_level,
  })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const toMetric = (f) => ({
    age: f.age,
    gender: f.gender,
    activity_level: f.activity_level,
    height_cm: ftInToCm(f.height_ft || 0, f.height_in || 0),
    current_weight_kg: lbsToKg(f.weight_lbs || 0),
    target_weight_kg: lbsToKg(f.target_lbs || 0),
  })

  const metricForm = toMetric(form)
  const previewCal = form.age && (form.height_ft || form.height_in) && form.weight_lbs
    ? computeTargetCalories(metricForm)
    : null
  const previewMacros = previewCal ? computeMacroGoals(metricForm, previewCal) : null

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-ft-card border border-ft-border rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Profile & Goals</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 mb-1 block">Age</label>
              <input type="number" value={form.age || ''} onChange={(e) => set('age', parseInt(e.target.value) || '')}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500" min="10" max="100" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-zinc-500 mb-1 block">Gender</label>
              <select value={form.gender} onChange={(e) => set('gender', e.target.value)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Height</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input type="number" value={form.height_ft ?? ''} onChange={(e) => set('height_ft', parseInt(e.target.value) || 0)}
                  className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 pr-8" min="3" max="8" />
                <span className="absolute right-3 top-2 text-xs text-zinc-500">ft</span>
              </div>
              <div className="flex-1 relative">
                <input type="number" value={form.height_in ?? ''} onChange={(e) => set('height_in', parseInt(e.target.value) || 0)}
                  className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 pr-8" min="0" max="11" />
                <span className="absolute right-3 top-2 text-xs text-zinc-500">in</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <label className="text-xs text-zinc-500 mb-1 block">Current Weight</label>
              <input type="number" value={form.weight_lbs ?? ''} onChange={(e) => set('weight_lbs', parseFloat(e.target.value) || '')}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 pr-9" min="60" max="700" step="0.5" />
              <span className="absolute right-3 bottom-2 text-xs text-zinc-500">lbs</span>
            </div>
            <div className="flex-1 relative">
              <label className="text-xs text-zinc-500 mb-1 block">Target Weight</label>
              <input type="number" value={form.target_lbs ?? ''} onChange={(e) => set('target_lbs', parseFloat(e.target.value) || '')}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 pr-9" min="60" max="700" step="0.5" />
              <span className="absolute right-3 bottom-2 text-xs text-zinc-500">lbs</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Activity Level</label>
            <select value={form.activity_level} onChange={(e) => set('activity_level', e.target.value)}
              className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500">
              {ACTIVITY_LEVELS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          {previewCal && (
            <div className="bg-ft-surface rounded-lg px-4 py-3">
              <p className="text-xs text-zinc-500 mb-2 text-center">Estimated Daily Goals</p>
              <p className="text-2xl font-bold text-green-400 text-center mb-1">
                {previewCal.toLocaleString()} cal
              </p>
              {form.weight_lbs !== form.target_lbs && (
                <p className="text-xs text-zinc-500 text-center mb-3">
                  {form.weight_lbs > form.target_lbs ? 'Deficit' : 'Surplus'} to reach {form.target_lbs} lbs
                </p>
              )}
              {previewMacros && (
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-700">
                  <div className="text-center">
                    <p className="text-xs text-zinc-500">Protein</p>
                    <p className="text-base font-bold text-blue-400">{previewMacros.protein_g}g</p>
                    <p className="text-xs text-zinc-600">{previewMacros.protein_g * 4} cal</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-zinc-500">Carbs</p>
                    <p className="text-base font-bold text-yellow-400">{previewMacros.carb_g}g</p>
                    <p className="text-xs text-zinc-600">{previewMacros.carb_g * 4} cal</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-zinc-500">Fat</p>
                    <p className="text-base font-bold text-orange-400">{previewMacros.fat_g}g</p>
                    <p className="text-xs text-zinc-600">{previewMacros.fat_g * 9} cal</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => onSave(toMetric(form))}
          className="w-full mt-4 bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl transition-colors"
        >
          Save Profile
        </button>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [summary, setSummary] = useState(null)
  const [recentWorkouts, setRecentWorkouts] = useState([])
  const [foodData, setFoodData] = useState(null)
  const [profile, setProfile] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
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
  const handleSaveProfile = async (data) => {
    const res = await updateProfile(data)
    setProfile(res.data)
    setShowProfile(false)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">
          {greeting()}, {user?.first_name || 'there'} 👋
        </h2>
        <div className="mt-2">
          <button
            onClick={() => setShowProfile(true)}
            className="inline-flex items-center text-xs text-zinc-400 hover:text-green-400 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            ⚙ Profile
          </button>
        </div>
      </div>

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

      {showProfile && profile && (
        <ProfileModal
          profile={profile}
          onSave={handleSaveProfile}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  )
}
