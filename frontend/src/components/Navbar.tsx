type Page = 'dashboard' | 'ai'

interface NavbarProps {
  lastUpdated: string
  onRefresh: () => void
  onPullData: () => void
  onLogout: () => void
  page: Page
  onNavigate: (page: Page) => void
}

export default function Navbar({ lastUpdated, onRefresh, onPullData, onLogout, page, onNavigate }: NavbarProps) {
  return (
    <nav className="bg-gray-900 text-white shadow-lg border-b border-gray-700/50 sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center font-bold text-sm shadow-lg shadow-green-900/40">K</div>
            <span className="font-semibold text-lg tracking-tight text-white hidden sm:block">Klaviyo Dashboard</span>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                page === 'dashboard'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => onNavigate('ai')}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                page === 'ai'
                  ? 'bg-green-900/60 text-green-400 border border-green-700/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className="text-xs">✦</span>
              AI Insights
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {page === 'dashboard' && (
            <>
              {lastUpdated && (
                <span className="text-gray-400 text-xs hidden sm:block">{lastUpdated}</span>
              )}
              <button
                onClick={onPullData}
                className="flex items-center gap-1.5 text-xs bg-green-800/60 hover:bg-green-700/70 border border-green-700/50 text-green-300 hover:text-green-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Pull Latest Data
              </button>
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
            </>
          )}
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
