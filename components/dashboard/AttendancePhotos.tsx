'use client'

import { useState } from 'react'
import { Camera, X } from 'lucide-react'

export type AttendancePhotoItem = {
  key: string
  label: string
  url: string | null
  time?: string | null
}

type Props = {
  items: AttendancePhotoItem[]
  title?: string
}

export default function AttendancePhotos({ items, title = 'รูปที่บันทึกวันนี้' }: Props) {
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)
  const withPhoto = items.filter((i) => i.url)

  if (withPhoto.length === 0) return null

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 space-y-3">
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <Camera className="w-4 h-4 text-cyan-400" />
          {title}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {withPhoto.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => item.url && setLightbox({ url: item.url, label: item.label })}
              className="text-left rounded-xl overflow-hidden border border-white/10 hover:border-cyan-500/40 transition group"
            >
              <div className="aspect-square bg-black/40 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url!}
                  alt={item.label}
                  className="w-full h-full object-cover scale-x-[-1] group-hover:opacity-90"
                />
              </div>
              <div className="p-2 bg-white/5">
                <p className="text-[11px] font-semibold text-white truncate">{item.label}</p>
                {item.time && (
                  <p className="text-[10px] text-slate-500 tabular-nums">
                    {new Date(item.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">แตะรูปเพื่อขยายดู</p>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white"
            onClick={() => setLightbox(null)}
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-semibold text-white">{lightbox.label}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.label}
              className="w-full rounded-2xl object-contain max-h-[70vh] scale-x-[-1] border border-white/20"
            />
          </div>
        </div>
      )}
    </>
  )
}
