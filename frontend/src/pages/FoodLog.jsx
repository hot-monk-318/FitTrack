import { useState, useEffect, useCallback, useRef } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { getFoodLogs, createFoodLog, deleteFoodLog, getProfile, searchFood } from '../api'
import { scaleNutrients } from '../utils/servingConversions'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' }
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

const PORTION_PRESETS = [
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '3/4', value: 0.75 },
  { label: '1', value: 1 },
  { label: '1 1/2', value: 1.5 },
  { label: '2', value: 2 },
]
const RECENT_STORAGE_KEY = 'fittrack_food_recent_templates'
const FAVORITES_STORAGE_KEY = 'fittrack_food_favorites'

function templateKey(name, servingLabel) {
  return `${String(name || '').toLowerCase()}::${String(servingLabel || '').toLowerCase()}`
}

function pickDefaultServing(servings, foodName = '') {
  if (!Array.isArray(servings) || servings.length === 0) return null

  const normalizedName = String(foodName).toLowerCase()
  const ranked = servings
    .filter((s) => s && s.label && Number(s.grams) > 0)
    .map((s) => {
      const label = String(s.label).toLowerCase()
      const grams = Number(s.grams)
      let score = 0

      if (/\b(1|one)\b/.test(label)) score += 35
      if (/\b(piece|egg|slice|link|patty|fillet|fruit|item|whole)\b/.test(label)) score += 45
      if (/\b(large|medium|small)\b/.test(label)) score += 20
      if (/\b(cup|tbsp|tsp|oz|gram|g)\b/.test(label)) score -= 10
      if (grams >= 15 && grams <= 80) score += 18
      if (grams > 120) score -= 12

      if (normalizedName.includes('egg')) {
        if (/\b(large|medium|small|egg|piece)\b/.test(label)) score += 40
        score -= Math.abs(grams - 33) * 0.7
      }

      return { ...s, score }
    })

  if (ranked.length === 0) return null
  ranked.sort((a, b) => b.score - a.score)
  return ranked[0]
}

function getSmartServingGroups(servings, foodName = '') {
  if (!Array.isArray(servings) || servings.length === 0) {
    return {
      primary: [{ label: '100 g', grams: 100 }],
      all: [{ label: '100 g', grams: 100 }],
    }
  }

  const preferred = pickDefaultServing(servings, foodName)
  const ranked = servings
    .filter((s) => s?.label && Number(s?.grams) > 0)
    .map((s) => {
      const label = s.label.toLowerCase()
      let score = 0
      if (/\b(piece|egg|slice|cup|tbsp|tsp|large|medium|small)\b/.test(label)) score += 30
      if (/\b(1|one)\b/.test(label)) score += 20
      if (Number(s.grams) >= 10 && Number(s.grams) <= 180) score += 15
      if (Number(s.grams) > 250) score -= 12
      return { ...s, score }
    })
    .sort((a, b) => b.score - a.score)

  const deduped = []
  const seen = new Set()
  for (const s of ranked) {
    const k = `${s.label.toLowerCase()}::${s.grams}`
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(s)
  }

  const primary = []
  if (preferred) primary.push(preferred)
  for (const s of deduped) {
    if (primary.length >= 6) break
    if (!primary.some((p) => p.label === s.label && p.grams === s.grams)) primary.push(s)
  }

  return { primary, all: deduped }
}

function parsePortionQuantity(value) {
  if (value == null) return NaN
  const raw = String(value).trim()
  if (!raw) return NaN

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return parseFloat(raw)
  }

  const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = parseInt(mixed[1], 10)
    const num = parseInt(mixed[2], 10)
    const den = parseInt(mixed[3], 10)
    if (den === 0) return NaN
    return whole + (num / den)
  }

  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fraction) {
    const num = parseInt(fraction[1], 10)
    const den = parseInt(fraction[2], 10)
    if (den === 0) return NaN
    return num / den
  }

  return NaN
}

