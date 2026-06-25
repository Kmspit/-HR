import { z } from 'zod'

export const checkInSchema = z.object({
  latitude: z.number({ required_error: 'กรุณาอนุญาตการเข้าถึงตำแหน่ง' }),
  longitude: z.number({ required_error: 'กรุณาอนุญาตการเข้าถึงตำแหน่ง' }),
  note: z.string().max(200).optional(),
})

export const checkOutSchema = z.object({
  latitude: z.number({ required_error: 'กรุณาอนุญาตการเข้าถึงตำแหน่ง' }),
  longitude: z.number({ required_error: 'กรุณาอนุญาตการเข้าถึงตำแหน่ง' }),
  note: z.string().max(200).optional(),
})

export type CheckInFormData = z.infer<typeof checkInSchema>
export type CheckOutFormData = z.infer<typeof checkOutSchema>
