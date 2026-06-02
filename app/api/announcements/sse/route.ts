import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { announcementEmitter } from '@/lib/announcement-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = session.user.id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (line: string) => {
        try { controller.enqueue(encoder.encode(line)) } catch {}
      }

      const onAnnouncement = (data: unknown) => {
        enqueue(`event: announcement\ndata: ${JSON.stringify(data)}\n\n`)
      }

      const onNotification = (data: { userId: string; count: number }) => {
        if (data.userId !== userId) return
        enqueue(`event: notification\ndata: ${JSON.stringify({ count: data.count })}\n\n`)
      }

      enqueue(`: connected\n\n`)

      const heartbeat = setInterval(() => {
        enqueue(`: ping\n\n`)
      }, 25000)

      announcementEmitter.on('new-announcement', onAnnouncement)
      announcementEmitter.on('notification-count', onNotification)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        announcementEmitter.off('new-announcement', onAnnouncement)
        announcementEmitter.off('notification-count', onNotification)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
