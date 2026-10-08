import crypto from 'crypto';

// เก็บข้อมูลในระดับ Module Memory
const pendingScans = new Map();

/**
 * สุ่มสร้าง scanId ขนาด 8 ตัวอักษร
 */
export function generateScanId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * บันทึกผลสแกนชั่วคราวลงใน Memory
 */
export function savePendingScan(scanId, data) {
  pendingScans.set(scanId, {
    ...data,
    createdAt: Date.now()
  });
}

/**
 * ดึงข้อมูลผลสแกนตาม scanId
 */
export function getPendingScan(scanId) {
  return pendingScans.get(scanId) || null;
}

/**
 * ลบข้อมูลสแกนออกจาก Memory
 */
export function deletePendingScan(scanId) {
  pendingScans.delete(scanId);
}