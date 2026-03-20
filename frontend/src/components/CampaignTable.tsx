import { useState, useMemo } from 'react'
import type { Campaign } from '../types'
import ThumbCell from './ThumbCell'
import { getTemplateUrl, getScreenshotUrl, downloadFromStorage } from '../lib/storage'

interface CampaignTableProps {
  campaigns: Campaign[]
  loading: boolean
  onPreview: (c: Campaign) => void
}

type SortKey = 'open_rate' | 'click_rate' | 'conversion_value' | 'click_to_open_rate' | 'label' | 'subject'
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
  { key: 'open_rate',          label: 'Open Rate'    },
  { key: 'click_rate',         label: 'Click Rate'   },
  { key: 'conversion_value',   label: 'Revenue'      },
  { key: 'click_to_open_rate', label: 'CTO Rate'     },
  { key: 'label',              label: 'Label'        },
  { key: 'subject',            label: 'Subject'      },
]

export default function CampaignTable({ campaigns, loading, onPreview }: CampaignTableProps) {
  const [search, setSearch]           = useState('')
  const [channelFilter, setChannel]   = useState<string>('all')
  const [templateFilter, setTemplate] = useState<string>('all')  // all | with | without
  const [sortKey, setSortKey]         = useState<SortKey>('open_rate')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState(25)

  // Derive unique channels for filter dropdown
  const channels = useMemo(() => {
    const set = new Set(campaigns.map(c => c.send_channel).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [campaigns])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return campaigns.filter(c => {
      if (q && ![c.campaign_id, c.label, c.subject, c.send_channel].some(v => v?.toLowerCase().includes(q))) return false
      if (channelFilter !== 'all' && c.send_channel !== channelFilter) return false
      if (templateFilter === 'with'    && !c.template_filename) return false
      if (templateFilter === 'without' &&  c.template_filename) return false
      return true
    })
  }, [campaigns, search, channelFilter, templateFilter])

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

  const resetPage = () => setPage(1)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    resetPage()
  }

  const SortBtn = ({ col }: { col: SortKey }) => (
    <button
      onClick={() => toggleSort(col)}
      className={`inline-flex items-center gap-0.5 ml-0.5 ${sortKey === col ? 'text-brand-600' : 'text-slate-300 hover:text-slate-500'}`}
    >
      {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </button>
  )

  const activeFilters = [channelFilter !== 'all', templateFilter !== 'all', search !== ''].filter(Boolean).length

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

      {/* Toolbar */}
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Campaigns</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {filtered.length} of {campaigns.length} results
              {activeFilters > 0 && <span className="ml-1.5 bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">{activeFilters} filter{activeFilters > 1 ? 's' : ''} active</span>}
            </p>
          </div>
          <select
            value={pageSize}
            onChange={e => { setPageSize(+e.target.value); resetPage() }}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-brand-400 text-slate-600"
          >
            {PAGE_SIZES.map(n => <option key={n} value={n}>Show {n}</option>)}
          </select>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage() }}
              placeholder="Search label, subject, ID…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors"
            />
            {search && (
              <button onClick={() => { setSearch(''); resetPage() }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-sm leading-none">×</button>
            )}
          </div>

          {/* Channel filter */}
          <select
            value={channelFilter}
            onChange={e => { setChannel(e.target.value); resetPage() }}
            className={`text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-400 transition-colors ${channelFilter !== 'all' ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
          >
            <option value="all">All Channels</option>
            {channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>

          {/* Template filter */}
          <select
            value={templateFilter}
            onChange={e => { setTemplate(e.target.value); resetPage() }}
            className={`text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-400 transition-colors ${templateFilter !== 'all' ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
          >
            <option value="all">All Templates</option>
            <option value="with">Has Template</option>
            <option value="without">No Template</option>
          </select>

          {/* Sort control */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-slate-400">Sort by</span>
            <select
              value={sortKey}
              onChange={e => { setSortKey(e.target.value as SortKey); resetPage() }}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:border-brand-400 text-slate-600"
            >
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 hover:bg-white text-slate-600 transition-colors font-mono"
              title="Toggle sort direction"
            >
              {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>

          {/* Clear filters */}
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setChannel('all'); setTemplate('all'); resetPage() }}
              className="text-xs text-slate-400 hover:text-rose-500 transition-colors underline underline-offset-2"
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
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider">
              <th className="px-3 py-3 font-semibold w-[72px]">Preview</th>
              <th className="px-3 py-3 font-semibold">
                Label <SortBtn col="label" />
              </th>
              <th className="px-3 py-3 font-semibold">
                Subject <SortBtn col="subject" />
              </th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Channel</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">
                Open Rate <SortBtn col="open_rate" />
              </th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">
                Click Rate <SortBtn col="click_rate" />
              </th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">
                Revenue <SortBtn col="conversion_value" />
              </th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">
                CTO Rate <SortBtn col="click_to_open_rate" />
              </th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Downloads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && (
              [...Array(8)].map((_, i) => (
                <tr key={i}>
                  {[...Array(9)].map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-16" />
                    </td>
                  ))}
                </tr>
              ))
            )}
            {!loading && paginated.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-16 text-slate-400">
                  No campaigns match the current filters.
                </td>
              </tr>
            )}
            {!loading && paginated.map(c => (
              <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">

                {/* Thumbnail */}
                <td className="px-3 py-2">
                  {c.template_filename
                    ? <ThumbCell campaignId={c.campaign_id} subject={c.subject || ''} onClick={() => onPreview(c)} />
                    : <div className="w-[60px] h-[44px] rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300 text-base">📄</div>
                  }
                </td>

                {/* Label — shows campaign ID on hover */}
                <td className="px-3 py-2.5 max-w-[200px]">
                  {c.label
                    ? <span className="block truncate text-slate-700 font-medium" title={`${c.label}\n\nID: ${c.campaign_id}`}>{c.label}</span>
                    : <span className="font-mono text-[11px] text-slate-400" title={c.campaign_id}>{c.campaign_id}</span>}
                </td>

                {/* Subject */}
                <td className="px-3 py-2.5 max-w-[220px]">
                  {c.subject
                    ? <span className="block truncate text-slate-600" title={c.subject}>{c.subject}</span>
                    : <span className="text-slate-300">—</span>}
                </td>

                {/* Channel */}
                <td className="px-3 py-2.5">
                  {c.send_channel
                    ? <span className="bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap">{c.send_channel}</span>
                    : <span className="text-slate-300">—</span>}
                </td>

                {/* Metrics */}
                <td className="px-3 py-2.5 font-mono text-sky-700 whitespace-nowrap">{pct(c.open_rate)}</td>
                <td className="px-3 py-2.5 font-mono text-sky-700 whitespace-nowrap">{pct(c.click_rate, 3)}</td>
                <td className="px-3 py-2.5 font-mono font-semibold text-emerald-700 whitespace-nowrap">{usd(c.conversion_value)}</td>
                <td className="px-3 py-2.5 font-mono text-sky-700 whitespace-nowrap">{pct(c.click_to_open_rate, 3)}</td>

                {/* Downloads */}
                <td className="px-3 py-2.5">
                  {c.template_filename
                    ? <div className="flex gap-1.5">
                        <button
                          onClick={() => downloadFromStorage(getTemplateUrl(c.campaign_id), `${c.campaign_id}.html`)}
                          className="text-[11px] bg-brand-700 hover:bg-brand-800 text-white px-2 py-1 rounded-md transition-colors whitespace-nowrap"
                        >
                          HTML
                        </button>
                        <button
                          onClick={() => downloadFromStorage(getScreenshotUrl(c.campaign_id), `${c.campaign_id}.png`)}
                          className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-md transition-colors whitespace-nowrap"
                        >
                          PNG
                        </button>
                      </div>
                    : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-400">
          {sorted.length === 0 ? 'No results' : `Showing ${Math.min((page - 1) * pageSize + 1, sorted.length)}–${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1}
            className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-white disabled:opacity-40 text-slate-600 transition-colors">«</button>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
            className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-white disabled:opacity-40 text-slate-600 transition-colors">‹</button>
          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
            return (
              <button key={p} onClick={() => setPage(p)}
                className={`w-7 h-7 text-xs rounded border transition-colors ${p === page ? 'bg-brand-700 border-brand-700 text-white' : 'border-slate-200 hover:bg-white text-slate-600'}`}
              >{p}</button>
            )
          })}
          <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
            className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-white disabled:opacity-40 text-slate-600 transition-colors">›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
            className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-white disabled:opacity-40 text-slate-600 transition-colors">»</button>
        </div>
      </div>
    </div>
  )
}
