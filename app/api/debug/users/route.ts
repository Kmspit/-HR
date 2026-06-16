/**
 * TEMPORARY DEBUG ENDPOINT — remove after production issue is resolved.
 * Shows which users exist in Turso and whether they have a password hash.
 * Protected by AUTH_SECRET to prevent public access.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Require Authorization: Bearer <AUTH_SECRET>
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  const authHeader = req.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        passwordHash: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    // Also check which columns the users table actually has in Turso
    let columns: string[] = []
    try {
      const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(users)')
      columns = rows.map((r) => r.name)
    } catch (e) {
      columns = [`error: ${String(e)}`]
    }

    return NextResponse.json({
      dbUrl: process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite-local',
      userCount: users.length,
      tableColumns: columns,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        hasPassword: !!u.passwordHash,
        hashPrefix: u.passwordHash ? u.passwordHash.slice(0, 7) : null,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
