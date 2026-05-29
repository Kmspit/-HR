'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MessageCircle, Settings2 } from 'lucide-react'
import LineHrSendPanel from '@/components/line/LineHrSendPanel'
import Link from 'next/link'

type Tab = 'send' | 'help'

export default function LineOaClient() {
  const searchParams = useSearchParams()
  const preselectUserId = searchParams.get('userId') ?? undefined
  const [tab, setTab] = useState<Tab>('send')

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-5">
      <div className="glass-card rounded-2xl p-4 md:p-5 border border-green-500/15">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#06C755]/20 text-2xl">
            💬
          </div>
          <div>
            <h1 className="text-lg font-bold dark:text-white light:text-slate-900">
              LINE Official Account
            </h1>
            <p className="text-xs dark:text-slate-400 mt-0.5">
              HR ส่งข้อความถึงพนักงานที่ผูกบัญชี LINE แล้ว — ใบเตือนส่งอัตโนมัติจากหน้าใบเตือน
            </p>
          </div>
        </div>
      </div>

      <div className="flex rounded-xl border dark:border-white/10 light:border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setTab('send')}
          className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-semibold transition ${
            tab === 'send'
              ? 'bg-blue-600 text-white'
              : 'dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          ส่งข้อความ
        </button>
        <button
          type="button"
          onClick={() => setTab('help')}
          className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-semibold transition ${
            tab === 'help'
              ? 'bg-blue-600 text-white'
              : 'dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <Settings2 className="w-4 h-4" />
          วิธีใช้
        </button>
      </div>

      <div className="glass-card rounded-2xl p-4 md:p-5">
        {tab === 'send' ? (
          <LineHrSendPanel initialUserId={preselectUserId} />
        ) : (
          <ol className="text-sm dark:text-slate-300 space-y-3 list-decimal list-inside leading-relaxed">
            <li>
              ตั้งค่า Token ที่{' '}
              <Link href="/settings" className="text-blue-400 hover:underline">
                ตั้งค่าบริษัท
              </Link>{' '}
              หรือ Vercel Environment (โปรเจกต์ hrprogramkm)
            </li>
            <li>
              ใน LINE Developers ตั้ง Webhook URL ตามที่แสดงในแท็บส่งข้อความ → Verify
            </li>
            <li>พนักงาน: โปรไฟล์ → สร้างรหัส → ส่ง &quot;ลิงก์ XXXXXX&quot; ในแชท OA</li>
            <li>HR: เลือกพนักงาน → พิมพ์ข้อความ → กด ส่งเข้า LINE</li>
            <li>
              ใบเตือน: หน้า{' '}
              <Link href="/warnings" className="text-blue-400 hover:underline">
                ใบเตือน
              </Link>{' '}
              — ติ๊กส่งทันที หรือกดปุ่ม ส่งใหม่ไป LINE
            </li>
          </ol>
        )}
      </div>
    </div>
  )
}
