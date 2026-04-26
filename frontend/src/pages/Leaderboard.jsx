import { useEffect, useState } from 'react'
import {
  acceptLeaderboardConnection,
  deleteLeaderboardConnection,
  getLeaderboardConnections,
  getLeaderboardRankings,
  requestLeaderboardConnection,
  searchLeaderboardUsers,
} from '../api'

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
]

export default function Leaderboard() {
  const [days, setDays] = useState(7)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [connections, setConnections] = useState({ pending_sent: [], pending_received: [], accepted: [] })
  const [rankings, setRankings] = useState([])
  const [loading, setLoading] = useState(true)

  const loadAll = async (activeDays = days) => {
    setLoading(true)
    try {
      const [connRes, rankingRes] = await Promise.all([
        getLeaderboardConnections(),
        getLeaderboardRankings(activeDays),
      ])
      setConnections(connRes.data)
      setRankings(rankingRes.data.rankings || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll(days)
  }, [days])

  const runSearch = async () => {
    if (query.trim().length < 2) {
      setSearchResults([])
      setHasSearched(false)
      return
    }
    setLoadingSearch(true)
    setHasSearched(true)
    try {
      const res = await searchLeaderboardUsers(query.trim())
      setSearchResults(res.data || [])
    } finally {
      setLoadingSearch(false)
    }
  }

  const sendRequest = async (userId) => {
    try {
      await requestLeaderboardConnection(userId)
      await loadAll(days)
      setSearchResults((prev) => prev.filter((u) => u.id !== userId))
    } catch (e) {
      alert(e?.response?.data?.error || 'Unable to send request')
    }
  }

  const acceptRequest = async (connectionId) => {
    await acceptLeaderboardConnection(connectionId)
    await loadAll(days)
  }

  const removeConnection = async (connectionId) => {
    await deleteLeaderboardConnection(connectionId)
    await loadAll(days)
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Leaderboard</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                days === p.days ? 'bg-violet-500 text-white' : 'bg-ft-surface text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-ft-card border border-ft-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-2">Find people</h3>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Search by name or email"
            className="flex-1 bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
          />
          <button onClick={runSearch} className="px-3 py-2 rounded-lg bg-green-500 text-black text-sm font-semibold">
            Search
          </button>
        </div>
        {loadingSearch && <p className="text-xs text-zinc-500 mt-2">Searching…</p>}
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-ft-surface border border-zinc-700 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm text-white">{u.first_name} {u.last_name}</p>
                  <p className="text-xs text-zinc-500">{u.email}</p>
                </div>
                <button onClick={() => sendRequest(u.id)} className="text-xs px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white">
                  Invite
                </button>
              </div>
            ))}
          </div>
        )}
        {!loadingSearch && hasSearched && searchResults.length === 0 && (
          <p className="text-xs text-zinc-500 mt-2">
            No users found. Leaderboard search only shows other signed-up users (not your own account).
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-ft-card border border-ft-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-2">Pending requests</h3>
          {connections.pending_received.length === 0 ? (
            <p className="text-xs text-zinc-600">No incoming requests</p>
          ) : connections.pending_received.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-zinc-300">{c.requester?.first_name} {c.requester?.last_name}</span>
              <button onClick={() => acceptRequest(c.id)} className="text-xs px-2 py-1 rounded bg-green-500 text-black font-semibold">Accept</button>
            </div>
          ))}
        </div>

        <div className="bg-ft-card border border-ft-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-2">Sent invites</h3>
          {connections.pending_sent.length === 0 ? (
            <p className="text-xs text-zinc-600">No sent invites</p>
          ) : connections.pending_sent.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-zinc-300">{c.addressee?.first_name} {c.addressee?.last_name}</span>
              <button onClick={() => removeConnection(c.id)} className="text-xs text-zinc-500 hover:text-red-400">Cancel</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-ft-card border border-ft-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-2">Calorie goal leaderboard ({days} days)</h3>
        <p className="text-xs text-zinc-600 mb-3">Includes you and all accepted connections.</p>
        {loading ? (
          <p className="text-sm text-zinc-600 py-4">Loading…</p>
        ) : rankings.length === 0 ? (
          <p className="text-sm text-zinc-600 py-4">No leaderboard data yet.</p>
        ) : (
          <div className="space-y-2">
            {rankings.map((r) => (
              <div key={r.user_id} className={`rounded-lg px-3 py-2 border ${r.is_current_user ? 'border-violet-500/40 bg-violet-500/10' : 'border-zinc-700 bg-ft-surface'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white font-medium">
                    #{r.rank} {r.name}{r.is_current_user ? ' (You)' : ''}
                  </p>
                  <p className="text-sm text-green-400 font-semibold">{r.achievement_pct}%</p>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {r.consumed_calories.toLocaleString()} consumed / {r.target_calories.toLocaleString()} target
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
