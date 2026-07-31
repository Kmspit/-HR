import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { announcementEmitter } from '@/lib/announcement-events'
import { ANNOUNCEMENT_EDITOR_ROLES } from '@/lib/access-control'
import { matchesAnnouncementTargeting } from '@/lib/announcement-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (session.user.role === 'CLIENT') {
    return new Response('Forbidden', { status: 403 })
  }

  const userId = session.user.id
  const isHR = ANNOUNCEMENT_EDITOR_ROLES.includes(session.user.role)
  // Resolved once per connection, not per event — targeting by BRANCH/DIVISION/etc
  // needs the user's org fields, which don't change mid-session.
  const orgFields = isHR ? null : await prisma.user.findUnique({
    where: { id: userId },
    select: { branchId: true, divisionId: true, departmentId: true, sectionId: true },
  })
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (line: string) => {
        try { controller.enqueue(encoder.encode(line)) } catch {}
      }

      const onAnnouncement = (data: Record<string, unknown>) => {
        // Deletions carry no content (just an id) — safe to forward unfiltered.
        // Everything else carries full title/body/targeting, so it must pass the
        // same visibility check as the REST list route before this connection
        // ever sees it — HR/editor roles see everything, same as the list route.
        if (!data._deleted && !isHR) {
          const visible = matchesAnnouncementTargeting(
            data.targetType as string,
            (data.targetIds as string[] | undefined) ?? [],
            userId,
            orgFields,
          )
          if (!visible) return
        }
        enqueue(`event: announcement\ndata: ${JSON.stringify(data)}\n\n`)
      }

      // Notification count/item push used to go out on this same connection
      // (events 'notification'/'new-notification') — replaced by polling
      // (lib/notification-center/poll.ts) since the in-process emitter this
      // route reads from can't be reached by a write handled on a different
      // serverless instance. Only the announcement channel still uses SSE.

      enqueue(`: connected\n\n`)

      const heartbeat = setInterval(() => {
        enqueue(`: ping\n\n`)
      }, 25000)

      announcementEmitter.on('new-announcement', onAnnouncement)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        announcementEmitter.off('new-announcement', onAnnouncement)
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
