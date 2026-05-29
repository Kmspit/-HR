import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Topbar from '@/components/dashboard/Topbar'
import LineOaClient from './LineOaClient'

export default async function LineOaPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    redirect('/dashboard')
  }

  return (
    <>
      <Topbar title="LINE OA" subtitle="ส่งข้อความและสถานะการเชื่อมต่อ" />
      <Suspense fallback={<div className="p-6 text-sm text-slate-500">กำลังโหลด...</div>}>
        <LineOaClient />
      </Suspense>
    </>
  )
}
