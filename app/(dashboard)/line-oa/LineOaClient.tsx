'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Bot, MessageCircle, Settings2, Zap } from 'lucide-react'
import LineHrSendPanel from '@/components/line/LineHrSendPanel'
import Link from 'next/link'
import { toast } from 'sonner'

type Tab = 'send' | 'auto' | 'settings' | 'help'

type LineNotifSettings = {
  muteWeekend: boolean
  muteAfterHours: boolean
  muteStart: string
  muteEnd: string
  mutedTypes: string[]
}

const MUTE_TYPE_OPTIONS = [
  { value: 'APPROVAL',       label: 'คำขออนุมัติ' },
  { value: 'TASK_ASSIGNED',  label: 'งานใหม่' },
  { value: 'TASK_DEADLINE',  label: 'ใกล้ครบกำหนด' },
  { value: 'TASK_OVERDUE',   label: 'งานเกินกำหนด' },
  { value: 'CALENDAR',       label: 'นัดหมาย' },
  { value: 'DAILY_SUMMARY',  label: 'สรุปประจำวัน (CEO)' },
]

function AutoTab() {
  return (
    <div className="space-y-4">
      <p className="text-xs dark:text-slate-400">
        Phase 14 — ระบบส่งแจ้งเตือนและรับคำสั่งผ่าน LINE OA อัตโนมัติ
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { icon: '✅', title: 'อนุมัติผ่าน LINE', desc: 'ลา, เบิก, นอกสถานที่ — กดปุ่มได้ทันที' },
          { icon: '📋', title: 'แจ้งงานใหม่',     desc: 'รับการแจ้งเตือนเมื่อได้รับมอบหมายงาน' },
          { icon: '⏰', title: 'เตือนครบกำหนด',  desc: 'แจ้ง 7/3/1 วันก่อนถึงกำหนด' },
          { icon: '⚖️', title: 'เตือนนัดศาล',    desc: 'แจ้งเตือนก่อนวันนัดศาลและนัดหมาย' },
          { icon: '📊', title: 'สรุป CEO ทุกวัน', desc: 'ส่งสรุปงาน 09:00 น. ทุกวันให้ CEO' },
          { icon: '🤖', title: 'AI ผู้ช่วย LINE', desc: 'พิมพ์คำถามใดก็ได้ — AI ตอบด้วยข้อมูลจริง' },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border dark:border-white/10 light:border-slate-200 p-3 flex gap-3 items-start"
          >
            <span className="text-xl">{f.icon}</span>
            <div>
              <p className="text-sm font-semibold dark:text-white">{f.title}</p>
              <p className="text-xs dark:text-slate-400 mt-0.5">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border dark:border-white/10 bg-green-500/5 p-4 text-xs dark:text-slate-300 space-y-1.5">
        <p className="font-semibold dark:text-white">💬 คำสั่ง self-service ที่รองรับ:</p>
        {[
          ['งานวันนี้', 'งานที่กำหนดวันนี้'],
          ['งานค้าง', 'งานเกินกำหนด'],
          ['วันลาคงเหลือ', 'ยอดวันลาปีปัจจุบัน'],
          ['ประวัติลา', '5 คำขอล่าสุด'],
          ['นัดวันนี้', 'นัดหมายและนัดศาลวันนี้'],
          ['สรุป', 'สรุปงาน (CEO/ผู้จัดการ)'],
        ].map(([cmd, desc]) => (
          <div key={cmd} className="flex gap-2">
            <code className="bg-black/20 px-1.5 py-0.5 rounded text-green-400 text-xs">{cmd}</code>
            <span>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsTab() {
  const [settings, setSettings] = useState<LineNotifSettings>({
    muteWeekend: false,
    muteAfterHours: false,
    muteStart: '21:00',
    muteEnd: '08:00',
    mutedTypes: [],
  })
  const [linked, setLinked] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/line/notification-settings')
      .then(r => r.json())
      .then((data: { settings: LineNotifSettings; linked: boolean }) => {
        setSettings(data.settings)
        setLinked(data.linked)
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/line/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success('บันทึกการตั้งค่าแล้ว')
      } else {
        toast.error('บันทึกไม่สำเร็จ')
      }
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const toggleMuteType = (type: string) => {
    setSettings(s => ({
      ...s,
      mutedTypes: s.mutedTypes.includes(type)
        ? s.mutedTypes.filter(t => t !== type)
        : [...s.mutedTypes, type],
    }))
  }

  if (!linked) {
    return (
      <p className="text-sm dark:text-slate-400 text-center py-6">
        ผูก LINE OA ก่อนเพื่อตั้งค่าการแจ้งเตือน —{' '}
        <Link href="/profile" className="text-green-400 underline">ไปที่โปรไฟล์</Link>
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-xs font-semibold dark:text-white uppercase tracking-wide">เวลาปิดเสียง</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.muteWeekend}
            onChange={e => setSettings(s => ({ ...s, muteWeekend: e.target.checked }))}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm dark:text-slate-300">ปิดเสียงวันหยุดสุดสัปดาห์</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.muteAfterHours}
            onChange={e => setSettings(s => ({ ...s, muteAfterHours: e.target.checked }))}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm dark:text-slate-300">ปิดเสียงนอกเวลางาน</span>
        </label>
        {settings.muteAfterHours && (
          <div className="flex items-center gap-3 ml-7">
            <div>
              <label htmlFor="field-1" className="text-xs dark:text-slate-400">เริ่ม</label>
              <input id="field-1"
                type="time"
                value={settings.muteStart}
                onChange={e => setSettings(s => ({ ...s, muteStart: e.target.value }))}
                className="ml-2 text-xs rounded border dark:border-white/10 dark:bg-white/5 px-2 py-1"
              />
            </div>
            <div>
              <label htmlFor="field-2" className="text-xs dark:text-slate-400">สิ้นสุด</label>
              <input id="field-2"
                type="time"
                value={settings.muteEnd}
                onChange={e => setSettings(s => ({ ...s, muteEnd: e.target.value }))}
                className="ml-2 text-xs rounded border dark:border-white/10 dark:bg-white/5 px-2 py-1"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold dark:text-white uppercase tracking-wide">ปิดการแจ้งเตือนบางประเภท</p>
        <div className="grid grid-cols-2 gap-2">
          {MUTE_TYPE_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm dark:text-slate-300">
              <input
                type="checkbox"
                checked={settings.mutedTypes.includes(opt.value)}
                onChange={() => toggleMuteType(opt.value)}
                className="w-4 h-4 rounded"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 transition"
      >
        {saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
      </button>
    </div>
  )
}

export default function LineOaClient() {
  const searchParams = useSearchParams()
  const preselectUserId = searchParams.get('userId') ?? undefined
  const [tab, setTab] = useState<Tab>('send')

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'send',     label: 'ส่งข้อความ', icon: <MessageCircle className="w-3.5 h-3.5" /> },
    { id: 'auto',     label: 'อัตโนมัติ',  icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'ตั้งค่า',    icon: <Bot className="w-3.5 h-3.5" /> },
    { id: 'help',     label: 'วิธีใช้',    icon: <Settings2 className="w-3.5 h-3.5" /> },
  ]

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
              อนุมัติงาน · บริการตนเอง · AI ผู้ช่วย · แจ้งเตือนอัตโนมัติ
            </p>
          </div>
        </div>
      </div>

      <div className="flex rounded-xl border dark:border-white/10 light:border-slate-200 overflow-hidden">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
              tab === t.id
                ? 'bg-green-600 text-white'
                : 'dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-4 md:p-5">
        {tab === 'send' && <LineHrSendPanel initialUserId={preselectUserId} />}
        {tab === 'auto' && <AutoTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'help' && (
          <ol className="text-sm dark:text-slate-300 space-y-3 list-decimal list-inside leading-relaxed">
            <li>
              ตั้งค่า Token ที่{' '}
              <Link href="/settings" className="text-green-400 hover:underline">
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
              <Link href="/warnings" className="text-green-400 hover:underline">
                ใบเตือน
              </Link>{' '}
              — ติ๊กส่งทันที หรือกดปุ่ม ส่งใหม่ไป LINE
            </li>
            <li>Phase 14: ผู้จัดการ/HR รับคำขออนุมัติพร้อมปุ่ม ✅❌ ใน LINE โดยตรง</li>
          </ol>
        )}
      </div>
    </div>
  )
}
