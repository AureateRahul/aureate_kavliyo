interface NavbarProps {
  lastUpdated: string
  onRefresh: () => void
  onLogout: () => void
}

export default function Navbar({ lastUpdated, onRefresh, onLogout }: NavbarProps) {
  return (
    <nav className="bg-gray-900 text-white shadow-lg border-b border-gray-700/50 sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center font-bold text-sm shadow-lg shadow-green-900/40">K</div>
          <span className="font-semibold text-lg tracking-tight text-white">Klaviyo Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-gray-400 text-xs hidden sm:block">{lastUpdated}</span>
          )}
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs bg-red-900/50 hover:bg-red-800/60 border border-red-800/50 text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}
