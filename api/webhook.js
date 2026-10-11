import crypto from 'crypto';
import { messagingApi } from '@line/bot-sdk';
import { handleEvent } from '../lib/router.js';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

/**
 * ตรวจสอบความถูกต้องของ LINE Webhook Signature (x-line-signature)
 * ป้องกันการสแปม Request ปลอมจากภายนอกเข้าสู่ Vercel
 */
function verifySignature(req) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.warn('⚠️ ไม่พบ LINE_CHANNEL_SECRET ใน .env (ข้ามการตรวจ Signature)');
    return true; // ยอมให้ผ่านชั่วคราวหากยังไม่ได้ตั้งค่าใน .env
  }

  const signature = req.headers['x-line-signature'];
  if (!signature) return false;

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  return signature === hash;
}

export default async function handler(req, res) {
  // 1. ตรวจสอบ HTTP Method (รับเฉพาะ POST)
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 2. ตรวจสอบ LINE Signature ความปลอดภัย
  if (!verifySignature(req)) {
    console.error('❌ Signature ไม่ถูกต้อง! ปฏิเสธ Request (Unauthorized)');
    return res.status(401).send('Invalid LINE signature');
  }

  try {
    const events = req.body?.events || [];

    // 3. กรณีทดสอบกด Verify Webhook บน LINE Developers Console
    if (events.length === 0) {
      return res.status(200).json({ status: 'ok', message: 'No events' });
    }

    // 4. ประมวลผลทุก Event พร้อมแยก try-catch รายรายการ
    // ป้องกัน Event หนึ่งล้มแล้วทำให้อื่นๆ ล้มตาม หรือเกิด Error 500 ยิง Retry ซ้ำ
    await Promise.all(
      events.map(async (event) => {
        try {
          console.log(`📩 ได้รับ Event ประเภท: ${event.type}`);
          await handleEvent(event, client);
        } catch (err) {
          console.error(`❌ เกิดข้อผิดพลาดขณะประมวลผล Event (${event.type}):`, err.message || err);
        }
      })
    );

    // 5. ส่ง 200 OK ยืนยันว่ารับทราบข้อมูลเรียบร้อย
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('❌ Webhook Fatal Error:', error);
    // ส่ง 200 เสมอเพื่อป้องกัน LINE ยิง Retry ซ้ำเมื่อระบบหลักขัดข้อง
    return res.status(200).json({ status: 'error', message: error.message });
  }
}