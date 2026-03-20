import { useState, useEffect, useCallback } from 'react'
import type { Campaign, Stats } from './types'
import { fetchCampaigns, fetchStats } from './lib/api'
import Navbar from './components/Navbar'
import StatsBar from './components/StatsBar'
import CampaignTable from './components/CampaignTable'
import PreviewModal from './components/PreviewModal'

export default function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats]         = useState<Stats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')
  const [selected, setSelected]   = useState<Campaign | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [c, s] = await Promise.all([fetchCampaigns(), fetchStats()])
      setCampaigns(c)
      setStats(s)
      setLastUpdated('Updated ' + new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Supabase fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar lastUpdated={lastUpdated} onRefresh={loadData} />

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <StatsBar stats={loading ? null : stats} />
        <CampaignTable
          campaigns={campaigns}
          loading={loading}
          onPreview={setSelected}
        />
      </main>

      <PreviewModal campaign={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
