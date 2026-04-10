import { useState, useEffect, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Campaign, Stats } from './types'
import { supabase } from './lib/supabase'
import { fetchCampaigns, fetchStats } from './lib/api'
import Navbar from './components/Navbar'
import StatsBar from './components/StatsBar'
import CampaignTable from './components/CampaignTable'
import PreviewModal from './components/PreviewModal'
import AIInsights from './components/AIInsights'
import RefreshMetricsModal from './components/RefreshMetricsModal'
import EmailCostModal from './components/EmailCostModal'
import { Lamp } from './components/Lamp'
import { AuthForm } from './components/AuthForm'

function AuthPage() {
  const [isLightOn, setIsLightOn] = useState(false)

  return (
    <div className={`min-h-screen w-full transition-colors duration-700 ${isLightOn ? 'bg-slate-900' : 'bg-black'}`}>
      <div className="relative flex min-h-screen w-full flex-col overflow-hidden md:flex-row">
        <div className={`pointer-events-none absolute inset-0 z-0 bg-black transition-opacity duration-1000 ${isLightOn ? 'opacity-0' : 'opacity-60'}`} />
        <div className="relative z-10 flex min-h-[50vh] w-full items-center justify-center md:min-h-screen md:w-1/2">
          <Lamp isOn={isLightOn} toggleLight={() => setIsLightOn(prev => !prev)} />
        </div>
        <div className="relative z-10 flex min-h-[50vh] w-full items-center justify-center md:min-h-screen md:w-1/2">
          <AuthForm isOn={isLightOn} />
        </div>
      </div>
      <div className="fixed bottom-4 left-0 right-0 z-20 text-center text-xs text-gray-600 opacity-50 mix-blend-screen">
        Pull the cord to {isLightOn ? 'hide' : 'reveal'} the form
      </div>
    </div>
  )
}

function Dashboard({ userId }: { userId: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats]         = useState<Stats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')
  const [selected, setSelected]   = useState<Campaign | null>(null)
  const [page, setPage]           = useState<'dashboard' | 'ai'>('dashboard')
  const [pullOpen, setPullOpen]   = useState(false)
  const [costOpen, setCostOpen]   = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [c, s] = await Promise.all([fetchCampaigns(), fetchStats()])
      setCampaigns(c)
      setStats(s)
      setLastUpdated('Updated ' + new Date().toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) + ' CST')
    } catch (err) {
      console.error('Supabase fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar
        lastUpdated={lastUpdated}
        onRefresh={loadData}
        onPullData={() => setPullOpen(true)}
        onEmailCostSettings={() => setCostOpen(true)}
        onLogout={() => supabase.auth.signOut()}
        page={page}
        onNavigate={setPage}
      />
      {page === 'dashboard' ? (
        <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
          <StatsBar stats={loading ? null : stats} />
          <CampaignTable campaigns={campaigns} loading={loading} onPreview={setSelected} onRefresh={loadData} />
        </main>
      ) : (
        <AIInsights />
      )}
      <PreviewModal campaign={selected} onClose={() => setSelected(null)} />
      <RefreshMetricsModal
        open={pullOpen}
        userId={userId}
        onClose={() => setPullOpen(false)}
        onDataRefreshed={loadData}
      />
      <EmailCostModal
        open={costOpen}
        onClose={() => setCostOpen(false)}
      />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return session ? <Dashboard userId={session.user.id} /> : <AuthPage />
}
