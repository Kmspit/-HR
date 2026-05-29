import { deliverWarningToEmployee } from '@/lib/warning-delivery'

/** ส่งใบเตือนให้พนักงาน: สร้าง PDF + แจ้งในแอป + LINE Flex (retry) */
export async function notifyWarningToEmployee(
  warningId: string,
  options?: { warningNumber?: number },
) {
  return deliverWarningToEmployee(warningId, options)
}
