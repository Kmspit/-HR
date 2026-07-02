import type { Metadata } from 'next'
import InstallGuideClient from '@/components/install/InstallGuideClient'

export const metadata: Metadata = {
  title: 'ติดตั้งแอพ',
  description: 'วิธีติดตั้ง KM HR ลงหน้าจอหลัก iPhone และ Android',
}

export default function InstallPage() {
  return <InstallGuideClient />
}
