import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'
import { listThaiProvinces } from '@/lib/thai-address'

/** Public — used by both the (unauthenticated) registration wizard and the
 *  employee-edit profile tab. Reference data, not sensitive. */
export async function GET() {
  try {
    return NextResponse.json({ provinces: listThaiProvinces() })
  } catch (err) {
    return apiError(err)
  }
}
