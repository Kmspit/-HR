'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import { cn } from '@/lib/utils'
import { MANUAL_SECTION_TAB } from '@/lib/manual-sections'

const TABS = [
  { id: 'employee', label: 'พนักงานทั่วไป' },
  { id: 'hr', label: 'HR / Admin / Manager' },
] as const

type TabId = (typeof TABS)[number]['id']

type Section = { id: string; title: string; icon: string; steps: string[]; tab: TabId }

const SECTIONS: Section[] = [
  {
    id: 'attendance',
    tab: 'employee',
    title: 'การเช็คอิน / เช็คเอาท์',
    icon: '⏱️',
    steps: [
      'ไปที่เมนู ลงเวลางาน',
      'กด เช็คอิน เมื่อเริ่มงาน — ระบบบันทึก GPS และภาพถ่ายอัตโนมัติ',
      'กด พักเที่ยง / กลับจากพัก ตามลำดับ',
      'กด เช็คเอาท์ เมื่อเลิกงาน',
    ],
  },
  {
    id: 'leave',
    tab: 'employee',
    title: 'การขอลาหยุด',
    icon: '📅',
    steps: [
      'ไปที่เมนู ขอลาหยุด',
      'เลือกประเภทการลา กำหนดวันที่ และใส่เหตุผล',
      'กด ส่งคำขอ — ระบบแจ้งเตือนผู้อนุมัติทันที',
      'ติดตามสถานะในหน้าเดิม: รออนุมัติ / อนุมัติ / ปฏิเสธ',
    ],
  },
  {
    id: 'outside-work',
    tab: 'employee',
    title: 'งานนอกสถานที่',
    icon: '🚗',
    steps: [
      'ไปที่เมนู งานนอกสถานที่',
      'กรอกสถานที่ วัตถุประสงค์ และวันที่',
      'กด ส่งคำขอ — รอหัวหน้างาน/HR อนุมัติตามสายอนุมัติ',
    ],
  },
  {
    id: 'weekly-plan',
    tab: 'employee',
    title: 'แผนงานรายสัปดาห์',
    icon: '📆',
    steps: [
      'ไปที่เมนู แผนงานรายสัปดาห์',
      'กรอกแผนงานของสัปดาห์ถัดไป',
      'ส่งให้หัวหน้าอนุมัติก่อนวันเริ่มสัปดาห์',
    ],
  },
  {
    id: 'forgot-scan',
    tab: 'employee',
    title: 'แก้ไขเวลาลงงาน (ลืมสแกน)',
    icon: '🕐',
    steps: [
      'ไปที่เมนู แก้ไขเวลาลงงาน',
      'เลือกวันที่ ประเภทการสแกน และเวลาที่ถูกต้อง',
      'ใส่เหตุผล (และแนบหลักฐานถ้ามี) แล้วกดส่ง',
      'รอหัวหน้างานและ HR อนุมัติตามลำดับ',
    ],
  },
  {
    id: 'profile',
    tab: 'employee',
    title: 'โปรไฟล์และการตั้งค่าส่วนตัว',
    icon: '👤',
    steps: [
      'ไปที่เมนู โปรไฟล์ (มุมขวาบน)',
      'อัปโหลดรูปโปรไฟล์ แก้ไขเบอร์โทร และข้อมูลติดต่อ',
      'เชื่อมต่อ LINE OA เพื่อรับแจ้งเตือน',
      'เปลี่ยนรหัสผ่านได้จากแท็บความปลอดภัย',
    ],
  },
  {
    id: 'announcements',
    tab: 'employee',
    title: 'ประกาศบริษัท',
    icon: '📢',
    steps: [
      'ไปที่เมนู ประกาศ',
      'อ่านประกาศล่าสุด — กรองตามประเภทหรือเดือนได้',
      'HR/Admin สามารถสร้างและแก้ไขประกาศได้',
    ],
  },
  {
    id: 'payslip',
    tab: 'employee',
    title: 'การดูสลิปเงินเดือน',
    icon: '🧾',
    steps: [
      'ไปที่เมนู สลิปเงินเดือน',
      'เลือกเดือนที่ต้องการดู',
      'กด ดาวน์โหลด PDF เพื่อบันทึก',
    ],
  },
  {
    id: 'tasks',
    tab: 'employee',
    title: 'การดูงานที่ได้รับมอบหมาย',
    icon: '📋',
    steps: [
      'ไปที่เมนู มอบหมายงาน ในแถบด้านซ้าย',
      'กดแท็บ งานของฉัน เพื่อกรองเฉพาะงานที่คุณรับผิดชอบ',
      'กดชื่องานเพื่อดูรายละเอียด วันกำหนด และ Checklist',
    ],
  },
  {
    id: 'approval-center',
    tab: 'hr',
    title: 'การอนุมัติคำขอ',
    icon: '🗂️',
    steps: [
      'ไปที่เมนู ศูนย์อนุมัติ',
      'ดูรายการคำขอที่รออนุมัติ (ลา งานนอก แผนงาน ลืมสแกน)',
      'กด อนุมัติ หรือ ปฏิเสธ พร้อมใส่หมายเหตุ (ถ้ามี)',
      'ระบบส่งแจ้งเตือนกลับไปยังพนักงานอัตโนมัติ',
    ],
  },
  {
    id: 'payroll',
    tab: 'hr',
    title: 'การจัดการเงินเดือน',
    icon: '💰',
    steps: [
      'ไปที่เมนู เงินเดือน → เลือกรอบเงินเดือน',
      'ตรวจสอบชั่วโมงทำงาน OT และการขาด/ลา',
      'กด คำนวณ ตรวจสอบผลลัพธ์ แล้วกด ยืนยัน',
      'ระบบออกสลิปให้พนักงานแต่ละคนอัตโนมัติ',
    ],
  },
  {
    id: 'employees',
    tab: 'hr',
    title: 'การจัดการพนักงาน',
    icon: '👥',
    steps: [
      'ไปที่เมนู พนักงาน',
      'กด เพิ่มพนักงาน ใส่ข้อมูลส่วนตัว บทบาท และแผนก',
      'แก้ไขข้อมูลได้โดยกดที่แถวพนักงาน',
      'กำหนดสิทธิ์เข้าถึงระบบได้จากบทบาท (Role)',
    ],
  },
  {
    id: 'warnings',
    tab: 'hr',
    title: 'การออกใบเตือนพนักงาน',
    icon: '🔔',
    steps: [
      'ไปที่เมนู ใบเตือน → กด สร้างใบเตือน',
      'เลือกพนักงาน ประเภทความผิด และระดับโทษ',
      'ระบุรายละเอียดและวันที่ → กด บันทึก',
      'ระบบแจ้งเตือนพนักงานและบันทึกในประวัติอัตโนมัติ',
    ],
  },
  {
    id: 'reports',
    tab: 'hr',
    title: 'การดูรายงานรายเดือน',
    icon: '📈',
    steps: [
      'ไปที่เมนู รายงานรายเดือน',
      'เลือกเดือนและสาขาที่ต้องการดู',
      'ดูสรุปการลา OT และชั่วโมงทำงานรวม',
      'ส่งออกไฟล์ได้จากปุ่ม Export',
    ],
  },
  {
    id: 'cases',
    tab: 'hr',
    title: 'การจัดการ Case (คดีความ)',
    icon: '📁',
    steps: [
      'ไปที่เมนู คดีความ → กด สร้างคดีใหม่',
      'กรอกข้อมูลคดี คู่กรณี วันนัดศาล และมอบหมายทนายความ',
      'แนบเอกสารผ่านเมนู เอกสารคดี',
      'ติดตามสถานะผ่าน Timeline ของแต่ละคดี',
    ],
  },
]

