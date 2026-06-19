'use client'

import { useState } from 'react'
import Topbar from '@/components/dashboard/Topbar'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'employee', label: 'พนักงานทั่วไป' },
  { id: 'hr', label: 'HR / Admin / Manager' },
] as const

type TabId = (typeof TABS)[number]['id']

type Section = { title: string; icon: string; steps: string[] }

const EMPLOYEE_SECTIONS: Section[] = [
  {
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
    title: 'การดูงานที่ได้รับมอบหมาย',
    icon: '📋',
    steps: [
      'ไปที่เมนู มอบหมายงาน ในแถบด้านซ้าย',
      'กดแท็บ งานของฉัน เพื่อกรองเฉพาะงานที่คุณรับผิดชอบ',
      'กดชื่องานเพื่อดูรายละเอียด วันกำหนด และ Checklist',
    ],
  },
  {
    title: 'การตรวจสอบความคืบหน้า',
    icon: '📊',
    steps: [
      'เปิดรายละเอียดงานที่ต้องการตรวจสอบ',
      'ดู Progress bar แสดงร้อยละความสำเร็จ',
      'ติ๊กถูกที่ Subtask/Checklist แต่ละข้อเมื่อทำเสร็จ',
    ],
  },
  {
    title: 'การส่ง Comment',
    icon: '💬',
    steps: [
      'เปิดรายละเอียดงาน → เลื่อนลงไปที่กล่อง แสดงความคิดเห็น',
      'พิมพ์ข้อความและกด ส่ง',
      'สามารถแนบไฟล์หรือรูปประกอบได้',
    ],
  },
  {
    title: 'การดู Timeline',
    icon: '🕒',
    steps: [
      'เปิดรายละเอียดงาน → กดแท็บ Timeline',
      'ดูประวัติการเปลี่ยนแปลงสถานะทั้งหมดพร้อมวันที่และผู้ดำเนินการ',
    ],
  },
  {
    title: 'การขอลาหยุด',
    icon: '📅',
    steps: [
      'ไปที่เมนู ขอลาหยุด',
      'เลือกประเภทการลา กำหนดวันที่ และใส่เหตุผล',
      'กด ส่งคำขอ — ระบบแจ้งเตือน HR ทันที',
      'ติดตามสถานะในหน้าเดิม: รออนุมัติ / อนุมัติ / ปฏิเสธ',
    ],
  },
  {
    title: 'การดูสลิปเงินเดือน',
    icon: '🧾',
    steps: [
      'ไปที่เมนู สลิปเงินเดือน',
      'เลือกเดือนที่ต้องการดู',
      'กด ดาวน์โหลด PDF เพื่อบันทึก',
    ],
  },
]

const HR_SECTIONS: Section[] = [
  {
    title: 'การมอบหมายงาน',
    icon: '✅',
    steps: [
      'ไปที่เมนู มอบหมายงาน → กด สร้างงานใหม่',
      'ใส่ชื่องาน วันกำหนด ระดับความสำคัญ และเลือกผู้รับผิดชอบ',
      'เพิ่ม Subtask/Checklist ตามต้องการ',
      'กด บันทึก — ระบบส่งแจ้งเตือนผู้รับงานทันที',
    ],
  },
  {
    title: 'CEO Command Center / Executive Dashboard',
    icon: '📊',
    steps: [
      'ไปที่เมนู CEO Command Center (เฉพาะ CEO, SUPER_ADMIN, HR)',
      'ดูภาพรวมองค์กร: พนักงานออนไลน์ งานค้าง สถานะคดี',
      'กรองข้อมูลตามแผนก ช่วงเวลา หรือประเภทงาน',
    ],
  },
  {
    title: 'การจัดการ Case (คดีความ)',
    icon: '📁',
    steps: [
      'ไปที่เมนู คดีความ → กด สร้างคดีใหม่',
      'กรอกข้อมูลคดี คู่กรณี วันนัดศาล และมอบหมายทนายความ',
      'แนบเอกสารผ่านเมนู เอกสารคดี',
      'ติดตามสถานะผ่านแท็บ Timeline ของแต่ละคดี',
    ],
  },
  {
    title: 'การอนุมัติคำขอลา',
    icon: '🗂️',
    steps: [
      'ไปที่เมนู ศูนย์อนุมัติ หรือ อนุมัติ',
      'ดูรายการคำขอที่รออนุมัติ',
      'กด อนุมัติ หรือ ปฏิเสธ พร้อมใส่หมายเหตุ (ถ้ามี)',
      'ระบบส่งแจ้งเตือนกลับไปยังพนักงานอัตโนมัติ',
    ],
  },
  {
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
    title: 'การดูตำแหน่ง GPS พนักงาน',
    icon: '📍',
    steps: [
      'ไปที่เมนู ลงเวลางาน → กดแท็บ GPS / แผนที่',
      'ดูตำแหน่งเช็คอิน/เช็คเอาท์ของพนักงานแต่ละคน',
      'กรองตามวันที่หรือสาขา',
    ],
  },
  {
    title: 'การจัดการพนักงาน',
    icon: '👥',
    steps: [
      'ไปที่เมนู พนักงาน',
      'กด เพิ่มพนักงาน ใส่ข้อมูลส่วนตัว บทบาท และแผนก',
      'แก้ไขข้อมูลได้โดยกด ⋮ ที่แถวพนักงาน',
      'กำหนดสิทธิ์เข้าถึงระบบได้จากแท็บ บทบาท',
    ],
  },
  {
    title: 'การจัดการเงินเดือน',
    icon: '💰',
    steps: [
      'ไปที่เมนู เงินเดือน → เลือกรอบเงินเดือน',
      'ตรวจสอบชั่วโมงทำงาน OT และการขาด/ลา',
      'กด คำนวณ ตรวจสอบผลลัพธ์ แล้วกด ยืนยัน',
      'ระบบออกสลิปให้พนักงานแต่ละคนอัตโนมัติ',
    ],
  },
]

function SectionCard({ section }: { section: Section }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left
          bg-white dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
      >
        <span className="text-xl flex-shrink-0">{section.icon}</span>
        <span className="flex-1 text-[14px] font-semibold text-slate-800 dark:text-slate-100">
          {section.title}
        </span>
        <span className={cn(
          'text-slate-400 transition-transform duration-200 text-xs',
          open ? 'rotate-180' : '',
        )}>▼</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-slate-50/60 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.05]">
          <ol className="space-y-2 mt-2">
            {section.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-[13.5px] text-slate-700 dark:text-slate-300 leading-snug">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 text-[11px] font-bold mt-0.5">
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

export default function ManualPage() {
  const [activeTab, setActiveTab] = useState<TabId>('employee')
  const sections = activeTab === 'employee' ? EMPLOYEE_SECTIONS : HR_SECTIONS

  return (
    <div>
      <Topbar
        title="คู่มือการใช้งาน"
        subtitle="ขั้นตอนการใช้งานระบบสำหรับพนักงานและ HR"
      />

      <div className="px-5 py-5 md:px-6 md:py-6 max-w-3xl">
        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] mb-6 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
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

        {/* Section cards */}
        <div className="space-y-2">
          {sections.map(section => (
            <SectionCard key={section.title} section={section} />
          ))}
        </div>

        <p className="mt-6 text-[12px] text-slate-400 dark:text-slate-600">
          หากพบปัญหาหรือต้องการความช่วยเหลือเพิ่มเติม กรุณาติดต่อ HR หรือ Admin ขององค์กร
        </p>
      </div>
    </div>
  )
}