function MealSection({
  meal,
  entries,
  date,
  onAdd,
  onDelete,
  quickTemplates = [],
  favoriteKeys = [],
  onToggleFavorite,
  yesterdayCount = 0,
  onRepeatYesterday,
}) {
  const [desc, setDesc] = useState('')
  const [portionQty, setPortionQty] = useState('1')
  const [selectedFood, setSelectedFood] = useState(null)
  const [foodServings, setFoodServings] = useState([{ label: '100 g', grams: 100 }])
  const [selectedServingLabel, setSelectedServingLabel] = useState('100 g')
  const [showAllServings, setShowAllServings] = useState(false)
  const [adding, setAdding] = useState(false)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)
  const searchReqIdRef = useRef(0)
  const dropdownRef = useRef(null)

  const totalCal = entries.reduce((s, e) => s + e.calories, 0)
  const totalProtein = entries.reduce((s, e) => s + (e.protein || 0), 0)
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs || 0), 0)
  const totalFat = entries.reduce((s, e) => s + (e.fat || 0), 0)
  const totalSugarTotal = entries.reduce((s, e) => s + (e.sugar_total || 0), 0)
  const hasMacros = totalProtein > 0 || totalCarbs > 0 || totalFat > 0

  const parsedQty = parsePortionQuantity(portionQty)
  const selectedServing = foodServings.find((s) => s.label === selectedServingLabel) || foodServings[0]
  const servingGrams = selectedServing?.grams || 100
  const totalGrams = Math.round((parsedQty || 0) * servingGrams)
  const computed = selectedFood ? scaleNutrients(selectedFood, totalGrams) : null
  const { primary: primaryServings, all: allServings } = getSmartServingGroups(foodServings, selectedFood?.name || '')
  const visibleServings = showAllServings ? allServings : primaryServings
  const isFavorite = selectedFood ? favoriteKeys.includes(templateKey(selectedFood.name, selectedServingLabel)) : false

  const runFoodSearch = async (term) => {
    const query = term.trim()
    if (query.length < 2) {
      setResults([])
      setShowDropdown(false)
      setSearchMessage('Type at least 2 letters to search USDA foods.')
      setSearching(false)
      return
    }

    const requestId = ++searchReqIdRef.current
    setSearching(true)
    setShowDropdown(true)
    setSearchMessage(`Searching USDA for "${query}"... this can take a few seconds.`)

    try {
      const res = await searchFood(query)
      if (requestId !== searchReqIdRef.current) return
      const items = res.data || []
      setResults(items)
      if (items.length === 0) {
        setSearchMessage(`No results found for "${query}". Try a broader term.`)
      } else {
        setSearchMessage(`Found ${items.length} result${items.length === 1 ? '' : 's'}.`)
      }
    } catch (err) {
      if (requestId !== searchReqIdRef.current) return
      setResults([])
      const status = err?.response?.status
      const apiMessage = err?.response?.data?.error
      if (status === 429) {
        setSearchMessage('USDA rate limit reached. Please wait a moment and try again.')
      } else if (status === 401 || status === 403) {
        setSearchMessage('USDA API key issue. Please check backend USDA_API_KEY configuration.')
      } else if (status === 502) {
        setSearchMessage(apiMessage || 'USDA service is temporarily unavailable. Please try again.')
      } else {
        setSearchMessage(apiMessage || 'Search request failed. Please try again.')
      }
    } finally {
      if (requestId === searchReqIdRef.current) setSearching(false)
    }
  }

  const handleDescChange = (val) => {
    setDesc(val)
    setShowDropdown(val.trim().length >= 2)
    clearTimeout(debounceRef.current)
    if (val.trim().length < 2) {
      setResults([])
      setSearchMessage('Type at least 2 letters to search USDA foods.')
      return
    }
    debounceRef.current = setTimeout(() => {
      runFoodSearch(val)
    }, 350)
  }

  const selectResult = (food) => {
    setDesc(food.name)
    setShowDropdown(false)
    setResults([])
    setSelectedFood(food)
    setPortionQty('1')
    setShowAllServings(false)
    const servings = food.servings || []
    if (servings.length > 0) {
      const preferred = pickDefaultServing(servings, food.name) || servings[0]
      setFoodServings(servings)
      setSelectedServingLabel(preferred.label)
      return
    }

    setFoodServings([{ label: '100 g', grams: 100 }])
    setSelectedServingLabel('100 g')
  }

  const applyTemplate = (tpl) => {
    if (!tpl?.food) return
    setSelectedFood(tpl.food)
    setDesc(tpl.name || tpl.food.name || '')
    const servings = (tpl.servings && tpl.servings.length > 0) ? tpl.servings : [{ label: '100 g', grams: 100 }]
    setFoodServings(servings)
    setSelectedServingLabel(tpl.servingLabel || servings[0].label)
    setPortionQty(String(tpl.defaultQty || 1))
    setShowAllServings(false)
    setAdding(true)
  }

  const reset = () => {
    setDesc(''); setPortionQty('1')
    setSelectedFood(null)
    setFoodServings([{ label: '100 g', grams: 100 }])
    setSelectedServingLabel('100 g')
    setShowAllServings(false)
    setResults([]); setShowDropdown(false)
  }

  const submit = async () => {
    if (!selectedFood || !computed) return
    const qtyNum = parsePortionQuantity(portionQty)
    if (!qtyNum || qtyNum <= 0) return
    const label = qtyNum === 1
      ? `${selectedServing.label} (~${totalGrams}g)`
      : `${qtyNum} × ${selectedServing.label} (~${totalGrams}g)`
    const fullDesc = `${selectedFood.name} — ${label}`
    await onAdd({
      date,
      meal_type: meal,
      description: fullDesc,
      calories: computed.calories || 0,
      protein: computed.protein || 0,
      carbs: computed.carbs || 0,
      fat: computed.fat || 0,
      sugar_total: computed.sugar_total || 0,
      sugar_added: computed.sugar_added || 0,
    }, {
      name: selectedFood.name,
      food: selectedFood,
      servings: allServings,
      servingLabel: selectedServing.label,
      defaultQty: qtyNum,
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
        <button
          onClick={onRepeatYesterday}
          disabled={!yesterdayCount}
          className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors ml-2"
        >
          Repeat yesterday
        </button>
      </div>

      {quickTemplates.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] text-zinc-600 mb-1">Quick picks</p>
          <div className="flex flex-wrap gap-1.5">
            {quickTemplates.slice(0, 6).map((tpl) => (
              <button
                key={templateKey(tpl.name, tpl.servingLabel)}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="text-xs px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
      )}

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

          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <input
                type="text"
                placeholder="Search food and select an item"
                value={desc}
                onChange={(e) => handleDescChange(e.target.value)}
                onFocus={() => results.length > 0 && setShowDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    clearTimeout(debounceRef.current)
                    runFoodSearch(desc)
                  }
                }}
                className="w-full bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-green-500 pr-8"
                autoFocus
              />
              {searching && (
                <span className="absolute right-3 top-2.5 text-xs text-zinc-500">…</span>
              )}
            </div>
            {showDropdown && (searching || results.length > 0 || searchMessage) && (
              <div className="absolute z-20 w-full mt-1 bg-ft-surface border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                {searching && (
                  <div className="px-3 py-2.5 border-b border-zinc-700/50">
                    <p className="text-xs text-green-400 animate-pulse">Searching USDA...</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Results can take a few seconds, no need to retype.</p>
                  </div>
                )}
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
                {!searching && results.length === 0 && searchMessage && (
                  <div className="px-3 py-2.5">
                    <p className="text-xs text-zinc-400">{searchMessage}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedFood ? (
            <>
              <div className="bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2">
                <p className="text-xs text-zinc-500">Selected</p>
                <p className="text-sm text-white font-medium truncate">{selectedFood.name}</p>
              </div>

              <div>
                <label className="text-xs text-zinc-600 mb-1 block">Serving Size</label>
                <div className="flex flex-wrap gap-1.5">
                  {visibleServings.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setSelectedServingLabel(s.label)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        selectedServingLabel === s.label
                          ? 'border-green-500 bg-green-500/10 text-green-400'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                  {allServings.length > primaryServings.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllServings((v) => !v)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
                    >
                      {showAllServings ? 'Less' : 'More'}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-600 mb-1 block">Portion</label>
                <div className="flex flex-wrap gap-1.5">
                  {PORTION_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setPortionQty(p.label)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        portionQty === p.label
                          ? 'border-green-500 bg-green-500/10 text-green-400'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2">
                <span className="text-xs text-zinc-500">Quantity</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(0.25, ((parsedQty || 1) - 0.25))
                      setPortionQty(String(Math.round(next * 100) / 100))
                    }}
                    className="w-7 h-7 rounded-md border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    value={portionQty}
                    onChange={(e) => setPortionQty(e.target.value)}
                    className="w-16 bg-ft-card border border-zinc-700 rounded-md px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-green-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = (parsedQty || 1) + 0.25
                      setPortionQty(String(Math.round(next * 100) / 100))
                    }}
                    className="w-7 h-7 rounded-md border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500"
                  >
                    +
                  </button>
                </div>
              </div>

              {computed && (
                <div className="bg-ft-surface rounded-lg px-3 py-2 border border-zinc-700/70">
                  <p className="text-xs text-zinc-500 mb-1">
                    Approx. {totalGrams}g ({portionQty} × {selectedServing.label})
                  </p>
                  <p className="text-sm text-white font-semibold">
                    {computed.calories} cal · P {computed.protein}g · C {computed.carbs}g · F {computed.fat}g
                  </p>
                  {computed.sugar_total > 0 && (
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Sugar {computed.sugar_total}g{computed.sugar_added > 0 ? ` (${computed.sugar_added}g added)` : ''}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onToggleFavorite?.({
                    name: selectedFood.name,
                    food: selectedFood,
                    servings: allServings,
                    servingLabel: selectedServing.label,
                    defaultQty: 1,
                  })}
                  className={`text-xs transition-colors ${isFavorite ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {isFavorite ? '★ Favorited' : '☆ Add to favorites'}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={!computed || !parsedQty || parsedQty <= 0}
                  className="px-4 py-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-lg transition-colors"
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
            </>
          ) : (
            <p className="text-xs text-zinc-600">
              Search and select a food to auto-calculate calories and macros from portion size.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function FoodLog() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [logs, setLogs] = useState([])
  const [yesterdayLogs, setYesterdayLogs] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recentTemplates, setRecentTemplates] = useState([])
  const [favorites, setFavorites] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [logsRes, profileRes] = await Promise.all([getFoodLogs(date), getProfile()])
      const yesterday = format(subDays(new Date(date + 'T12:00:00'), 1), 'yyyy-MM-dd')
      const yesterdayRes = await getFoodLogs(yesterday)
      setLogs(logsRes.data)
      setYesterdayLogs(yesterdayRes.data || [])
      setProfile(profileRes.data)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    try {
      const recentsRaw = localStorage.getItem(RECENT_STORAGE_KEY)
      const favoritesRaw = localStorage.getItem(FAVORITES_STORAGE_KEY)
      setRecentTemplates(recentsRaw ? JSON.parse(recentsRaw) : [])
      setFavorites(favoritesRaw ? JSON.parse(favoritesRaw) : [])
    } catch {
      setRecentTemplates([])
      setFavorites([])
    }
  }, [])

  const handleAdd = async (data, template = null) => {
    await createFoodLog(data)
    if (template?.name && template?.food) {
      const key = templateKey(template.name, template.servingLabel)
      const next = [template, ...recentTemplates.filter((t) => templateKey(t.name, t.servingLabel) !== key)].slice(0, 12)
      setRecentTemplates(next)
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
    }
    load()
  }

  const handleDelete = async (id) => {
    await deleteFoodLog(id)
    load()
  }

  const toggleFavoriteTemplate = (template) => {
    if (!template?.name || !template?.food) return
    const key = templateKey(template.name, template.servingLabel)
    const exists = favorites.some((t) => templateKey(t.name, t.servingLabel) === key)
    const next = exists
      ? favorites.filter((t) => templateKey(t.name, t.servingLabel) !== key)
      : [template, ...favorites].slice(0, 24)
    setFavorites(next)
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next))
  }

  const repeatYesterdayMeal = async (meal) => {
    const source = yesterdayLogs.filter((l) => l.meal_type === meal)
    if (source.length === 0) return
    await Promise.all(source.map((item) => createFoodLog({
      date,
      meal_type: meal,
      description: item.description,
      calories: item.calories,
      protein: item.protein || 0,
      carbs: item.carbs || 0,
      fat: item.fat || 0,
      sugar_total: item.sugar_total || 0,
      sugar_added: item.sugar_added || 0,
    })))
    load()
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
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">Food Log</h2>
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
            Set up your profile from Home to see calorie and macro targets
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
            quickTemplates={[
              ...favorites.filter((f) => f?.food),
              ...recentTemplates.filter((r) => r?.food && !favorites.some((f) => templateKey(f.name, f.servingLabel) === templateKey(r.name, r.servingLabel))),
            ]}
            favoriteKeys={favorites.map((f) => templateKey(f.name, f.servingLabel))}
            onToggleFavorite={toggleFavoriteTemplate}
            yesterdayCount={yesterdayLogs.filter((l) => l.meal_type === meal).length}
            onRepeatYesterday={() => repeatYesterdayMeal(meal)}
          />
        ))
      )}
    </div>
  )
}
