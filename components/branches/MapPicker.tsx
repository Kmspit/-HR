'use client'

import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import { useEffect, useRef } from 'react'

let _iconsFixed = false
function ensureLeafletIcons() {
  if (_iconsFixed) return
  _iconsFixed = true
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L = require('leaflet') as typeof import('leaflet')
  ;(L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl = undefined
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export type MapPickerProps = {
  lat: number | null
  lng: number | null
  radiusMeters: number
  onPick: (lat: number, lng: number) => void
}

const BANGKOK: LatLngExpression = [13.7563, 100.5018]

export default function MapPicker({ lat, lng, radiusMeters, onPick }: MapPickerProps) {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    ensureLeafletIcons()
  }, [])

  const center: LatLngExpression = lat != null && lng != null ? [lat, lng] : BANGKOK
  const zoom = lat != null ? 17 : 12

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '260px', borderRadius: '12px', zIndex: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      {lat != null && lng != null && (
        <>
          <Marker position={[lat, lng]} />
          <Circle
            center={[lat, lng]}
            radius={radiusMeters}
            pathOptions={{ color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.12 }}
          />
        </>
      )}
    </MapContainer>
  )
}
