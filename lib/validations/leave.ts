import { z } from 'zod'

export const leaveSchema = z.object({
  type: z.string().min(1, 'กรุณาเลือกประเภทการลา'),
  startDate: z.string().min(1, 'กรุณาเลือกวันที่เริ่มลา'),
  endDate: z.string().min(1, 'กรุณาเลือกวันที่สิ้นสุด'),
  reason: z.string().min(1, 'กรุณาระบุเหตุผล').max(500, 'เหตุผลต้องไม่เกิน 500 ตัวอักษร'),
}).refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
  message: 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น',
  path: ['endDate'],
})

export type LeaveFormData = z.infer<typeof leaveSchema>
