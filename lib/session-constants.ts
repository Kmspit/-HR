// ไม่มี import — ใช้ได้ทั้ง middleware (edge), error boundary ฝั่ง client และ server

/** digest ของ SessionUnavailableError — error boundary ใช้แยก "DB ขัดข้อง" ออกจาก error อื่น
 *  (production ตัด error.message ทิ้ง เหลือแค่ digest) */
export const SESSION_UNAVAILABLE_DIGEST = 'SESSION_UNAVAILABLE'

/** /login?reason=expired — middleware ปล่อยหน้า login ผ่านแม้ยังเห็น JWT (กัน redirect วน) */
export const SESSION_EXPIRED_REASON = 'expired'
