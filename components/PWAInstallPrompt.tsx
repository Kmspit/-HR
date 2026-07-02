'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'

const DISMISS_KEY = 'pwa-install-dismissed-until'
const DISMISS_DAYS = 14

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY)
    if (!until) return false
    return Date.now() < Number(until)
  } catch {
    return false
  }
}

function dismissForLater() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000))
  } catch {
    /* ignore */
  }
}

export default function PWAInstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [iosMode, setIosMode] = useState(false)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (isStandalone() || isDismissed()) return

    if (isIos()) {
      setIosMode(true)
      setVisible(true)
      return
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const close = useCallback(() => {
    dismissForLater()
    setVisible(false)
  }, [])

  const install = useCallback(async () => {
    if (!installEvent) return
    setInstalling(true)
    try {
      await installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      if (outcome === 'accepted') setVisible(false)
    } catch {
      /* user dismissed native prompt */
    } finally {
      setInstalling(false)
    }
  }, [installEvent])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="ติดตั้งแอพ"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[60] md:bottom-4 md:left-auto md:right-4 md:max-w-sm"
    >
      <div className="rounded-xl border border-blue-500/30 bg-white p-4 shadow-xl dark:border-blue-400/25 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-sm font-bold text-white">
            KM
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">เพิ่มแอพลงหน้าจอหลัก</p>
            {iosMode ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                กด <Share2 className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden /> Share แล้วเลือก{' '}
                <strong>Add to Home Screen</strong>
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                ติดตั้ง KM HR เพื่อเข้าใช้งานได้เร็วขึ้น แม้ออฟไลน์บางส่วน
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!iosMode && installEvent && (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {installing ? 'กำลังติดตั้ง…' : 'ติดตั้งแอพ'}
          </button>
        )}
      </div>
    </div>
  )
}
