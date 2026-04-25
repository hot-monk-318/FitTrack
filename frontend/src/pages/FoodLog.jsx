import { useState, useEffect, useCallback, useRef } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { getFoodLogs, createFoodLog, deleteFoodLog, getProfile, updateProfile, searchFood } from '../api'
import { toGrams, servingLabel, scaleNutrients, DENSITY_OPTIONS, UNIT_OPTIONS } from '../utils/servingConversions'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' }
const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary (desk job, no exercise)' },
  { value: 'light', label: 'Light (1-3 days/week)' },
  { value: 'moderate', label: 'Moderate (3-5 days/week)' },
  { value: 'active', label: 'Active (6-7 days/week)' },
  { value: 'very_active', label: 'Very Active (athlete/physical job)' },
]

// Unit conversion helpers — backend always stores metric (kg, cm)
const KG_PER_LB = 0.453592
const CM_PER_INCH = 2.54

function lbsToKg(lbs) { return Math.round(lbs * KG_PER_LB * 100) / 100 }
function kgToLbs(kg) { return Math.round(kg / KG_PER_LB * 10) / 10 }
function cmToFtIn(cm) {
  const totalIn = cm / CM_PER_INCH
  return { ft: Math.floor(totalIn / 12), inches: Math.round(totalIn % 12) }
}
function ftInToCm(ft, inches) { return Math.round((ft * 12 + inches) * CM_PER_INCH) }

function computeTargetCalories(profile) {
  const { age, gender, height_cm, current_weight_kg, target_weight_kg, activity_level } = profile
  if (!age || !height_cm || !current_weight_kg) return null
  const bmr = gender === 'female'
    ? 10 * current_weight_kg + 6.25 * height_cm - 5 * age - 161
    : 10 * current_weight_kg + 6.25 * height_cm - 5 * age + 5
  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 }
  const tdee = bmr * (multipliers[activity_level] || 1.55)
  const weightDiffKg = current_weight_kg - target_weight_kg
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

// AHA recommended added sugar limits: women 25g, men 36g per day
function computeSugarGoal(profile) {
  if (!profile) return null
  return profile.gender === 'female' ? 25 : 36
}

