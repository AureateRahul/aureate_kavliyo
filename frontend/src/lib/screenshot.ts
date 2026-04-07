import html2canvas from 'html2canvas'
import { toBlob as htmlToImageToBlob } from 'html-to-image'
import domToImage from 'dom-to-image-more'
import { getTemplateUrl } from './storage'

export type ScreenshotEngine = 'html2canvas' | 'html-to-image' | 'dom-to-image-more'

export interface ScreenshotAttempt {
  engine: ScreenshotEngine
  durationMs: number
  success: boolean
  error?: string
}

export interface ScreenshotResult {
  blob: Blob
  engine: ScreenshotEngine
  durationMs: number
  attempts: ScreenshotAttempt[]
}

export interface ScreenshotOptions {
  idleMs?: number
  maxWaitMs?: number
}

interface TemplatePayload {
  html: string
  templateUrl: string
}

async function fetchTemplateHtml(campaignId: string): Promise<TemplatePayload> {
  const url = getTemplateUrl(campaignId)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch template: ${res.status}`)
  const html = await res.text()
  return { html, templateUrl: url }
}

function normalizeAssetUrl(rawUrl: string, baseUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('cid:')) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  try {
    return new URL(trimmed, baseUrl).href
  } catch {
    return trimmed
  }
}

function normalizeSrcset(rawSrcset: string, baseUrl: string): string {
  return rawSrcset
    .split(',')
    .map(part => {
      const bits = part.trim().split(/\s+/)
      if (bits.length === 0 || !bits[0]) return ''
      const normalizedUrl = normalizeAssetUrl(bits[0], baseUrl)
      const descriptor = bits.slice(1).join(' ')
      return descriptor ? `${normalizedUrl} ${descriptor}` : normalizedUrl
    })
    .filter(Boolean)
    .join(', ')
}

function normalizeImageDom(parsedDoc: Document, baseUrl: string): void {
  const srcAttrs = ['src', 'data-src', 'data-original', 'data-lazy-src', 'data-image-url']

  parsedDoc.querySelectorAll('img').forEach(img => {
    let chosen = ''
    for (const attr of srcAttrs) {
      const value = img.getAttribute(attr)
      if (value && value.trim()) {
        chosen = value
        break
      }
    }

    if (chosen) {
      img.setAttribute('src', normalizeAssetUrl(chosen, baseUrl))
    }

    const srcset = img.getAttribute('srcset')
    if (srcset) img.setAttribute('srcset', normalizeSrcset(srcset, baseUrl))

    img.setAttribute('crossorigin', 'anonymous')
    if (!img.getAttribute('referrerpolicy')) img.setAttribute('referrerpolicy', 'no-referrer')
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'eager')
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'sync')
  })

  parsedDoc.querySelectorAll<HTMLElement>('[style*="url("]').forEach(node => {
    const style = node.getAttribute('style')
    if (!style) return
    const next = style.replace(/url\((['"]?)(.*?)\1\)/gi, (_, quote: string, innerUrl: string) => {
      const normalized = normalizeAssetUrl(innerUrl, baseUrl)
      const q = quote || '"'
      return `url(${q}${normalized}${q})`
    })
    node.setAttribute('style', next)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to convert blob to data URL'))
    }
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'))
    reader.readAsDataURL(blob)
  })
}

async function inlineImagesAsDataUrls(parsedDoc: Document): Promise<void> {
  const images = Array.from(parsedDoc.querySelectorAll<HTMLImageElement>('img[src]'))
  await Promise.all(images.map(async img => {
    const src = img.getAttribute('src')
    if (!src || src.startsWith('data:') || src.startsWith('cid:')) return

    try {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 8000)
      const res = await fetch(src, { mode: 'cors', signal: controller.signal, cache: 'no-store' })
      window.clearTimeout(timeout)
      if (!res.ok) return
      const blob = await res.blob()
      const dataUrl = await blobToDataUrl(blob)
      img.setAttribute('src', dataUrl)
      img.removeAttribute('srcset')
    } catch {
      // Best effort: leave original URL if fetch is blocked by remote CORS policy.
    }
  }))
}

async function buildWrapperFromHtml(html: string, templateUrl: string): Promise<HTMLDivElement> {
  const parser = new DOMParser()
  const parsedDoc = parser.parseFromString(html, 'text/html')
  normalizeImageDom(parsedDoc, templateUrl)
  await inlineImagesAsDataUrls(parsedDoc)

  const wrapper = document.createElement('div')
  wrapper.style.cssText = [
    'position:fixed',
    'top:0',
    'left:-10000px',
    'width:800px',
    'min-height:200px',
    'background:#ffffff',
    'z-index:1',
    'pointer-events:none',
    'opacity:1',
    'overflow:visible',
    'visibility:visible',
  ].join(';')

  parsedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    const href = link.getAttribute('href')
    if (!href) return
    const clone = document.createElement('link')
    clone.rel = 'stylesheet'
    clone.href = href
    wrapper.appendChild(clone)
  })

  parsedDoc.querySelectorAll('style').forEach(s => {
    const clone = document.createElement('style')
    clone.textContent = s.textContent
    wrapper.appendChild(clone)
  })

  const bodyHost = document.createElement('div')
  bodyHost.style.cssText = 'display:block;width:100%;min-height:100%;background:#ffffff;'

  const bodyClassName = parsedDoc.body.getAttribute('class')
  if (bodyClassName) bodyHost.className = bodyClassName

  const bodyStyle = parsedDoc.body.getAttribute('style')
  if (bodyStyle) bodyHost.setAttribute('style', `${bodyHost.getAttribute('style') || ''};${bodyStyle}`)

  Array.from(parsedDoc.body.childNodes).forEach(node => {
    bodyHost.appendChild(document.importNode(node, true))
  })

  wrapper.appendChild(bodyHost)

  return wrapper
}

function getCaptureHeight(wrapper: HTMLDivElement): number {
  return Math.min(wrapper.scrollHeight || 1000, 12000)
}

async function captureWithHtml2Canvas(wrapper: HTMLDivElement, captureHeight: number): Promise<Blob> {
  const canvas = await html2canvas(wrapper, {
    width: 800,
    height: captureHeight,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: 800,
  })

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), 'image/png')
  })
}

async function captureWithHtmlToImage(wrapper: HTMLDivElement, captureHeight: number): Promise<Blob> {
  const blob = await htmlToImageToBlob(wrapper, {
    pixelRatio: 1,
    cacheBust: true,
    width: 800,
    height: captureHeight,
    backgroundColor: '#ffffff',
  })
  if (!blob) throw new Error('html-to-image returned null blob')
  return blob
}

async function captureWithDomToImageMore(wrapper: HTMLDivElement, captureHeight: number): Promise<Blob> {
  const blob = await domToImage.toBlob(wrapper, {
    width: 800,
    height: captureHeight,
    bgcolor: '#ffffff',
    cacheBust: true,
  })
  if (!blob) throw new Error('dom-to-image-more returned null blob')
  return blob
}

async function waitForImagesToSettle(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  if (images.length === 0) return

  await Promise.race([
    Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise<void>(resolve => {
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        })
      }),
    ),
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  ])
}

async function waitForFonts(timeoutMs = 3000): Promise<void> {
  const fontSet = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
  if (!fontSet?.ready) return

  await Promise.race([
    fontSet.ready.then(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  ])
}

async function waitForDomStability(
  root: HTMLElement,
  {
    idleMs = 700,
    maxWaitMs = 10000,
  }: Required<ScreenshotOptions>,
): Promise<void> {
  if (typeof MutationObserver === 'undefined') return

  await new Promise<void>(resolve => {
    let idleTimer: number | undefined
    let maxTimer: number | undefined

    const finish = () => {
      if (idleTimer) window.clearTimeout(idleTimer)
      if (maxTimer) window.clearTimeout(maxTimer)
      observer.disconnect()
      resolve()
    }

    const scheduleIdle = () => {
      if (idleTimer) window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(finish, idleMs)
    }

    const observer = new MutationObserver(() => {
      scheduleIdle()
    })

    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })

    maxTimer = window.setTimeout(finish, maxWaitMs)
    scheduleIdle()
  })
}

/**
 * Fetches an HTML email template, injects it into a hidden div on the current
 * page (same-origin, no iframe CSP issues), captures with html2canvas, and
 * returns a PNG Blob.
 *
 * Why no iframe: Supabase Storage adds `Content-Security-Policy: sandbox` which
 * blocks rendering inside a cross-origin iframe. Injecting directly into a div
 * avoids all iframe/CSP restrictions and lets html2canvas access the DOM freely.
 */
export async function generateScreenshotWithBestMethod(
  campaignId: string,
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
  const { html, templateUrl } = await fetchTemplateHtml(campaignId)
  const wrapper = await buildWrapperFromHtml(html, templateUrl)
  const attempts: ScreenshotAttempt[] = []
  const idleMs = options.idleMs ?? 500
  const maxWaitMs = options.maxWaitMs ?? 10000

  document.body.appendChild(wrapper)
  await new Promise(r => requestAnimationFrame(r))
  await waitForFonts()
  await waitForImagesToSettle(wrapper)
  await waitForDomStability(wrapper, { idleMs, maxWaitMs })
  await waitForImagesToSettle(wrapper)

  try {
    const captureHeight = getCaptureHeight(wrapper)
    const engines: Array<{ engine: ScreenshotEngine; run: () => Promise<Blob> }> = [
      { engine: 'html2canvas', run: () => captureWithHtml2Canvas(wrapper, captureHeight) },
      { engine: 'html-to-image', run: () => captureWithHtmlToImage(wrapper, captureHeight) },
      { engine: 'dom-to-image-more', run: () => captureWithDomToImageMore(wrapper, captureHeight) },
    ]

    for (const entry of engines) {
      const start = performance.now()
      try {
        const blob = await entry.run()
        const durationMs = Math.round(performance.now() - start)
        attempts.push({ engine: entry.engine, durationMs, success: true })
        return { blob, engine: entry.engine, durationMs, attempts }
      } catch (err) {
        const durationMs = Math.round(performance.now() - start)
        attempts.push({
          engine: entry.engine,
          durationMs,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    throw new Error(`All screenshot engines failed: ${attempts.map(a => `${a.engine}:${a.error || 'unknown'}`).join(' | ')}`)
  } finally {
    if (document.body.contains(wrapper)) document.body.removeChild(wrapper)
  }
}

export async function generateScreenshot(campaignId: string): Promise<Blob> {
  const result = await generateScreenshotWithBestMethod(campaignId)
  return result.blob
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
