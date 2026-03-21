import { useEffect, useRef, useState } from 'react'
import type { Campaign } from '../types'
import { getTemplateUrl, getScreenshotUrl, downloadFromStorage } from '../lib/storage'
import { generateScreenshot, downloadBlob } from '../lib/screenshot'

interface PreviewModalProps {
  campaign: Campaign | null
  onClose: () => void
}

type Tab = 'html' | 'image'

export default function PreviewModal({ campaign, onClose }: PreviewModalProps) {
  const [tab, setTab]                     = useState<Tab>('html')
  const [htmlBlobUrl, setHtmlBlobUrl]     = useState<string>('')
  const [imgLoading, setImgLoading]       = useState(false)
  const [imgError, setImgError]           = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!campaign) return
    setTab('html')
    setImgLoading(false)
    setImgError(false)
    setGenerating(false)
    setGeneratedBlob(null)

    let url = ''
    fetch(getTemplateUrl(campaign.campaign_id))
      .then(r => r.text())
      .then(html => {
        const blob = new Blob([html], { type: 'text/html' })
        url = URL.createObjectURL(blob)
        setHtmlBlobUrl(url)
      })
      .catch(() => {})

    return () => { if (url) URL.revokeObjectURL(url) }
  }, [campaign])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!campaign) return null

  const safeId        = campaign.campaign_id.replace(/[^a-zA-Z0-9]/g, '')
  const templateUrl   = getTemplateUrl(campaign.campaign_id)
  const screenshotUrl = getScreenshotUrl(campaign.campaign_id)

  const handleTabImg = () => {
    setTab('image')
    if (!generatedBlob) { setImgLoading(true); setImgError(false) }
  }

  const handleGenerateScreenshot = async () => {
    setGenerating(true)
    try {
      const blob = await generateScreenshot(campaign.campaign_id)
      setGeneratedBlob(blob)
      setImgError(false)
    } catch (err) {
      console.error('Screenshot generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadPng = async () => {
    if (generatedBlob) { downloadBlob(generatedBlob, `${safeId}.png`); return }
    try {
      await downloadFromStorage(screenshotUrl, `${safeId}.png`)
    } catch {
      setTab('image')
      setGenerating(true)
      try {
        const blob = await generateScreenshot(campaign.campaign_id)
        setGeneratedBlob(blob)
        setImgError(false)
        downloadBlob(blob, `${safeId}.png`)
      } catch (err) {
        console.error('Screenshot generation failed:', err)
      } finally {
        setGenerating(false)
      }
    }
  }

  const spinnerSvg = (cls = '') => (
    <svg className={`w-7 h-7 animate-spin text-green-500 ${cls}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 rounded-2xl shadow-2xl border border-gray-700/60 w-full max-w-7xl h-[98vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-700/50 flex-shrink-0">
          <div>
            <p className="font-semibold text-white text-sm leading-tight line-clamp-1">
              {campaign.label || campaign.subject || campaign.campaign_id}
            </p>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{campaign.campaign_id}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-0 border-b border-gray-700/50 flex-shrink-0">
          {(['html', 'image'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => t === 'image' ? handleTabImg() : setTab('html')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors -mb-px border-b-2 ${
                tab === t
                  ? 'text-green-400 border-green-500 bg-green-900/20'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {t === 'html' ? '🌐 HTML Preview' : '🖼 Image Preview'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">

          {/* HTML Tab */}
          {tab === 'html' && (
            htmlBlobUrl
              ? <iframe ref={iframeRef} src={htmlBlobUrl} className="w-full h-full border-0" title="Email Preview" />
              : <div className="w-full h-full flex items-center justify-center">{spinnerSvg()}</div>
          )}

          {/* Image Tab */}
          {tab === 'image' && (
            <div className="w-full h-full overflow-y-auto scrollbar-thin rounded-lg border border-gray-700 bg-gray-950 flex flex-col items-center justify-start">

              {generating && (
                <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                  {spinnerSvg()}
                  <span className="text-sm">Generating screenshot…</span>
                </div>
              )}

              {imgLoading && !generating && (
                <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                  {spinnerSvg()}
                  <span className="text-sm">Loading screenshot…</span>
                </div>
              )}

              {imgError && !generating && !generatedBlob && (
                <div className="flex flex-col items-center gap-4 py-16">
                  <p className="text-sm text-gray-500">No screenshot saved yet.</p>
                  <button
                    onClick={handleGenerateScreenshot}
                    className="flex items-center gap-2 text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Generate Screenshot
                  </button>
                </div>
              )}

              {!generatedBlob && !generating && (
                <img
                  src={`${screenshotUrl}?t=${Date.now()}`}
                  alt="Email screenshot"
                  className={`max-w-full rounded ${imgLoading || imgError ? 'hidden' : ''}`}
                  onLoad={() => setImgLoading(false)}
                  onError={() => { setImgLoading(false); setImgError(true) }}
                />
              )}

              {generatedBlob && !generating && (
                <img src={URL.createObjectURL(generatedBlob)} alt="Generated screenshot" className="max-w-full rounded" />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700/50 flex-shrink-0 bg-gray-900/60">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {campaign.send_channel && (
              <span className="bg-green-900/40 text-green-400 border border-green-700/40 px-2 py-0.5 rounded-full font-medium">
                {campaign.send_channel}
              </span>
            )}
            {campaign.timeframe_start && (
              <span>{campaign.timeframe_start.split('T')[0]} → {campaign.timeframe_end?.split('T')[0]}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.open(templateUrl, '_blank')}
              className="flex items-center gap-1.5 text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              HTML
            </button>
            <button
              onClick={handleDownloadPng}
              disabled={generating}
              className="flex items-center gap-1.5 text-xs bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              {generating
                ? spinnerSvg('w-3.5 h-3.5')
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
              }
              {generating ? 'Generating…' : 'Image'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
