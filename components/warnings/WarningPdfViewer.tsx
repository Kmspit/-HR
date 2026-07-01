'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { toast } from 'sonner'
import { warningPdfApiPath, warningPdfDownloadPath } from '@/lib/warning-pdf-url'

type Props = {
  warningId: string
  title?: string
  open: boolean
  onClose: () => void
}

const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200]

export default function WarningPdfViewer({ warningId, title, open, onClose }: Props) {
  const viewUrl = warningPdfApiPath(warningId)
  const downloadUrl = warningPdfDownloadPath(warningId)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [zoomIdx, setZoomIdx] = useState(2) // default 100%
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const zoom = ZOOM_STEPS[zoomIdx]

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setLoadError(false)
    setZoomIdx(2)
  }, [open, warningId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (fullscreen) setFullscreen(false); else onClose() }
      if (e.key === '+' || e.key === '=') setZoomIdx((i) => Math.min(i + 1, ZOOM_STEPS.length - 1))
      if (e.key === '-') setZoomIdx((i) => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    console.log('[SCROLL LOCK] WarningPdfViewer')
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      console.log('[SCROLL UNLOCK] WarningPdfViewer')
    }
  }, [open, onClose, fullscreen])

  const openNewTab = useCallback(() => {
    window.open(viewUrl, '_blank', 'noopener,noreferrer')
  }, [viewUrl])

  const downloadPdf = useCallback(async () => {
    try {
      const res = await fetch(downloadUrl, { credentials: 'include' })
      if (!res.ok) throw new Error('download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `warning-${warningId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('ดาวน์โหลดไม่สำเร็จ — ลองเปิดในแท็บใหม่')
      openNewTab()
    }
  }, [downloadUrl, warningId, openNewTab])

  if (!open) return null

  const iframeScale = zoom / 100

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="ดูไฟล์ PDF ใบเตือน"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className={`flex flex-col bg-slate-900 border border-white/10 shadow-2xl overflow-hidden transition-all duration-200 ${
          fullscreen
            ? 'fixed inset-0 z-[90] rounded-none'
            : 'w-full sm:max-w-4xl max-h-[100dvh] sm:max-h-[92dvh] rounded-t-2xl sm:rounded-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 shrink-0 flex-wrap sm:flex-nowrap">
          <FileText className="w-4 h-4 text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{title ?? 'ใบเตือน PDF'}</p>
          </div>

          {/* Zoom controls — hidden on mobile (iframes don't zoom well there) */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 bg-white/[0.03]">
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.max(i - 1, 0))}
              disabled={zoomIdx === 0}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 touch-manipulation"
              title="ซูมออก (−)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-slate-300 w-10 text-center tabular-nums">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.min(i + 1, ZOOM_STEPS.length - 1))}
              disabled={zoomIdx === ZOOM_STEPS.length - 1}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 touch-manipulation"
              title="ซูมเข้า (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFullscreen((f) => !f)}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:bg-white/5 touch-manipulation"
            title="เต็มจอ"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={openNewTab}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:bg-white/5 touch-manipulation"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            แท็บใหม่
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 touch-manipulation"
          >
            <Download className="w-3.5 h-3.5" />
            ดาวน์โหลด
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 touch-manipulation"
            aria-label="ปิด"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile action bar */}
        <div className="sm:hidden flex gap-2 px-3 py-2 border-b border-white/5 shrink-0">
          <button type="button" onClick={openNewTab}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-slate-200 touch-manipulation">
            เปิดแท็บใหม่
          </button>
          <button type="button" onClick={downloadPdf}
            className="flex-1 py-2.5 rounded-xl bg-blue-600/90 text-xs font-semibold text-white touch-manipulation">
            ดาวน์โหลด
          </button>
        </div>

        {/* PDF area */}
        <div className="relative flex-1 min-h-[55dvh] sm:min-h-[60vh] bg-slate-950 overflow-auto">
          {loading && !loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 z-10 pointer-events-none">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-xs">กำลังโหลด PDF...</p>
            </div>
          )}

          {loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-slate-300">เปิดตัวอย่างในเบราว์เซอร์นี้ไม่ได้</p>
              <p className="text-xs text-slate-500">กรุณาใช้ปุ่ม &quot;เปิดแท็บใหม่&quot; หรือ &quot;ดาวน์โหลด&quot;</p>
              <div className="flex flex-wrap gap-2 justify-center mt-1">
                <button type="button" onClick={openNewTab}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white">
                  เปิดแท็บใหม่
                </button>
                <button type="button" onClick={downloadPdf}
                  className="px-4 py-2 rounded-xl border border-white/10 text-sm text-slate-200">
                  ดาวน์โหลด
                </button>
              </div>
            </div>
          ) : (
            <div
              className="origin-top-left transition-transform duration-150"
              style={{
                transform: `scale(${iframeScale})`,
                width: `${100 / iframeScale}%`,
                height: `${100 / iframeScale}%`,
              }}
            >
              <iframe
                key={`${warningId}-${zoom}`}
                title={title ?? 'PDF preview'}
                src={viewUrl}
                className="absolute inset-0 h-full w-full border-0 bg-white"
                onLoad={() => setLoading(false)}
                onError={() => { setLoading(false); setLoadError(true) }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** ปุ่มเปิด PDF ใบเตือน — ใช้ในตาราง */
export function WarningPdfActions({
  warningId,
  label,
  compact = false,
}: {
  warningId: string
  label?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const viewUrl = warningPdfApiPath(warningId)

  return (
    <>
      <div className={`inline-flex items-center gap-1 ${compact ? '' : 'flex-wrap justify-center'}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 whitespace-nowrap touch-manipulation px-1 py-0.5"
          title="ดู PDF"
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
          ดู
        </button>
        <span className="text-slate-600">|</span>
        <button
          type="button"
          onClick={() => window.open(viewUrl, '_blank', 'noopener,noreferrer')}
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap touch-manipulation px-1 py-0.5"
          title="เปิดแท็บใหม่"
        >
          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
          {compact ? '' : 'แท็บ'}
        </button>
      </div>
      <WarningPdfViewer
        warningId={warningId}
        title={label}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
