import { redirect } from 'next/navigation'

// AI Assistant temporarily disabled — restore the full implementation below to re-enable:
// import { auth } from '@/lib/auth'
// import AiAssistantClient from '@/app/(dashboard)/ai-assistant/AiAssistantClient'
// export const metadata = { title: 'AI Assistant — Client Portal' }

export default async function ClientAiPage() {
  redirect('/client-portal')
}

/* Full implementation — restore when re-enabling:
export default async function ClientAiPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'CLIENT') redirect('/ai-assistant')
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 font-sans">
      <div className="pt-4">
        <div className="max-w-4xl mx-auto px-4 mb-2">
          <a href="/client-portal" className="text-sm text-blue-600 hover:underline">← กลับ Client Portal</a>
        </div>
        <AiAssistantClient
          userId={session.user.id}
          userName={session.user.name ?? ''}
          userRole={session.user.role as string}
        />
      </div>
    </div>
  )
}
*/
