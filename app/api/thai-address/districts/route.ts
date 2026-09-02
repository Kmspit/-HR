import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'
import { listThaiDistricts } from '@/lib/thai-address'

/** Public — see app/api/thai-address/provinces/route.ts. */
export async function GET(req: NextRequest) {
  try {
    const provinceCode = req.nextUrl.searchParams.get('provinceCode') ?? ''
    if (!provinceCode) return NextResponse.json({ districts: [] })
    return NextResponse.json({ districts: listThaiDistricts(provinceCode) })
  } catch (err) {
    return apiError(err)
  }
}
