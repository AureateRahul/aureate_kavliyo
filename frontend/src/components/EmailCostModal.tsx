import { useEffect, useMemo, useState } from 'react'
import { fetchUserEmailCost, saveUserEmailCost } from '../lib/api'

interface EmailCostModalProps {
  open: boolean
  onClose: () => void
}

export default function EmailCostModal({ open, onClose }: EmailCostModalProps) {
  const [monthlyCost, setMonthlyCost] = useState('')
  const [totalCredits, setTotalCredits] = useState('')
  const [currentPerEmailCost, setCurrentPerEmailCost] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  const calculated = useMemo(() => {
    const monthly = Number(monthlyCost)
    const credits = Number(totalCredits)
    if (!Number.isFinite(monthly) || !Number.isFinite(credits) || credits <= 0) return null
    return monthly / credits
  }, [monthlyCost, totalCredits])

  useEffect(() => {
    if (!open) return

    let alive = true
    setLoading(true)
    setError('')
    setSavedMsg('')

    fetchUserEmailCost()
      .then((cost) => {
        if (!alive) return
        setCurrentPerEmailCost(cost)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [open])

  async function handleSave() {
    setError('')
    setSavedMsg('')

    const monthly = Number(monthlyCost)
    const credits = Number(totalCredits)

    if (!Number.isFinite(monthly) || monthly < 0) {
      setError('Monthly cost must be a valid non-negative number.')
      return
    }
    if (!Number.isFinite(credits) || credits <= 0) {
      setError('Total email credits must be greater than 0.')
      return
    }

    try {
      setSaving(true)
      const saved = await saveUserEmailCost({
        monthlyCost: monthly,
        totalEmailCredits: credits,
      })
      setCurrentPerEmailCost(saved)
      setSavedMsg('Per-email cost saved. New campaigns will use this value on next API 1 run.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={saving ? undefined : onClose} />

      <div className="relative w-full max-w-md mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">Per Email Cost Settings</h2>
          {!saving && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">x</button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading current value...</p>
        ) : (
          <p className="text-xs text-gray-400">
            Current per email cost: <span className="text-green-400 font-mono">{currentPerEmailCost ?? 0}</span>
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Monthly Cost (USD)</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={monthlyCost}
              onChange={(e) => setMonthlyCost(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-green-500"
              placeholder="4030"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Total Email Credits</label>
            <input
              type="number"
              step="1"
              min="1"
              value={totalCredits}
              onChange={(e) => setTotalCredits(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-green-500"
              placeholder="4300000"
            />
          </div>

          <div className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300">
            Calculated per email cost: <span className="font-mono text-green-400">{calculated ?? 0}</span>
          </div>
        </div>

        {error && <div className="text-red-400 text-sm bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{error}</div>}
        {savedMsg && <div className="text-green-400 text-sm bg-green-950/40 border border-green-700/50 rounded-lg px-3 py-2">{savedMsg}</div>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Cost'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
