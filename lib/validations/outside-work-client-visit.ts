import { z } from 'zod'
import { PRODUCT_CATEGORY_KEYS } from '@/lib/constants/product-types'

const productCategoryKeys = PRODUCT_CATEGORY_KEYS as [string, ...string[]]

/**
 * Validation for the "ออกนอกสถานที่ (บริษัทลูกค้า)" one-at-a-time form.
 * Unlike the Excel-grid form, clientCompanyId is required here — this page
 * exists specifically for client-visit records, so every submission must
 * be tied to a ClientCompany CRM record.
 */
export const outsideWorkClientVisitSchema = z.object({
  clientCompanyId: z.string().cuid('กรุณาเลือกบริษัทลูกค้า'),
  date:    z.string().min(1, 'กรุณาเลือกวันที่'),
  timeSlot: z.enum(['เช้า', 'บ่าย'], { message: 'กรุณาเลือกช่วงเวลา' }),
  place:   z.string().min(1, 'กรุณาระบุสถานที่').max(200, 'สถานที่ต้องไม่เกิน 200 ตัวอักษร'),
  purpose: z.string().min(1, 'กรุณาระบุสิ่งที่ไปดำเนินการ').max(500, 'รายละเอียดต้องไม่เกิน 500 ตัวอักษร'),
  caseNumber:      z.string().max(100, 'หมายเลขคดีต้องไม่เกิน 100 ตัวอักษร').optional().or(z.literal('')),
  productCategory: z.enum(productCategoryKeys).optional().or(z.literal('')),
  productType:     z.string().max(100, 'ประเภทย่อยต้องไม่เกิน 100 ตัวอักษร').optional().or(z.literal('')),
  caseCount: z.union([z.string().regex(/^\d*$/, 'จำนวนคดีต้องเป็นตัวเลข'), z.number().int().min(0, 'จำนวนคดีต้องไม่ติดลบ'), z.null()]).optional(),
})

export type OutsideWorkClientVisitFormData = z.infer<typeof outsideWorkClientVisitSchema>
