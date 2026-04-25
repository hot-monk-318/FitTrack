import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Home',    emoji: '🏠' },
  { to: '/log',      label: 'Workout', emoji: '💪' },
  { to: '/food',     label: 'Food',    emoji: '🥗' },
  { to: '/analytics', label: 'Charts', emoji: '📊' },
]

export default function Navbar() {
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
      </nav>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden flex items-center px-4 py-3 bg-ft-card/95 border-b border-ft-border sticky top-0 z-40 backdrop-blur-sm">
        <h1 className="text-lg font-black bg-gradient-to-r from-green-400 to-violet-400 bg-clip-text text-transparent">
          FitTrack
        </h1>
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
