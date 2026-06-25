import { z } from 'zod'

export const outsideWorkSchema = z.object({
  // ── Required core fields ──────────────────────────────────────────────────
  date:    z.string().min(1, 'กรุณาเลือกวันที่'),
  place:   z.string().min(1, 'กรุณาระบุสถานที่').max(200, 'สถานที่ต้องไม่เกิน 200 ตัวอักษร'),
  purpose: z.string().min(1, 'กรุณาระบุสิ่งที่ไปดำเนินการ').max(500, 'รายละเอียดต้องไม่เกิน 500 ตัวอักษร'),

  // ── Company form fields (ฉ.2) ─────────────────────────────────────────────
  timeSlot:     z.enum(['เช้า', 'บ่าย', 'เต็มวัน']).optional().or(z.literal('')),
  caseNumber:   z.string().max(100, 'หมายเลขคดีต้องไม่เกิน 100 ตัวอักษร').optional(),
  productWork:  z.string().max(200, 'งานโปรดักส์ต้องไม่เกิน 200 ตัวอักษร').optional(),
  workBranch:   z.string().max(100, 'ชื่อสาขาต้องไม่เกิน 100 ตัวอักษร').optional(),
  caseCount:    z.union([z.number().int().min(0, 'จำนวนคดีต้องไม่ติดลบ'), z.literal(''), z.null()]).optional(),
  adminChecked: z.enum(['มี', 'ไม่มี']).optional().or(z.literal('')),
  supervisedBy: z.enum(['แอดมิน', 'หัวหน้า', 'ทนายวางแผนตามเอง']).optional().or(z.literal('')),
  note:         z.string().max(500, 'หมายเหตุต้องไม่เกิน 500 ตัวอักษร').optional(),

  // ── Legacy / optional fields ──────────────────────────────────────────────
  startTime:     z.string().optional(),
  endTime:       z.string().optional(),
  client:        z.string().max(200).optional(),
  googleMapsUrl: z.string().url('URL ไม่ถูกต้อง').optional().or(z.literal('')),

  // ── Legacy extended fields (kept for backward compat) ─────────────────────
  employeeName:  z.string().max(200).optional(),
  ownerName:     z.string().max(200).optional(),
  workType:      z.string().max(100).optional(),
  distance:      z.union([z.number().min(0), z.literal(''), z.null()]).optional(),
  distanceLimit: z.union([z.number().min(0), z.literal(''), z.null()]).optional(),
  routeType:     z.string().max(100).optional(),
})

export type OutsideWorkFormData = z.infer<typeof outsideWorkSchema>
