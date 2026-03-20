interface NavbarProps {
  lastUpdated: string
  onRefresh: () => void
}

export default function Navbar({ lastUpdated, onRefresh }: NavbarProps) {
  return (
    <nav className="bg-brand-900 text-white shadow-md sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center font-bold text-sm">K</div>
          <span className="font-semibold text-lg tracking-tight">Klaviyo Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-blue-200 text-xs hidden sm:block">{lastUpdated}</span>
          )}
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs bg-brand-800 hover:bg-brand-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </nav>
  )
}
