'use client'

import { useEffect, useRef } from 'react'

type Props = {
  lat: number
  lng: number
  label?: string
  height?: number
}

export default function MapView({ lat, lng, label = 'ตำแหน่ง', height = 200 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return

    async function initMap() {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css' as any)

      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }

      const map = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: false })
      mapInstance.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)

      const icon = L.divIcon({
        html: `<div style="width:36px;height:36px;background:#22c55e;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      })

      map.setView([lat, lng], 16)
      L.marker([lat, lng], { icon }).addTo(map).bindPopup(label).openPopup()
    }

    initMap()
    return () => {
      mapInstance.current?.remove()
      mapInstance.current = null
    }
  }, [lat, lng, label])

  return (
    <div
      ref={mapRef}
      style={{ height, borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}
    />
  )
}
