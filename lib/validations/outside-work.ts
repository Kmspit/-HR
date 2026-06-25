import { z } from 'zod'

export const outsideWorkSchema = z.object({
  date: z.string().min(1, 'กรุณาเลือกวันที่'),
  place: z.string().min(1, 'กรุณาระบุสถานที่').max(200, 'สถานที่ต้องไม่เกิน 200 ตัวอักษร'),
  purpose: z.string().min(1, 'กรุณาระบุสิ่งที่ไปดำเนินการ').max(500, 'รายละเอียดต้องไม่เกิน 500 ตัวอักษร'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  client: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  googleMapsUrl: z.string().url('URL ไม่ถูกต้อง').optional().or(z.literal('')),
})

export type OutsideWorkFormData = z.infer<typeof outsideWorkSchema>
