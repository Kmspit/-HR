'use client'

import { useRouter } from 'next/navigation'

interface Props {
  isClientPortal?: boolean
}

export default function AiFloatingButton({ isClientPortal = false }: Props) {
  const router = useRouter()
  const target = isClientPortal ? '/client-portal/ai' : '/ai-assistant'

  return (
    <button
      onClick={() => router.push(target)}
      title="AI Assistant"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <line x1="9" y1="10" x2="15" y2="10" />
        <line x1="9" y1="14" x2="13" y2="14" />
      </svg>
    </button>
  )
}