function MacroBar({ label, current, goal, color }) {
  const pct = goal ? Math.min(Math.round((current / goal) * 100), 100) : 0
  const over = goal && current > goal
  const remaining = goal ? goal - current : null

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className={`text-xs font-semibold ${over ? 'text-red-400' : 'text-zinc-300'}`}>
          {Math.round(current)}g{goal ? ` / ${goal}g` : ''}
        </span>
      </div>
      {goal && (
        <div className="w-full bg-ft-surface rounded-full h-1.5 mb-1">
          <div
            className={`h-1.5 rounded-full transition-all ${over ? 'bg-red-500' : color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {goal && (
        <p className="text-xs text-zinc-600">
          {over
            ? `${Math.round(current - goal)}g over`
            : `${Math.round(remaining)}g left`}
        </p>
      )}
    </div>
  )
}

const VOLUME_UNITS = new Set(['cup', 'tbsp', 'tsp'])

function MealSection({ meal, entries, date, onAdd, onDelete }) {
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('cup')
  const [density, setDensity] = useState('dense')
  const [cal, setCal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [sugarTotal, setSugarTotal] = useState('')
  const [sugarAdded, setSugarAdded] = useState('')
  const [pieceGrams, setPieceGrams] = useState(100)
  const [foodServings, setFoodServings] = useState([])
  const [adding, setAdding] = useState(false)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)
  const dropdownRef = useRef(null)

  const totalCal = entries.reduce((s, e) => s + e.calories, 0)
  const totalProtein = entries.reduce((s, e) => s + (e.protein || 0), 0)
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs || 0), 0)
  const totalFat = entries.reduce((s, e) => s + (e.fat || 0), 0)
  const totalSugarTotal = entries.reduce((s, e) => s + (e.sugar_total || 0), 0)
  const hasMacros = totalProtein > 0 || totalCarbs > 0 || totalFat > 0

  const needsDensity = VOLUME_UNITS.has(unit)
  const estimatedGrams = unit === 'piece'
    ? Math.round((parseFloat(qty) || 0) * pieceGrams)
    : toGrams(parseFloat(qty) || 0, unit, density)

  const handleDescChange = (val) => {
    setDesc(val)
    setShowDropdown(false)
    clearTimeout(debounceRef.current)
    if (val.trim().length < 3) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await searchFood(val.trim())
        setResults(res.data || [])
        setShowDropdown(true)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 420)
  }

  const selectResult = (food) => {
    setDesc(food.name)
    setShowDropdown(false)
    setResults([])
    const servings = food.servings || []
    setFoodServings(servings)

    let grams
    if (servings.length > 0) {
      // USDA has a real serving size — switch to piece mode, 1 piece = first serving
      const first = servings[0]
      setPieceGrams(first.grams)
      setUnit('piece')
      setQty('1')
      grams = first.grams
    } else {
      grams = estimatedGrams || 100
    }

    const scaled = scaleNutrients(food, grams)
    setCal(String(scaled.calories || ''))
    setProtein(String(scaled.protein || ''))
    setCarbs(String(scaled.carbs || ''))
    setFat(String(scaled.fat || ''))
    setSugarTotal(String(scaled.sugar_total || ''))
    setSugarAdded(String(scaled.sugar_added || ''))
  }

  const reset = () => {
    setDesc(''); setQty('1'); setUnit('cup'); setDensity('dense')
    setCal(''); setProtein(''); setCarbs(''); setFat('')
    setSugarTotal(''); setSugarAdded('')
    setPieceGrams(100); setFoodServings([])
    setResults([]); setShowDropdown(false)
  }

  const submit = async () => {
    if (!cal || parseInt(cal) <= 0) return
    const qtyNum = parseFloat(qty) || 1
    const label = unit === 'piece'
      ? `${qtyNum} piece${qtyNum !== 1 ? 's' : ''} (~${Math.round(qtyNum * pieceGrams)}g)`
      : servingLabel(qtyNum, unit, density)
    const fullDesc = desc ? `${desc} — ${label}` : label
    await onAdd({
      date,
      meal_type: meal,
      description: fullDesc,
      calories: parseInt(cal),
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
      sugar_total: parseFloat(sugarTotal) || 0,
      sugar_added: parseFloat(sugarAdded) || 0,
    })
    reset()
    setAdding(false)
  }

  return (
    <div className="bg-ft-card border border-ft-border rounded-xl p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">{MEAL_ICONS[meal]}</span>
          <span className="font-semibold text-white capitalize">{meal}</span>
          {totalCal > 0 && (
            <span className="text-xs text-zinc-500 ml-1">{totalCal} cal</span>
          )}
          {hasMacros && (
            <span className="text-xs text-zinc-600">
              · P {Math.round(totalProtein)}g C {Math.round(totalCarbs)}g F {Math.round(totalFat)}g
              {totalSugarTotal > 0 && ` S ${Math.round(totalSugarTotal)}g`}
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-green-500 text-sm hover:text-green-400 transition-colors shrink-0"
        >
          + Add
        </button>
      </div>

      {entries.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {entries.map((e) => {
            const entryHasMacros = (e.protein || 0) > 0 || (e.carbs || 0) > 0 || (e.fat || 0) > 0
            return (
              <div key={e.id} className="flex items-start justify-between text-sm gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-300 truncate block">{e.description || 'Food item'}</span>
                  {entryHasMacros && (
                    <span className="text-xs text-zinc-600">
                      P {Math.round(e.protein || 0)}g · C {Math.round(e.carbs || 0)}g · F {Math.round(e.fat || 0)}g
                      {(e.sugar_total || 0) > 0 && ` · S ${Math.round(e.sugar_total)}g`}
                      {(e.sugar_added || 0) > 0 && <span className="text-amber-700"> ({Math.round(e.sugar_added)}g added)</span>}
                    </span>
                  )}
                </div>
                <span className="text-zinc-400 shrink-0">{e.calories} cal</span>
                <button
                  onClick={() => onDelete(e.id)}
                  className="text-zinc-700 hover:text-red-400 text-base leading-none shrink-0"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {adding && (
        <div className="border-t border-ft-border pt-3 space-y-2">

          {/* Search input + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <input
                type="text"
                placeholder="Search food (e.g. oatmeal, chicken breast…)"
                value={desc}
                onChange={(e) => handleDescChange(e.target.value)}
                onFocus={() => results.length > 0 && setShowDropdown(true)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-green-500 pr-8"
                autoFocus
              />
              {searching && (
                <span className="absolute right-3 top-2.5 text-xs text-zinc-500">…</span>
              )}
            </div>
            {showDropdown && results.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-ft-surface border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                {results.map((food, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={() => selectResult(food)}
                    className="w-full text-left px-3 py-2.5 hover:bg-ft-muted transition-colors border-b border-zinc-700/50 last:border-0"
                  >
                    <p className="text-white text-xs font-medium truncate">{food.name}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {food.calories} cal · P {food.protein}g · C {food.carbs}g · F {food.fat}g
                      {food.sugar_total > 0 && ` · S ${food.sugar_total}g`}
                      <span className="text-zinc-600"> per 100g</span>
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Serving size row */}
          <div className="flex gap-2 items-end">
            <div className="w-20">
              <label className="text-xs text-zinc-600 mb-0.5 block">Qty</label>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min="0.1"
                step="0.25"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-zinc-600 mb-0.5 block">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            {estimatedGrams != null && unit !== 'g' && (
              <div className="shrink-0 pb-2">
                <span className="text-xs text-green-500 font-medium">≈ {estimatedGrams}g</span>
              </div>
            )}
          </div>

          {/* Piece gram weight — shown when unit is piece */}
          {unit === 'piece' && (
            <div>
              <label className="text-xs text-zinc-600 mb-1 block">Grams per piece</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={pieceGrams}
                  onChange={(e) => {
                    const g = parseFloat(e.target.value) || 1
                    setPieceGrams(g)
                    // Re-scale all nutrients to new gram weight
                    if (results.length === 0 && cal) {
                      const factor = g / (pieceGrams || 1)
                      setCal(String(Math.round(parseFloat(cal) * factor) || ''))
                      setProtein(String(Math.round(parseFloat(protein || 0) * factor * 10) / 10))
                      setCarbs(String(Math.round(parseFloat(carbs || 0) * factor * 10) / 10))
                      setFat(String(Math.round(parseFloat(fat || 0) * factor * 10) / 10))
                      setSugarTotal(String(Math.round(parseFloat(sugarTotal || 0) * factor * 10) / 10))
                      setSugarAdded(String(Math.round(parseFloat(sugarAdded || 0) * factor * 10) / 10))
                    }
                  }}
                  className="w-24 bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  min="1"
                  step="1"
                />
                <span className="text-xs text-zinc-500">g</span>
                {foodServings.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {foodServings.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => {
                          setPieceGrams(s.grams)
                          setQty('1')
                        }}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                          pieceGrams === s.grams
                            ? 'border-green-500 bg-green-500/10 text-green-400'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                        }`}
                      >
                        {s.label} ({s.grams}g)
                      </button>
                    ))}
                  </div>
                )}
                {foodServings.length === 1 && (
                  <span className="text-xs text-green-500">{foodServings[0].label}</span>
                )}
              </div>
            </div>
          )}

          {/* Density picker — only shown for volume units */}
          {needsDensity && (
            <div>
              <label className="text-xs text-zinc-600 mb-1 block">Food type (for volume → weight)</label>
              <div className="grid grid-cols-2 gap-1.5">
                {DENSITY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDensity(d.value)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      density === d.value
                        ? 'border-green-500 bg-green-500/10 text-green-400'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <span className="font-medium block">{d.label}</span>
                    <span className="text-zinc-600">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Calories */}
          <input
            type="number"
            placeholder="Calories"
            value={cal}
            onChange={(e) => setCal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
            min="1"
          />

          {/* Macros */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Protein (g)</label>
              <input
                type="number"
                placeholder="0"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Carbs (g)</label>
              <input
                type="number"
                placeholder="0"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Fat (g)</label>
              <input
                type="number"
                placeholder="0"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min="0"
                step="0.1"
              />
            </div>
          </div>

          {/* Sugar */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Total Sugar (g)</label>
              <input
                type="number"
                placeholder="0"
                value={sugarTotal}
                onChange={(e) => setSugarTotal(e.target.value)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Added Sugar (g)</label>
              <input
                type="number"
                placeholder="0"
                value={sugarAdded}
                onChange={(e) => setSugarAdded(e.target.value)}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                min="0"
                step="0.1"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={submit}
              className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black text-sm font-semibold rounded-lg transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { reset(); setAdding(false) }}
              className="px-3 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileModal({ profile, onSave, onClose }) {
  // UI state stored in US units; backend columns stay in metric
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

  // Convert UI form → metric for preview calculations and saving
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

export default function FoodLog() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [logs, setLogs] = useState([])
  const [profile, setProfile] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [logsRes, profileRes] = await Promise.all([getFoodLogs(date), getProfile()])
      setLogs(logsRes.data)
      setProfile(profileRes.data)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const handleAdd = async (data) => {
    await createFoodLog(data)
    load()
  }

  const handleDelete = async (id) => {
    await deleteFoodLog(id)
    load()
  }

  const handleSaveProfile = async (data) => {
    const res = await updateProfile(data)
    setProfile(res.data)
    setShowProfile(false)
  }

  const totalCalories = logs.reduce((s, l) => s + l.calories, 0)
  const totalProtein = logs.reduce((s, l) => s + (l.protein || 0), 0)
  const totalCarbs = logs.reduce((s, l) => s + (l.carbs || 0), 0)
  const totalFat = logs.reduce((s, l) => s + (l.fat || 0), 0)
  const totalSugarTotal = logs.reduce((s, l) => s + (l.sugar_total || 0), 0)
  const totalSugarAdded = logs.reduce((s, l) => s + (l.sugar_added || 0), 0)

  const targetCalories = profile ? computeTargetCalories(profile) : null
  const macroGoals = profile && targetCalories ? computeMacroGoals(profile, targetCalories) : null
  const sugarGoal = computeSugarGoal(profile)

  const calPct = targetCalories ? Math.min(Math.round((totalCalories / targetCalories) * 100), 100) : 0
  const calOver = targetCalories && totalCalories > targetCalories

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-white">Food Log</h2>
        <button
          onClick={() => setShowProfile(true)}
          className="text-xs text-zinc-400 hover:text-green-400 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          ⚙ Profile
        </button>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setDate(format(subDays(new Date(date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
          className="text-zinc-400 hover:text-white px-2 py-1 text-lg transition-colors"
        >
          ‹
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 bg-ft-surface border border-ft-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"
        />
        <button
          onClick={() => setDate(format(addDays(new Date(date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
          className="text-zinc-400 hover:text-white px-2 py-1 text-lg transition-colors"
        >
          ›
        </button>
      </div>

      {/* Daily summary */}
      <div className="bg-ft-card border border-ft-border rounded-xl p-4 mb-5">
        {/* Calories row */}
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Calories today</p>
            <p className={`text-3xl font-bold ${calOver ? 'text-red-400' : 'text-white'}`}>
              {totalCalories.toLocaleString()}
            </p>
          </div>
          {targetCalories && (
            <div className="text-right">
              <p className="text-xs text-zinc-500 mb-0.5">Goal</p>
              <p className="text-xl font-semibold text-zinc-400">{targetCalories.toLocaleString()}</p>
            </div>
          )}
        </div>
        {targetCalories ? (
          <>
            <div className="w-full bg-ft-surface rounded-full h-2 mb-1">
              <div
                className={`h-2 rounded-full transition-all ${calOver ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${calPct}%` }}
              />
            </div>
            <p className="text-xs text-zinc-600 mb-4">
              {calOver
                ? `${(totalCalories - targetCalories).toLocaleString()} cal over goal`
                : `${(targetCalories - totalCalories).toLocaleString()} cal remaining`}
            </p>
          </>
        ) : (
          <p className="text-xs text-zinc-600 mb-4">
            <button onClick={() => setShowProfile(true)} className="text-green-500 hover:underline">Set up your profile</button> to see calorie and macro targets
          </p>
        )}

        {/* Macro bars */}
        <div className="flex gap-4 pt-3 border-t border-ft-border">
          <MacroBar
            label="Protein"
            current={totalProtein}
            goal={macroGoals?.protein_g}
            color="bg-blue-500"
          />
          <MacroBar
            label="Carbs"
            current={totalCarbs}
            goal={macroGoals?.carb_g}
            color="bg-yellow-500"
          />
          <MacroBar
            label="Fat"
            current={totalFat}
            goal={macroGoals?.fat_g}
            color="bg-orange-500"
          />
        </div>

        {/* Sugar row — always visible, natural vs added split */}
        <div className="pt-3 mt-1 border-t border-ft-border flex gap-4">
          {/* Total sugar — informational */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-zinc-500">Total Sugar</span>
              <span className="text-xs font-semibold text-zinc-300">{Math.round(totalSugarTotal)}g</span>
            </div>
            <div className="w-full bg-ft-surface rounded-full h-1.5 mb-1">
              <div className="h-1.5 rounded-full bg-zinc-600 transition-all" style={{ width: `${totalSugarTotal > 0 ? Math.min(100, Math.round((totalSugarTotal / Math.max(totalSugarTotal, 60)) * 100)) : 0}%` }} />
            </div>
            <p className="text-xs text-zinc-600">
              {totalSugarTotal > 0
                ? `${Math.round(Math.max(0, totalSugarTotal - totalSugarAdded))}g natural · ${Math.round(totalSugarAdded)}g added`
                : 'no data yet'}
            </p>
          </div>
          {/* Added sugar — AHA goal bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-zinc-500">Added Sugar</span>
              <span className={`text-xs font-semibold ${sugarGoal && totalSugarAdded > sugarGoal ? 'text-red-400' : 'text-amber-400'}`}>
                {Math.round(totalSugarAdded)}g{sugarGoal ? ` / ${sugarGoal}g` : ''}
              </span>
            </div>
            <div className="w-full bg-ft-surface rounded-full h-1.5 mb-1">
              <div
                className={`h-1.5 rounded-full transition-all ${sugarGoal && totalSugarAdded > sugarGoal ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${sugarGoal ? Math.min(100, Math.round((totalSugarAdded / sugarGoal) * 100)) : 0}%` }}
              />
            </div>
            <p className="text-xs text-zinc-600">
              {sugarGoal
                ? totalSugarAdded > sugarGoal
                  ? `${Math.round(totalSugarAdded - sugarGoal)}g over AHA limit`
                  : `${Math.round(sugarGoal - totalSugarAdded)}g left (AHA ${sugarGoal}g/day)`
                : 'set profile for goal'}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-zinc-600 py-10">Loading…</p>
      ) : (
        MEALS.map((meal) => (
          <MealSection
            key={meal}
            meal={meal}
            entries={logs.filter((l) => l.meal_type === meal)}
            date={date}
            onAdd={handleAdd}
            onDelete={handleDelete}
          />
        ))
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
