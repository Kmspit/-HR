/** หมวดหมู่งานโปรดักส์ (สินเชื่อ) — ใช้ทั้งฝั่ง client (dropdown) และ server (validation). */
export const PRODUCT_CATEGORIES = {
  'เช่าซื้อรถยนต์': ['รถยนต์ใหม่', 'รถยนต์มือสอง'],
  'เช่าซื้อรถจักรยานยนต์': ['จยย. ใหม่', 'จยย. มือสอง'],
  'สินเชื่อบ้าน/จำนอง': ['จำนอง', 'รีไฟแนนซ์'],
  'บัตรเครดิต/สินเชื่อบุคคล': ['บัตรเครดิต', 'บัตรกดเงินสด', 'สินเชื่อบุคคล'],
  'สินเชื่อ SME/นิติบุคคล': ['เช่าซื้อเครื่องจักร', 'วงเงินหมุนเวียน'],
  'อื่นๆ': [],
} as const satisfies Record<string, readonly string[]>

export type ProductCategory = keyof typeof PRODUCT_CATEGORIES

export const PRODUCT_CATEGORY_KEYS = Object.keys(PRODUCT_CATEGORIES) as ProductCategory[]

/** "อื่นๆ" มีประเภทย่อยเป็น free text แทน dropdown */
export const OTHER_PRODUCT_CATEGORY: ProductCategory = 'อื่นๆ'

export function isProductCategory(value: string | null | undefined): value is ProductCategory {
  return !!value && PRODUCT_CATEGORY_KEYS.includes(value as ProductCategory)
}

export function productTypesFor(category: string | null | undefined): readonly string[] {
  if (!isProductCategory(category)) return []
  return PRODUCT_CATEGORIES[category]
}
