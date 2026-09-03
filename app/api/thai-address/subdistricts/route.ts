import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'
import { listThaiSubdistricts } from '@/lib/thai-address'

/** Public — see app/api/thai-address/provinces/route.ts. */
export async function GET(req: NextRequest) {
  try {
    const districtCode = req.nextUrl.searchParams.get('districtCode') ?? ''
    if (!districtCode) return NextResponse.json({ subdistricts: [] })
    return NextResponse.json({ subdistricts: listThaiSubdistricts(districtCode) })
  } catch (err) {
    return apiError(err)
  }
}