function SectionCard({
  section,
  defaultOpen,
  highlighted,
}: {
  section: Section
  defaultOpen?: boolean
  highlighted?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  return (
    <div
      id={`manual-section-${section.id}`}
      className={cn(
        'rounded-xl border overflow-hidden scroll-mt-24 transition-shadow duration-300',
        highlighted
          ? 'border-green-400 dark:border-green-500/60 ring-2 ring-green-400/40 dark:ring-green-500/30'
          : 'border-slate-200 dark:border-white/[0.07]',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left bg-white dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
      >
        <span className="text-xl flex-shrink-0">{section.icon}</span>
        <span className="flex-1 text-[14px] font-semibold text-slate-800 dark:text-slate-100">
          {section.title}
        </span>
        <span
          className={cn(
            'text-slate-400 transition-transform duration-200 text-xs',
            open ? 'rotate-180' : '',
          )}
        >
          ▼
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-slate-50/60 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.05]">
          <ol className="space-y-2 mt-2">
            {section.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-[13.5px] text-slate-700 dark:text-slate-300 leading-snug">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 text-[11px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

export default function ManualClient() {
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get('section')?.trim() ?? ''
  const [activeTab, setActiveTab] = useState<TabId>('employee')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const scrolledRef = useRef(false)

  useEffect(() => {
    if (!sectionParam) return
    const tab = MANUAL_SECTION_TAB[sectionParam]
    if (tab) setActiveTab(tab)
    setHighlightId(sectionParam)
    scrolledRef.current = false
  }, [sectionParam])

  useEffect(() => {
    if (!sectionParam || scrolledRef.current) return
    const el = document.getElementById(`manual-section-${sectionParam}`)
    if (!el) return
    scrolledRef.current = true
    window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
    window.setTimeout(() => setHighlightId(null), 4000)
  }, [sectionParam, activeTab])

  const visible = SECTIONS.filter((s) => s.tab === activeTab)

  return (
    <div>
      <Topbar
        title="คู่มือการใช้งาน"
        subtitle="ขั้นตอนการใช้งานระบบสำหรับพนักงานและ HR"
        hideManual
      />

      <div className="px-5 py-5 md:px-6 md:py-6 max-w-3xl">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] mb-6 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150',
                activeTab === tab.id
                  ? 'bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {visible.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              defaultOpen={section.id === sectionParam}
              highlighted={highlightId === section.id}
            />
          ))}
        </div>

        <p className="mt-6 text-[12px] text-slate-400 dark:text-slate-600">
          หากพบปัญหาหรือต้องการความช่วยเหลือเพิ่มเติม กรุณาติดต่อ HR หรือ Admin ขององค์กร
        </p>
      </div>
    </div>
  )
}
