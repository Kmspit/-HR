'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Download, Share2, X } from 'lucide-react'
import {
  dismissPwaPrompt,
  isIosSafari,
  isPwaDismissed,
  isStandalone,
} from '@/lib/pwa-client'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [iosMode, setIosMode] = useState(false)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (pathname === '/install') return
    if (isStandalone() || isPwaDismissed()) return

    if (isIosSafari()) {
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
  }, [pathname])

  const close = useCallback(() => {
    dismissPwaPrompt()
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

  if (iosMode) {
    return (
      <>
        <button
          type="button"
          aria-label="ปิด"
          className="fixed inset-0 z-[59] bg-black/40 backdrop-blur-[2px]"
          onClick={close}
        />
        <div
          role="dialog"
          aria-label="วิธีติดตั้งแอพบน iOS"
          className="fixed bottom-0 inset-x-0 z-[60] rounded-t-2xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="mb-4 flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-50">
              📱 ติดตั้งแอพลงมือถือ
            </h3>
            <button
              type="button"
              onClick={close}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="ปิด"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500 text-xl font-bold text-white shadow-lg shadow-green-500/30">
              KM
            </div>
          </div>

          <ol className="space-y-3 text-gray-700 dark:text-slate-300">
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-600 dark:bg-green-500/20 dark:text-green-400">
                1
              </span>
              <span className="pt-0.5 text-sm leading-relaxed">
                กดปุ่ม{' '}
                <span className="inline-flex items-center gap-1 font-medium text-gray-900 dark:text-white">
                  Share <Share2 className="h-4 w-4 text-green-500" aria-hidden />
                </span>{' '}
                ด้านล่างหน้าจอ Safari
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-600 dark:bg-green-500/20 dark:text-green-400">
                2
              </span>
              <span className="pt-0.5 text-sm leading-relaxed">
                เลื่อนลงแล้วเลือก <strong>&quot;Add to Home Screen&quot;</strong>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-600 dark:bg-green-500/20 dark:text-green-400">
                3
              </span>
              <span className="pt-0.5 text-sm leading-relaxed">
                กด <strong>&quot;Add&quot;</strong> มุมขวาบน
              </span>
            </li>
          </ol>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
              <div className="flex gap-4 text-green-500">
                <Share2 className="h-5 w-5" aria-hidden />
              </div>
              <div className="h-1 flex-1 mx-3 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="text-[10px] text-slate-400">Safari</div>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              ปุ่ม Share อยู่กลางแถบด้านล่าง (ไอคอนลูกศรชี้ขึ้น)
            </p>
          </div>

          <button
            type="button"
            onClick={close}
            className="mt-4 w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ปิด — แสดงอีกครั้งใน 7 วัน
          </button>
        </div>
      </>
    )
  }

  return (
    <div
      role="dialog"
      aria-label="ติดตั้งแอพ"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[60] md:bottom-4 md:left-auto md:right-4 md:max-w-sm"
    >
      <div className="rounded-xl border border-green-500/30 bg-white p-4 shadow-xl dark:border-green-400/25 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500 text-sm font-bold text-white">
            KM
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">เพิ่มแอพลงหน้าจอหลัก</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              ติดตั้ง KM HR เพื่อเข้าใช้งานได้เร็วขึ้น แม้ออฟไลน์บางส่วน
            </p>
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

        {installEvent && (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {installing ? 'กำลังติดตั้ง…' : 'ติดตั้งแอพ'}
          </button>
        )}
      </div>
    </div>
  )
}
