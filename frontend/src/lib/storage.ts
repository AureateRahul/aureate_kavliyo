import { supabase } from './supabase'

/** Strip non-alphanumeric characters — matches Python's safe_id logic. */
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '')

export function getTemplateUrl(campaignId: string): string {
  return supabase.storage
    .from('templates')
    .getPublicUrl(`${safeId(campaignId)}.html`).data.publicUrl
}

export function getScreenshotUrl(campaignId: string): string {
  return supabase.storage
    .from('screenshots')
    .getPublicUrl(`${safeId(campaignId)}.png`).data.publicUrl
}

/**
 * Fetch a cross-origin file from Supabase Storage and trigger a browser download.
 * Works around the fact that <a download> is ignored for cross-origin URLs.
 */
export async function downloadFromStorage(
  url: string,
  filename: string,
): Promise<void> {
  const res  = await fetch(url)
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href     = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}
