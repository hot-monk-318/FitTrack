import { useEffect, useState } from 'react'
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { getVolume, getFoodTrend } from '../api'
import { format, parseISO } from 'date-fns'

const PERIODS = [
  { label: '4w',  days: 28 },
  { label: '8w',  days: 56 },
  { label: '3mo', days: 90 },
  { label: '6mo', days: 180 },
]

const tooltipStyle = {
  backgroundColor: '#16132a',
  border: '1px solid #2a2347',
  borderRadius: '8px',
  color: '#f4f4f5',
}

function aggregateByWeek(sessions, valueKey) {
  const weekMap = {}
  sessions.forEach((d) => {
    const dt = parseISO(d.date)
    const daysToMonday = (dt.getDay() + 6) % 7
    const monday = new Date(dt.getTime())
    monday.setDate(monday.getDate() - daysToMonday)
    const key = format(monday, 'MM/dd')
    weekMap[key] = (weekMap[key] || 0) + (d[valueKey] || 0)
  })
  return Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, value]) => ({ week, value: Math.round(value) }))
}

export default function Analytics() {
  const [period, setPeriod] = useState(56)
  const [weeklyVolume, setWeeklyVolume] = useState([])
  const [weeklyCalories, setWeeklyCalories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getVolume({ days: period }),
      getFoodTrend({ days: period }),
    ])
      .then(([vol, food]) => {
        setWeeklyVolume(aggregateByWeek(vol.data, 'volume'))
        setWeeklyCalories(aggregateByWeek(food.data, 'calories'))
      })
      .finally(() => setLoading(false))
  }, [period])

  const empty = (msg) => (
    <p className="text-zinc-600 text-sm text-center py-10">{msg}</p>
  )

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Charts</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === p.days
                  ? 'bg-violet-500 text-white shadow-sm shadow-violet-500/30'
                  : 'bg-ft-surface text-zinc-400 hover:bg-ft-muted hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly workout volume */}
      <div className="bg-ft-card border border-ft-border border-t-2 border-t-green-500/50 rounded-xl p-4 mb-4">
        <h3 className="font-bold text-white mb-1 flex items-center gap-2">
          <span>💪</span> Weekly Workout Volume{' '}
          <span className="text-xs text-zinc-500 font-normal">lbs lifted per week</span>
        </h3>
        {loading || weeklyVolume.length === 0 ? (
          empty(loading ? 'Loading…' : 'No workout data for this period')
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyVolume} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="week" tick={{ fill: '#71717a', fontSize: 10 }} />
              <YAxis
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#22c55e' }}
                formatter={(v) => [`${v.toLocaleString()} lbs`, 'Volume']}
              />
              <Bar dataKey="value" name="Volume" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Weekly food calorie intake */}
      <div className="bg-ft-card border border-ft-border border-t-2 border-t-orange-500/50 rounded-xl p-4">
        <h3 className="font-bold text-white mb-1 flex items-center gap-2">
          <span>🥗</span> Weekly Calorie Intake{' '}
          <span className="text-xs text-zinc-500 font-normal">calories logged per week</span>
        </h3>
        {loading || weeklyCalories.length === 0 ? (
          empty(loading ? 'Loading…' : 'No food data for this period')
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyCalories} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="week" tick={{ fill: '#71717a', fontSize: 10 }} />
              <YAxis
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#f97316' }}
                formatter={(v) => [`${v.toLocaleString()} cal`, 'Calories']}
              />
              <Bar dataKey="value" name="Calories" fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
