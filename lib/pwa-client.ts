export const PWA_DISMISS_KEY = 'pwa-install-dismissed-until'
export const PWA_DISMISS_DAYS = 7

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone / iPad (รวม iPadOS desktop UA) */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Safari บน iOS เท่านั้น — ไม่รวม Chrome/Firefox/Line in-app */
export function isIosSafari(): boolean {
  if (!isIosDevice()) return false
  const ua = navigator.userAgent
  if (/CriOS|FxiOS|EdgiOS|OPiOS|mercury|FBAN|FBAV|Line\//i.test(ua)) return false
  if (/Chrome|Chromium/i.test(ua) && !/Safari/i.test(ua)) return false
  return true
}

/** ตรวจว่ากำลังเปิดผ่าน in-app browser ของ LINE — ช่องทางที่พนักงานส่วนใหญ่มักกดลิงก์
 *  เข้ามา (แจ้งเตือน/OTP ของระบบนี้ส่งผ่าน LINE OA) แต่ iOS ไม่อนุญาตติดตั้ง PWA จาก
 *  in-app browser ใดๆ เลย ต้องเปิดด้วย Safari จริงๆ เท่านั้น */
export function isLineInApp(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Line\//i.test(navigator.userAgent)
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /android/i.test(navigator.userAgent)
}

export function isPwaDismissed(): boolean {
  try {
    const until = localStorage.getItem(PWA_DISMISS_KEY)
    if (!until) return false
    return Date.now() < Number(until)
  } catch {
    return false
  }
}

export function dismissPwaPrompt(): void {
  try {
    localStorage.setItem(
      PWA_DISMISS_KEY,
      String(Date.now() + PWA_DISMISS_DAYS * 86400000),
    )
  } catch {
    /* ignore */
  }
}
