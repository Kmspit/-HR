'use client'

import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet'
import L, { type LatLngExpression } from 'leaflet'

// L.Icon.Default._getIconUrl is NOT just an auto-detect fallback — Leaflet's
// _createIcon() calls `this._getIconUrl(name)` UNCONDITIONALLY (leaflet-src.js,
// Icon.prototype._createIcon), even when options.iconUrl is already set via
// mergeOptions below. IconDefault.prototype._getIconUrl wraps the working
// base Icon.prototype._getIconUrl with DOM-sniffing path auto-detection that
// breaks under webpack bundling (no matching <link>/<script> tag to sniff).
// The fix must DELETE the override so the prototype chain falls through to
// Icon.prototype._getIconUrl (which just returns options.iconUrl directly,
// using our full CDN URLs, no path-prepending). Setting it to `undefined`
// instead of deleting it — what this code did before — does NOT restore the
// prototype-chain fallback: it leaves an own property whose value is
// `undefined`, so `this._getIconUrl(name)` still crashes with "this
//._getIconUrl is not a function" the moment a <Marker> mounts. That crash
// left the marker's icon half-created, so unmount then failed a second time
// removing listeners from the never-created icon element — "Cannot read
// properties of undefined (reading '_leaflet_events')", the error that
// actually surfaced to users (a cascade from the first crash, not a separate
// bug). Runs at module scope rather than inside a component/effect since
// this file is 'use client' and always loaded via next/dynamic with
// ssr:false (see BranchesClient.tsx) — never evaluated outside the browser.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

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
