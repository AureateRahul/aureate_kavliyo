import { useState, useRef, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'ai_insights_conversations'
const ACTIVE_KEY  = 'ai_insights_active_id'

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveConversations(convs: Conversation[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convs)) } catch {}
}

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

function saveActiveId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id)
}

function newConversation(): Conversation {
  return {
    id:        crypto.randomUUID(),
    title:     'New conversation',
    messages:  [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function titleFromQuestion(q: string): string {
  return q.length > 50 ? q.slice(0, 50) + '…' : q
}

// ---------------------------------------------------------------------------
// Starter questions
// ---------------------------------------------------------------------------
const STARTER_QUESTIONS = [
  'What were the top 5 campaigns by open rate?',
  'Suggest 6 email topics for next month based on past performance',
  'Which months had the highest average open rate?',
  'Write 5 subject line ideas based on our best performers',
]

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-green-400 font-semibold text-base mt-4 mb-1">{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-green-300 font-medium text-sm mt-3 mb-1">{line.slice(4)}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} className="ml-4 list-disc text-gray-300 text-sm"><InlineMd text={line.slice(2)} /></li>)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-gray-300 text-sm leading-relaxed"><InlineMd text={line} /></p>)
    }
  }
  return <div className="space-y-0.5">{elements}</div>
}

function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AIInsights() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = loadConversations()
    if (saved.length === 0) {
      const fresh = newConversation()
      return [fresh]
    }
    return saved
  })

  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadActiveId()
    const convs = loadConversations()
    if (saved && convs.find(c => c.id === saved)) return saved
    return convs[0]?.id ?? newConversation().id
  })

  const [input, setInput]                 = useState('')
  const [loading, setLoading]             = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const active = conversations.find(c => c.id === activeId) ?? conversations[0]

  // Persist on every change
  useEffect(() => { saveConversations(conversations) }, [conversations])
  useEffect(() => { if (activeId) saveActiveId(activeId) }, [activeId])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages, loading])

  const createNew = useCallback(() => {
    const conv = newConversation()
    setConversations(prev => [conv, ...prev])
    setActiveId(conv.id)
    setInput('')
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      if (next.length === 0) {
        const fresh = newConversation()
        setActiveId(fresh.id)
        return [fresh]
      }
      if (id === activeId) setActiveId(next[0].id)
      return next
    })
    setDeleteConfirm(null)
  }, [activeId])

  async function ask(question: string) {
    if (!question.trim() || loading || !active) return

    const userMsg: Message = { role: 'user', content: question, ts: Date.now() }
    const isFirst = active.messages.length === 0

    // Optimistically update messages
    setConversations(prev => prev.map(c =>
      c.id === active.id
        ? {
            ...c,
            title:     isFirst ? titleFromQuestion(question) : c.title,
            messages:  [...c.messages, userMsg],
            updatedAt: Date.now(),
          }
        : c
    ))
    setInput('')
    setLoading(true)

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 310_000)
      const res = await fetch('http://localhost:5000/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: active.messages }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      const assistantMsg: Message = { role: 'assistant', content: data.answer, ts: Date.now() }
      setConversations(prev => prev.map(c =>
        c.id === active.id
          ? { ...c, messages: [...c.messages, userMsg, assistantMsg].slice(c.messages.length), updatedAt: Date.now() }
          : c
      ))
    } catch (err) {
      const errMsg: Message = { role: 'assistant', content: `Error: ${String(err)}`, ts: Date.now() }
      setConversations(prev => prev.map(c =>
        c.id === active.id
          ? { ...c, messages: [...c.messages, userMsg, errMsg].slice(c.messages.length), updatedAt: Date.now() }
          : c
      ))
    } finally {
      setLoading(false)
    }
  }

  const isEmpty = !active || active.messages.length === 0

  return (
    <div className="flex h-[calc(100vh-56px)] bg-slate-900">

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className={`flex flex-col border-r border-gray-700/50 bg-gray-900/80 transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-700/50">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversations</span>
          <button
            onClick={createNew}
            className="flex items-center gap-1 text-xs bg-green-800/60 hover:bg-green-700/60 border border-green-700/50 text-green-400 px-2 py-1 rounded-lg transition-colors"
            title="New chat"
          >
            <span className="text-base leading-none">+</span> New
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`group relative flex items-center gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors ${
                conv.id === activeId
                  ? 'bg-gray-700/60 text-white'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}
              onClick={() => { setActiveId(conv.id); setDeleteConfirm(null) }}
            >
              <span className="text-xs shrink-0 opacity-60">✦</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate font-medium">{conv.title}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{formatDate(conv.updatedAt)} · {conv.messages.length} msgs</p>
              </div>
              {/* Delete button */}
              {deleteConfirm === conv.id ? (
                <button
                  onClick={e => { e.stopPropagation(); deleteConversation(conv.id) }}
                  className="shrink-0 text-[10px] bg-red-900/60 text-red-400 border border-red-800/50 px-1.5 py-0.5 rounded transition-colors"
                >
                  Delete
                </button>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setDeleteConfirm(conv.id) }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-sm leading-none px-1"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Chat area                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <div className="border-b border-gray-700/50 px-4 py-3 flex items-center justify-between bg-gray-900/60 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-800"
              title="Toggle sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-green-400">✦</span>
            <span className="text-white font-semibold text-sm truncate max-w-[300px]">
              {active?.title ?? 'AI Insights'}
            </span>
            <span className="text-xs text-gray-500">powered by Claude</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">223 campaigns · All time</span>
            <button
              onClick={createNew}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <span className="text-sm leading-none">+</span> New Chat
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-full gap-6 pb-16">
              <div className="text-center">
                <div className="text-4xl mb-3">✦</div>
                <p className="text-gray-400 text-sm">Ask anything about your Klaviyo campaign performance</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl w-full">
                {STARTER_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => ask(q)}
                    className="text-left text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-green-700/50 rounded-xl px-4 py-3 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active?.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-green-900/60 border border-green-700/40 flex items-center justify-center text-xs text-green-400 mr-2 mt-0.5 shrink-0">✦</div>
              )}
              <div className="flex flex-col gap-1 max-w-[80%]">
                <div className={`rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-green-700/80 text-white text-sm' : 'bg-gray-800 border border-gray-700/50'}`}>
                  {msg.role === 'user'
                    ? <p className="text-sm leading-relaxed">{msg.content}</p>
                    : <MarkdownText text={msg.content} />
                  }
                </div>
                <span className={`text-xs text-gray-600 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {formatTime(msg.ts)}
                </span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-green-900/60 border border-green-700/40 flex items-center justify-center text-xs text-green-400 mr-2 mt-0.5 shrink-0">✦</div>
              <div className="bg-gray-800 border border-gray-700/50 rounded-2xl px-4 py-3 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400 text-sm">Analysing your campaign data...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-700/50 px-4 py-4 bg-gray-900/60 shrink-0">
          <form
            onSubmit={e => { e.preventDefault(); ask(input) }}
            className="flex gap-2 max-w-4xl mx-auto"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your campaigns..."
              disabled={loading}
              className="flex-1 bg-gray-800 border border-gray-700 focus:border-green-600 focus:outline-none text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2.5 rounded-xl transition-colors text-sm font-medium"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
