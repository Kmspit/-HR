'use client'

import Link from 'next/link'
import { Building2 } from 'lucide-react'

export default function OrgSetupBanner() {
  return (
    <div
      className="mx-4 mt-3 md:mx-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
      role="status"
    >
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <Building2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed">
          บัญชีของคุณยังไม่ได้รับการกำหนดฝ่าย/แผนก — ใช้งานเช็คอินและเมนูพื้นฐานได้
          กรุณาติดต่อ HR เพื่อกำหนดโครงสร้างองค์กรให้ครบ
        </p>
      </div>
      <Link
        href="/profile"
        className="shrink-0 text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2"
      >
        ดูโปรไฟล์
      </Link>
    </div>
  )
}
