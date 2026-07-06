'use client'



import { useEffect, useRef } from 'react'

import {

  useNotificationStreamContext,

  type AnnouncementStreamEvent,

} from '@/components/notification-center/NotificationStreamProvider'



/** Subscribe to announcement SSE events via the shared NotificationStreamProvider. */

export function useAnnouncementStream(

  onAnnouncement: (data: AnnouncementStreamEvent) => void,

) {

  const ctx = useNotificationStreamContext()

  const handlerRef = useRef(onAnnouncement)

  handlerRef.current = onAnnouncement



  useEffect(() => {

    if (!ctx) return

    return ctx.subscribe({

      onAnnouncement: (data) => handlerRef.current(data),

    })

  }, [ctx])

}

