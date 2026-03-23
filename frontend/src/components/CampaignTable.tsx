import { useState, useMemo } from 'react'
import type { Campaign } from '../types'
import ThumbCell from './ThumbCell'
import { getTemplateUrl, getScreenshotUrl, downloadFromStorage } from '../lib/storage'

interface CampaignTableProps {
  campaigns: Campaign[]
  loading: boolean
  onPreview: (c: Campaign) => void
}

type SortKey = 'open_rate' | 'click_rate' | 'conversion_value' | 'click_to_open_rate' | 'label' | 'send_time'
type SortDir = 'asc' | 'desc'

function pct(val: number | null, digits = 2) {
  if (val === null || val === undefined) return '—'
  return (val * 100).toFixed(digits) + '%'
}
function usd(val: number | null) {
  if (val === null || val === undefined) return '—'
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PAGE_SIZES = [10, 25, 50, 100]

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'send_time',          label: 'Send Date'  },
  { key: 'open_rate',          label: 'Open Rate'  },
  { key: 'click_rate',         label: 'Click Rate' },
  { key: 'conversion_value',   label: 'Revenue'    },
  { key: 'click_to_open_rate', label: 'CTO Rate'   },
  { key: 'label',              label: 'Label'      },
]

const inputCls = 'text-xs border border-gray-700 rounded-lg bg-gray-900 text-gray-300 focus:outline-none focus:border-green-500 transition-colors'
const selectCls = `${inputCls} px-2.5 py-1.5`

