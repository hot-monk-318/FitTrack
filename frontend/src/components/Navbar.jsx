import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', label: 'Home',    emoji: '🏠' },
  { to: '/log',      label: 'Workout', emoji: '💪' },
  { to: '/food',     label: 'Food',    emoji: '🥗' },
  { to: '/analytics', label: 'Charts', emoji: '📊' },
  { to: '/leaderboard', label: 'Board', emoji: '🏆' },
]

function Avatar({ user, size = 'md' }) {
  const initials = [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('').toUpperCase()
  const cls = size === 'sm'
    ? 'w-7 h-7 text-xs'
    : 'w-9 h-9 text-sm'
  return (
    <div className={`${cls} rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 font-bold shrink-0`}>
      {initials || '?'}
    </div>
  )
}

export default function Navbar() {
  const { user, logout } = useAuth()

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <nav className="hidden md:flex flex-col w-56 bg-ft-card/90 border-r border-ft-border min-h-screen p-4 fixed top-0 left-0 backdrop-blur-sm">
        <div className="mb-8 px-1">
          <h1 className="text-2xl font-black bg-gradient-to-r from-green-400 via-emerald-300 to-violet-400 bg-clip-text text-transparent tracking-tight">
            FitTrack
          </h1>
          <p className="text-xs text-zinc-600 mt-1">Your fitness companion</p>
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-xl mb-1 text-sm font-medium transition-all border ${
                isActive
                  ? 'bg-violet-500/10 text-violet-400 border-violet-500/20 shadow-sm'
                  : 'text-zinc-400 hover:bg-ft-surface hover:text-zinc-100 border-transparent'
              }`
            }
          >
            <span className="text-lg">{item.emoji}</span>
            {item.label}
          </NavLink>
        ))}

        {/* Profile section at bottom */}
        <div className="mt-auto pt-4 border-t border-ft-border">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
            <Avatar user={user} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">
                {user?.first_name} {user?.last_name}
              </p>
              <button
                onClick={logout}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors leading-tight mt-0.5"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-ft-card/95 border-b border-ft-border sticky top-0 z-40 backdrop-blur-sm">
        <h1 className="text-lg font-black bg-gradient-to-r from-green-400 to-violet-400 bg-clip-text text-transparent">
          FitTrack
        </h1>
        <button
          onClick={logout}
          className="flex items-center gap-2 group"
          title={`${user?.first_name} ${user?.last_name} — tap to sign out`}
        >
          <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors hidden xs:block">
            {user?.first_name}
          </span>
          <Avatar user={user} size="sm" />
        </button>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-ft-card/95 border-t border-ft-border z-50 backdrop-blur-sm safe-area-pb">
        <div className="flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center pt-2 pb-3 text-[11px] font-semibold transition-all ${
                  isActive ? 'text-violet-400' : 'text-zinc-500 hover:text-zinc-300'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`text-xl mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`}
                  >
                    {item.emoji}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
