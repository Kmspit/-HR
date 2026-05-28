import { redirect } from 'next/navigation'

/** ย้ายการจัดการวันหยุดไปหน้าปฏิทินแล้ว */
export default function HolidaysRedirectPage() {
  redirect('/calendar')
}
