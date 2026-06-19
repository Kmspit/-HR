import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import CaseDocumentsClient from './CaseDocumentsClient'

function resolveCloudName(): string {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  if (name) return name
  try {
    const url = process.env.CLOUDINARY_URL ?? ''
    if (url) {
      const u = new URL(url.replace(/^cloudinary:\/\//, 'https://'))
      if (u.hostname) return u.hostname
    }
  } catch {}
  return ''
}

export default async function CaseDocumentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <div className="flex flex-col min-h-0">
      <Topbar title="ศูนย์เอกสาร" subtitle="จัดการเอกสารคดีและกฎหมายทั้งหมด" />
      <CaseDocumentsClient
        userId={session.user.id}
        userName={session.user.name ?? ''}
        role={session.user.role}
        department={session.user.department ?? null}
        cloudName={resolveCloudName()}
      />
    </div>
  )
}
