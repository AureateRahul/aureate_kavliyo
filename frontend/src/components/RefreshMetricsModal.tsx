import { useState, useEffect, useRef } from 'react'
import { refreshMetrics, runApi2, runApi3 } from '../lib/api'
import type { RefreshResult } from '../lib/api'

const TIMEFRAMES: { key: string; label: string }[] = [
  { key: 'today',        label: 'Today' },
  { key: 'yesterday',    label: 'Yesterday' },
  { key: 'this_week',    label: 'This Week' },
  { key: 'last_7_days',  label: 'Last 7 Days' },
  { key: 'last_week',    label: 'Last Week' },
  { key: 'this_month',   label: 'This Month' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'last_month',   label: 'Last Month' },
  { key: 'last_90_days', label: 'Last 90 Days' },
  { key: 'last_3_months',label: 'Last 3 Months' },
  { key: 'last_365_days',label: 'Last 365 Days' },
  { key: 'last_12_months',label: 'Last 12 Months' },
  { key: 'this_year',    label: 'This Year' },
  { key: 'last_year',    label: 'Last Year' },
]

type Step = 'select' | 'fetching' | 'done' | 'running-api2' | 'running-api3' | 'error'

interface Props {
  open: boolean
  onClose: () => void
  onDataRefreshed: () => void
}

export default function RefreshMetricsModal({ open, onClose, onDataRefreshed }: Props) {
  const [timeframe, setTimeframe]   = useState('last_90_days')
  const [step, setStep]             = useState<Step>('select')
  const [result, setResult]         = useState<RefreshResult | null>(null)
  const [error, setError]           = useState('')
  const [api2Done, setApi2Done]     = useState(false)
  const [api3Done, setApi3Done]     = useState(false)
  const [apiMsg, setApiMsg]         = useState('')
  const [elapsed, setElapsed]       = useState(0)
  const timerRef                    = useRef<ReturnType<typeof setInterval> | null>(null)
  const isBusyStep = step === 'fetching' || step === 'running-api2' || step === 'running-api3'

  useEffect(() => {
    if (isBusyStep) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isBusyStep])

  function handleClose() {
    setStep('select')
    setResult(null)
    setError('')
    setApi2Done(false)
    setApi3Done(false)
    setApiMsg('')
    onClose()
  }

  async function handleFetch() {
    setStep('fetching')
    setError('')
    try {
      const r = await refreshMetrics(timeframe)
      setResult(r)
      setStep('done')
      onDataRefreshed()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('error')
    }
  }

  async function handleRunApi2() {
    if (!result) return
    setStep('running-api2')
    setApiMsg('')
    try {
      const r = await runApi2(result.new_campaign_ids)
      setApiMsg(`API 2 complete — ${r.processed} campaign messages fetched.`)
      setApi2Done(true)
    } catch (e: unknown) {
      setApiMsg(`API 2 error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setStep('done')
      onDataRefreshed()
    }
  }

  async function handleRunApi3() {
    if (!result) return
    setStep('running-api3')
    setApiMsg('')
    try {
      const r = await runApi3(result.new_campaign_ids)
      setApiMsg(`API 3 complete — ${r.processed} templates saved.`)
      setApi3Done(true)
    } catch (e: unknown) {
      setApiMsg(`API 3 error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setStep('done')
      onDataRefreshed()
    }
  }

  if (!open) return null

  const isBusy = isBusyStep

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={isBusy ? undefined : handleClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">Pull Latest Campaign Data</h2>
          {!isBusy && (
            <button onClick={handleClose} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">✕</button>
          )}
        </div>

        {/* Timeframe selector */}
        {(step === 'select' || step === 'done' || step === 'error') && (
          <div className="space-y-2">
            <label className="block text-xs text-gray-400 font-medium uppercase tracking-wider">Timeframe</label>
            <select
              value={timeframe}
              onChange={e => setTimeframe(e.target.value)}
              disabled={isBusy}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-green-500 transition-colors"
            >
              {TIMEFRAMES.map(tf => (
                <option key={tf.key} value={tf.key}>{tf.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Busy spinner */}
        {isBusy && (
          <div className="flex items-center gap-3 py-2 text-gray-300 text-sm">
            <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span>
                {step === 'fetching'     && 'Fetching campaign metrics from Klaviyo…'}
                {step === 'running-api2' && 'Running API 2 — fetching campaign messages…'}
                {step === 'running-api3' && 'Running API 3 — downloading templates…'}
              </span>
              <span className="text-xs text-gray-500">{elapsed}s elapsed — please wait</span>
            </div>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="text-red-400 text-sm bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Success result */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="bg-green-950/40 border border-green-700/50 rounded-lg px-4 py-3 space-y-1">
              <p className="text-green-400 text-sm font-medium">Data updated successfully</p>
              <p className="text-gray-300 text-sm">
                <span className="text-white font-semibold">{result.updated}</span> campaigns updated ·{' '}
                <span className="text-white font-semibold">{result.inserted}</span> new entries added
              </p>
            </div>

            {result.inserted > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                  {result.inserted} new campaign{result.inserted > 1 ? 's' : ''} — run additional APIs?
                </p>

                {apiMsg && (
                  <p className="text-xs text-gray-300 bg-gray-800 rounded px-3 py-2">{apiMsg}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleRunApi2}
                    disabled={api2Done}
                    className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium transition-colors border ${
                      api2Done
                        ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-cyan-900/40 border-cyan-700/50 text-cyan-300 hover:bg-cyan-800/50'
                    }`}
                  >
                    {api2Done ? '✓ API 2 Done' : 'Run API 2 (Messages)'}
                  </button>
                  <button
                    onClick={handleRunApi3}
                    disabled={api3Done || !api2Done}
                    title={!api2Done ? 'Run API 2 first' : undefined}
                    className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium transition-colors border ${
                      api3Done
                        ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                        : !api2Done
                        ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                        : 'bg-emerald-900/40 border-emerald-700/50 text-emerald-300 hover:bg-emerald-800/50'
                    }`}
                  >
                    {api3Done ? '✓ API 3 Done' : 'Run API 3 (Templates)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {!isBusy && (
            <button
              onClick={handleFetch}
              className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {step === 'done' ? 'Fetch Again' : 'Fetch Data'}
            </button>
          )}
          {!isBusy && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
