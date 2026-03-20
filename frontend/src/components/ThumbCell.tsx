import { useState, useEffect } from 'react'
import { getTemplateUrl } from '../lib/storage'

interface ThumbCellProps {
  campaignId: string
  subject: string
  onClick: () => void
}

export default function ThumbCell({ campaignId, subject, onClick }: ThumbCellProps) {
  const [blobUrl, setBlobUrl] = useState<string>('')

  useEffect(() => {
    let url = ''
    fetch(getTemplateUrl(campaignId))
      .then(r => r.text())
      .then(html => {
        const blob = new Blob([html], { type: 'text/html' })
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
      })
      .catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [campaignId])

  return (
    <div
      className="thumb-iframe-wrap border border-slate-200 bg-slate-50"
      onClick={onClick}
      title={`Preview: ${subject || campaignId}`}
    >
      {blobUrl
        ? <iframe src={blobUrl} scrolling="no" tabIndex={-1} title={subject || campaignId} />
        : <div className="w-full h-full flex items-center justify-center">
            <div className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
          </div>
      }
    </div>
  )
}
