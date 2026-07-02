'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlusSquare, Share2, Smartphone } from 'lucide-react'
import { isAndroid, isIosDevice, isIosSafari, isStandalone } from '@/lib/pwa-client'

type Platform = 'ios' | 'android' | 'other'

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-600 dark:bg-green-500/20 dark:text-green-400">
      {n}
    </span>
  )
}

function IosShareMock() {
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-100 to-slate-50 p-4 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-[200px] rounded-2xl border border-slate-300 bg-white p-2 shadow-md dark:border-slate-600 dark:bg-slate-950">
        <div className="mb-2 h-24 rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="flex items-center justify-around border-t border-slate-200 pt-2 dark:border-slate-700">
          <div className="h-6 w-6 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="flex flex-col items-center gap-0.5">
            <Share2 className="h-5 w-5 text-green-500" />
            <span className="text-[8px] font-medium text-green-500">Share</span>
          </div>
          <div className="h-6 w-6 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  )
}

function IosAddHomeMock() {
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-100 to-slate-50 p-4 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-[220px] rounded-xl border border-slate-300 bg-white p-3 shadow-md dark:border-slate-600 dark:bg-slate-950">
        <p className="mb-2 text-[10px] font-semibold text-slate-500">Share Sheet</p>
        <div className="space-y-1.5">
          <div className="h-7 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-2 py-2 dark:bg-green-500/10">
            <PlusSquare className="h-4 w-4 text-green-600" />
            <span className="text-[11px] font-medium text-slate-800 dark:text-slate-100">
              Add to Home Screen
            </span>
          </div>
          <div className="h-7 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  )
}

function AndroidInstallMock() {
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-100 to-slate-50 p-4 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-[220px] rounded-xl border border-slate-300 bg-white p-3 shadow-md dark:border-slate-600 dark:bg-slate-950">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500 text-[10px] font-bold text-white">
            KM
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-900 dark:text-white">KM HR</p>
            <p className="text-[9px] text-slate-500">hrflow-app</p>
          </div>
        </div>
        <div className="rounded-lg bg-green-500 py-2 text-center text-[11px] font-medium text-white">
          ติดตั้งแอพ
        </div>
      </div>
    </div>
  )
}

const IOS_STEPS = [
  {
    title: 'กดปุ่ม Share',
    body: 'กดไอคอน Share (ลูกศรชี้ขึ้น) ที่แถบด้านล่าง Safari',
    visual: <IosShareMock />,
  },
  {
    title: 'Add to Home Screen',
    body: 'เลื่อนรายการลง แล้วแตะ "Add to Home Screen"',
    visual: <IosAddHomeMock />,
  },
  {
    title: 'กด Add',
    body: 'ตรวจชื่อแอพ "KM HR" แล้วกด Add มุมขวาบน',
    visual: (
      <div className="flex justify-center rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500 text-lg font-bold text-white shadow-lg">
            KM
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">KM HR</p>
          <p className="text-xs text-green-600 dark:text-green-400">✓ พร้อมใช้งานบนหน้าจอหลัก</p>
        </div>
      </div>
    ),
  },
] as const

const ANDROID_STEPS = [
  {
    title: 'เปิดด้วย Chrome',
    body: 'ใช้ Google Chrome บน Android (แนะนำ)',
    visual: <AndroidInstallMock />,
  },
  {
    title: 'ติดตั้งแอพ',
    body: 'กดเมนู ⋮ แล้วเลือก "ติดตั้งแอพ" หรือ "Add to Home screen" — หรือกด banner ติดตั้งที่เด้งขึ้น',
    visual: <AndroidInstallMock />,
  },
  {
    title: 'เปิดจากหน้าจอหลัก',
    body: 'ไอคอน KM HR จะอยู่บนหน้าจอหลัก — เปิดได้ทันทีโดยไม่ต้องพิมพ์ URL',
    visual: (
      <div className="flex justify-center rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500 text-lg font-bold text-white shadow-lg">
            KM
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">KM HR</p>
        </div>
      </div>
    ),
  },
] as const

export default function InstallGuideClient() {
  const [platform, setPlatform] = useState<Platform>('other')
  const [installed, setInstalled] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setInstalled(isStandalone())
    if (isIosDevice()) setPlatform('ios')
    else if (isAndroid()) setPlatform('android')
    else setPlatform('other')
    setOrigin(window.location.origin)
  }, [])

  const steps = platform === 'android' ? ANDROID_STEPS : IOS_STEPS

  return (
    <div className="min-h-[100dvh] bg-[#070b14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full bg-green-600/20 blur-3xl" />
        <div className="absolute -right-20 bottom-20 h-64 w-64 rounded-full bg-indigo-600/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-lg px-4 py-8 pb-12">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500 text-xl font-bold text-white shadow-lg shadow-green-500/30">
            KM
          </div>
          <h1 className="text-2xl font-bold text-white">ติดตั้งแอพ KM HR</h1>
          <p className="mt-2 text-sm text-slate-400">
            เค เอ็ม เซอร์วิสพลัส — เช็คอิน ลา ดูสลิป ได้จากหน้าจอหลัก
          </p>
        </header>

        {installed ? (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center text-sm text-green-300">
            ✓ คุณเปิดแอพจากหน้าจอหลักอยู่แล้ว
          </div>
        ) : null}

        <div className="mb-6 flex gap-2 rounded-xl bg-slate-900/80 p-1">
          {(['ios', 'android'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                platform === p
                  ? 'bg-green-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p === 'ios' ? 'iPhone / iPad' : 'Android'}
            </button>
          ))}
        </div>

        {platform === 'ios' && !isIosSafari() && isIosDevice() && !installed ? (
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            แนะนำเปิดลิงก์นี้ใน <strong>Safari</strong> (ไม่ใช่ Chrome หรือ LINE) เพื่อติดตั้งได้
          </p>
        ) : null}

        <div className="space-y-6">
          {steps.map((step, i) => (
            <section
              key={step.title}
              className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
            >
              <div className="flex items-start gap-3 p-4">
                <StepBadge n={i + 1} />
                <div>
                  <h2 className="font-semibold text-white">{step.title}</h2>
                  <p className="mt-1 text-sm text-slate-400">{step.body}</p>
                </div>
              </div>
              <div className="border-t border-slate-800 px-4 pb-4 pt-3">{step.visual}</div>
            </section>
          ))}
        </div>

        <div className="mt-8 space-y-3">
          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-500/25 hover:bg-green-600"
          >
            <Smartphone className="h-4 w-4" />
            เปิดแอพ
          </Link>
          <Link
            href="/login"
            className="block w-full py-2 text-center text-sm text-slate-500 hover:text-slate-300"
          >
            เข้าสู่ระบบ
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          แชร์ลิงก์นี้ให้เพื่อนร่วมงาน:{' '}
          <span className="text-slate-400">{origin || '…'}/install</span>
        </p>
      </div>
    </div>
  )
}
