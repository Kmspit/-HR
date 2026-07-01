import { Suspense } from 'react'
import ManualClient from './ManualClient'

export default function ManualPage() {
  return (
    <Suspense fallback={null}>
      <ManualClient />
    </Suspense>
  )
}
