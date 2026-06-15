import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

const ROOT = (process.env.CLOUDINARY_ROOT_FOLDER ?? 'hr-system').replace(/^\/|\/$/g, '')

function configure() {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const key  = process.env.CLOUDINARY_API_KEY?.trim()
  const sec  = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!name || !key || !sec) throw new Error('Cloudinary not configured')
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true })
  return { name, key, sec }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, key } = configure()
    const { searchParams } = req.nextUrl
    const context = searchParams.get('context') ?? 'documents'
    const now = Math.floor(Date.now() / 1000)
    const date = new Date().toISOString().slice(0, 7) // YYYY-MM
    const folder = `${ROOT}/${context}/${session.user.id}/${date}`

    const paramsToSign: Record<string, string | number> = {
      timestamp: now,
      folder,
    }

    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!.trim())

    return NextResponse.json({
      signature,
      timestamp: now,
      apiKey: key,
      cloudName: name,
      folder,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
