import { describe, it, expect, vi } from 'vitest'
import {
  findOrphanedFaceProfiles,
  deleteOrphanedFaceProfiles,
  type OrphanedProfile,
} from '@/scripts/cleanup-orphaned-face-profiles'

describe('findOrphanedFaceProfiles', () => {
  it('runs a NOT EXISTS anti-join against users and returns whatever rows come back', async () => {
    const rows: OrphanedProfile[] = [{ id: 'p1', userId: 'ghost-user', registeredAt: '2026-01-01T00:00:00.000Z' }]
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue(rows) }

    const result = await findOrphanedFaceProfiles(db)

    expect(result).toEqual(rows)
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1)
    const sql = db.$queryRawUnsafe.mock.calls[0][0] as string
    expect(sql).toContain('user_face_profiles')
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('users')
  })

  it('returns an empty array when nothing is orphaned', async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) }
    expect(await findOrphanedFaceProfiles(db)).toEqual([])
  })
})

describe('deleteOrphanedFaceProfiles', () => {
  const orphans: OrphanedProfile[] = [
    { id: 'p1', userId: 'ghost-1', registeredAt: '2026-01-01T00:00:00.000Z' },
    { id: 'p2', userId: 'ghost-2', registeredAt: '2026-02-01T00:00:00.000Z' },
  ]

  it('deletes each row by id and reports success for all of them', async () => {
    const db = { userFaceProfile: { delete: vi.fn().mockResolvedValue({}) } }

    const results = await deleteOrphanedFaceProfiles(db, orphans)

    expect(db.userFaceProfile.delete).toHaveBeenCalledTimes(2)
    expect(db.userFaceProfile.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    expect(db.userFaceProfile.delete).toHaveBeenCalledWith({ where: { id: 'p2' } })
    expect(results).toEqual([
      { id: 'p1', outcome: 'deleted' },
      { id: 'p2', outcome: 'deleted' },
    ])
  })

  it('reports a per-row error instead of throwing, and still processes the remaining rows', async () => {
    const db = {
      userFaceProfile: {
        delete: vi.fn()
          .mockRejectedValueOnce(new Error('locked'))
          .mockResolvedValueOnce({}),
      },
    }

    const results = await deleteOrphanedFaceProfiles(db, orphans)

    expect(results[0]).toEqual({ id: 'p1', outcome: 'error', reason: 'locked' })
    expect(results[1]).toEqual({ id: 'p2', outcome: 'deleted' })
    expect(db.userFaceProfile.delete).toHaveBeenCalledTimes(2)
  })

  it('returns an empty array for an empty input without touching the DB', async () => {
    const db = { userFaceProfile: { delete: vi.fn() } }
    expect(await deleteOrphanedFaceProfiles(db, [])).toEqual([])
    expect(db.userFaceProfile.delete).not.toHaveBeenCalled()
  })
})