export default function CampaignTable({ campaigns, loading, onPreview }: CampaignTableProps) {
  const [search, setSearch]           = useState('')
  const [channelFilter, setChannel]   = useState<string>('all')
  const [templateFilter, setTemplate] = useState<string>('all')
  const [monthFilter, setMonth]         = useState<string>('all')
  const [createdMonthFilter, setCreatedMonth] = useState<string>('all')
  const [sortKey, setSortKey]         = useState<SortKey>('open_rate')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState(25)

  const channels = useMemo(() => {
    const set = new Set(campaigns.map(c => c.send_channel).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [campaigns])

  // Sorted unique year-month options from send_time
  const months = useMemo(() => {
    const set = new Set<string>()
    campaigns.forEach(c => {
      if (c.send_time) {
        const d = new Date(c.send_time)
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    })
    return Array.from(set).sort().reverse()
  }, [campaigns])

  // Sorted unique year-month options from template_created
  const createdMonths = useMemo(() => {
    const set = new Set<string>()
    campaigns.forEach(c => {
      if (c.template_created) {
        const d = new Date(c.template_created)
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    })
    return Array.from(set).sort().reverse()
  }, [campaigns])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return campaigns.filter(c => {
      if (q && ![c.campaign_id, c.label, c.subject, c.send_channel].some(v => v?.toLowerCase().includes(q))) return false
      if (channelFilter !== 'all' && c.send_channel !== channelFilter) return false
      if (templateFilter === 'with'    && !c.template_filename) return false
      if (templateFilter === 'without' &&  c.template_filename) return false
      if (monthFilter !== 'all') {
        if (!c.send_time) return false
        const d = new Date(c.send_time)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (ym !== monthFilter) return false
      }
      if (createdMonthFilter !== 'all') {
        if (!c.template_created) return false
        const d = new Date(c.template_created)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (ym !== createdMonthFilter) return false
      }
      return true
    })
  }, [campaigns, search, channelFilter, templateFilter, monthFilter, createdMonthFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? (typeof a[sortKey] === 'number' ? -Infinity : '')
      const bv = b[sortKey] ?? (typeof b[sortKey] === 'number' ? -Infinity : '')
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paginated  = sorted.slice((page - 1) * pageSize, page * pageSize)
  const resetPage  = () => setPage(1)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    resetPage()
  }

  const SortBtn = ({ col }: { col: SortKey }) => (
    <button
      onClick={() => toggleSort(col)}
      className={`inline-flex items-center gap-0.5 ml-0.5 ${sortKey === col ? 'text-green-400' : 'text-gray-600 hover:text-gray-400'}`}
    >
      {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </button>
  )

  const activeFilters = [channelFilter !== 'all', templateFilter !== 'all', monthFilter !== 'all', createdMonthFilter !== 'all', search !== ''].filter(Boolean).length

  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 shadow-sm overflow-hidden backdrop-blur-sm">

      {/* Toolbar */}
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Campaigns</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {filtered.length} of {campaigns.length} results
              {activeFilters > 0 && (
                <span className="ml-1.5 bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-green-700/40">
                  {activeFilters} filter{activeFilters > 1 ? 's' : ''} active
                </span>
              )}
            </p>
          </div>
          <select value={pageSize} onChange={e => { setPageSize(+e.target.value); resetPage() }} className={selectCls}>
            {PAGE_SIZES.map(n => <option key={n} value={n}>Show {n}</option>)}
          </select>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={search} onChange={e => { setSearch(e.target.value); resetPage() }}
              placeholder="Search label, ID…"
              className={`w-full pl-8 pr-3 py-1.5 ${inputCls}`}
            />
            {search && (
              <button onClick={() => { setSearch(''); resetPage() }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm leading-none">×</button>
            )}
          </div>

          {/* Channel filter */}
          <select
            value={channelFilter} onChange={e => { setChannel(e.target.value); resetPage() }}
            className={`${selectCls} ${channelFilter !== 'all' ? 'border-green-600 text-green-400' : ''}`}
          >
            <option value="all">All Channels</option>
            {channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>

          {/* Template filter */}
          <select
            value={templateFilter} onChange={e => { setTemplate(e.target.value); resetPage() }}
            className={`${selectCls} ${templateFilter !== 'all' ? 'border-green-600 text-green-400' : ''}`}
          >
            <option value="all">All Templates</option>
            <option value="with">Has Template</option>
            <option value="without">No Template</option>
          </select>

          {/* Send Month filter */}
          <select
            value={monthFilter} onChange={e => { setMonth(e.target.value); resetPage() }}
            className={`${selectCls} ${monthFilter !== 'all' ? 'border-green-600 text-green-400' : ''}`}
          >
            <option value="all">Send Month</option>
            {months.map(ym => {
              const [y, m] = ym.split('-')
              const label = new Date(+y, +m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              return <option key={ym} value={ym}>{label}</option>
            })}
          </select>

          {/* Created Month filter */}
          <select
            value={createdMonthFilter} onChange={e => { setCreatedMonth(e.target.value); resetPage() }}
            className={`${selectCls} ${createdMonthFilter !== 'all' ? 'border-green-600 text-green-400' : ''}`}
          >
            <option value="all">Created Month</option>
            {createdMonths.map(ym => {
              const [y, m] = ym.split('-')
              const label = new Date(+y, +m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              return <option key={ym} value={ym}>{label}</option>
            })}
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-gray-500">Sort by</span>
            <select value={sortKey} onChange={e => { setSortKey(e.target.value as SortKey); resetPage() }} className={selectCls}>
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-1.5 text-xs border border-gray-700 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 transition-colors font-mono"
            >
              {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>

          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setChannel('all'); setTemplate('all'); setMonth('all'); setCreatedMonth('all'); resetPage() }}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-gray-900/60 border-b border-gray-700/50 text-gray-400 uppercase tracking-wider">
              <th className="px-3 py-3 font-semibold w-[72px]">Preview</th>
              <th className="px-3 py-3 font-semibold">Label <SortBtn col="label" /></th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">
                Send Date <SortBtn col="send_time" />
              </th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Channel</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Open Rate <SortBtn col="open_rate" /></th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Click Rate <SortBtn col="click_rate" /></th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Revenue <SortBtn col="conversion_value" /></th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">CTO Rate <SortBtn col="click_to_open_rate" /></th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Downloads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/30">
            {loading && (
              [...Array(8)].map((_, i) => (
                <tr key={i}>
                  {[...Array(9)].map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-3 bg-gray-700/60 rounded animate-pulse w-16" />
                    </td>
                  ))}
                </tr>
              ))
            )}
            {!loading && paginated.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-16 text-gray-500">
                  No campaigns match the current filters.
                </td>
              </tr>
            )}
            {!loading && paginated.map(c => (
              <tr key={c.id} className="hover:bg-gray-700/20 transition-colors">

                {/* Thumbnail */}
                <td className="px-3 py-2">
                  {c.template_filename
                    ? <ThumbCell campaignId={c.campaign_id} subject={c.subject || ''} onClick={() => onPreview(c)} />
                    : <div className="w-[60px] h-[44px] rounded border border-dashed border-gray-700 bg-gray-900/50 flex items-center justify-center text-gray-600 text-base">📄</div>
                  }
                </td>

                {/* Label */}
                <td className="px-3 py-2.5 max-w-[220px]">
                  {c.label
                    ? <span className="block truncate text-gray-200 font-medium" title={`${c.label}${c.subject ? `\n\n📧 ${c.subject}` : ''}\n\nID: ${c.campaign_id}`}>{c.label}</span>
                    : <span className="font-mono text-[11px] text-gray-500" title={c.campaign_id}>{c.campaign_id}</span>}
                </td>

                {/* Send Date */}
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-400 font-mono text-[11px]">
                  {c.send_time
                    ? new Date(c.send_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : <span className="text-gray-600">—</span>}
                </td>

                {/* Channel */}
                <td className="px-3 py-2.5">
                  {c.send_channel
                    ? <span className="bg-green-900/40 text-green-400 border border-green-700/40 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap">{c.send_channel}</span>
                    : <span className="text-gray-600">—</span>}
                </td>

                {/* Metrics */}
                <td className="px-3 py-2.5 font-mono text-sky-400 whitespace-nowrap">{pct(c.open_rate)}</td>
                <td className="px-3 py-2.5 font-mono text-sky-400 whitespace-nowrap">{pct(c.click_rate, 3)}</td>
                <td className="px-3 py-2.5 font-mono font-semibold text-green-400 whitespace-nowrap">{usd(c.conversion_value)}</td>
                <td className="px-3 py-2.5 font-mono text-sky-400 whitespace-nowrap">{pct(c.click_to_open_rate, 3)}</td>

                {/* Downloads */}
                <td className="px-3 py-2.5">
                  {c.template_filename
                    ? <div className="flex gap-1.5">
                        <button
                          onClick={() => window.open(getTemplateUrl(c.campaign_id), '_blank')}
                          className="text-[11px] bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded-md transition-colors whitespace-nowrap"
                        >HTML</button>
                        <button
                          onClick={() => downloadFromStorage(getScreenshotUrl(c.campaign_id), `${c.campaign_id}.png`)}
                          className="text-[11px] bg-sky-700 hover:bg-sky-600 text-white px-2 py-1 rounded-md transition-colors whitespace-nowrap"
                        >PNG</button>
                      </div>
                    : <span className="text-gray-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700/50 bg-gray-900/40">
        <p className="text-xs text-gray-500">
          {sorted.length === 0 ? 'No results' : `Showing ${Math.min((page - 1) * pageSize + 1, sorted.length)}–${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 text-gray-400 transition-colors">«</button>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 text-gray-400 transition-colors">‹</button>
          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
            return (
              <button key={p} onClick={() => setPage(p)}
                className={`w-7 h-7 text-xs rounded border transition-colors ${p === page ? 'bg-green-700 border-green-700 text-white' : 'border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-400'}`}
              >{p}</button>
            )
          })}
          <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} className="px-2 py-1 text-xs rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 text-gray-400 transition-colors">›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-xs rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 text-gray-400 transition-colors">»</button>
        </div>
      </div>
    </div>
  )
}
