import type { Stats } from '../types'

interface StatsBarProps { stats: Stats | null }

function StatCard({
  label, value, sub, pct, color,
}: { label: string; value: number | string; sub: string; pct: number; color: string }) {
  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 shadow-sm p-5 backdrop-blur-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">{sub}</p>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function StatsBar({ stats }: StatsBarProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-800/60 rounded-xl border border-gray-700/50 h-28 animate-pulse" />
        ))}
      </div>
    )
  }

  const { total, done_1, done_2, done_3 } = stats
  const allPct = total > 0 ? Math.round((done_3 / total) * 100) : 0

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard label="Total Campaigns"  value={done_1}       sub="API 1 — Campaign Values"       pct={total > 0 ? 100 : 0}                    color="bg-green-500" />
      <StatCard label="Messages Fetched" value={done_2}       sub={`of ${done_1} campaigns`}      pct={done_1 > 0 ? (done_2 / done_1) * 100 : 0} color="bg-sky-500"   />
      <StatCard label="Templates Saved"  value={done_3}       sub={`of ${done_2} with messages`}  pct={done_2 > 0 ? (done_3 / done_2) * 100 : 0} color="bg-emerald-500" />
      <StatCard label="Overall Complete" value={`${allPct}%`} sub="All 3 APIs done"               pct={allPct}                                  color="bg-amber-400" />
    </div>
  )
}
