import html2canvas from 'html2canvas'
import { getTemplateUrl } from './storage'

/**
 * Fetches an HTML email template, injects it into a hidden div on the current
 * page (same-origin, no iframe CSP issues), captures with html2canvas, and
 * returns a PNG Blob.
 *
 * Why no iframe: Supabase Storage adds `Content-Security-Policy: sandbox` which
 * blocks rendering inside a cross-origin iframe. Injecting directly into a div
 * avoids all iframe/CSP restrictions and lets html2canvas access the DOM freely.
 */
export async function generateScreenshot(campaignId: string): Promise<Blob> {
  const url = getTemplateUrl(campaignId)

  // 1. Fetch the HTML source
  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch template: ${res.status}`)
  const html = await res.text()

  // 2. Parse with DOMParser to safely extract styles + body content
  const parser    = new DOMParser()
  const parsedDoc = parser.parseFromString(html, 'text/html')

  // 3. Build a hidden wrapper div — must be in-viewport and visible for html2canvas
  const wrapper = document.createElement('div')
  wrapper.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:800px',
    'min-height:200px',
    'background:#ffffff',
    'z-index:99999',
    'pointer-events:none',
    // Tiny opacity keeps it invisible yet still painted by the browser
    'opacity:0.001',
    'overflow:visible',
  ].join(';')

  // 4. Inject <style> blocks from <head> and <body>
  parsedDoc.querySelectorAll('style').forEach(s => {
    const clone = document.createElement('style')
    clone.textContent = s.textContent
    wrapper.appendChild(clone)
  })

  // 5. Inject body child nodes
  Array.from(parsedDoc.body.childNodes).forEach(node => {
    wrapper.appendChild(document.importNode(node, true))
  })

  document.body.appendChild(wrapper)

  // 6. Allow browser a frame + short delay to paint and layout
  await new Promise(r => requestAnimationFrame(r))
  await new Promise(r => setTimeout(r, 600))

  const captureHeight = Math.min(wrapper.scrollHeight || 1000, 12000)

  try {
    const canvas = await html2canvas(wrapper, {
      width:           800,
      height:          captureHeight,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: '#ffffff',
      logging:         false,
      scrollX:         0,
      scrollY:         -window.scrollY,
      windowWidth:     800,
    })

    document.body.removeChild(wrapper)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
        'image/png',
      )
    })
  } catch (err) {
    if (document.body.contains(wrapper)) document.body.removeChild(wrapper)
    throw err
  }
}

/** Trigger a browser file-save dialog from a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
