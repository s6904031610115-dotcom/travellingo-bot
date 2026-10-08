import { messagingApi } from '@line/bot-sdk';
import { handleEvent } from '../lib/router.js';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

export default async function handler(req, res) {
  // 1. ตรวจสอบ HTTP Method
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const events = req.body?.events || [];

    // 2. ถ้าไม่มี event ส่งมา (เช่น การกด Verify Webhook ใน LINE Developers)
    if (events.length === 0) {
      return res.status(200).json({ status: 'ok', message: 'No events' });
    }

    // 3. วนลูปประมวลผลทุก Event โดยแยก try-catch ราย Event
    // ป้องกันกรณี Event หนึ่งล้มแล้วทำให้ Event ทั้งหมดคืนค่า 500 กลับไปที่ LINE
    await Promise.all(
      events.map(async (event) => {
        try {
          console.log(`📩 ได้รับ Event ประเภท: ${event.type}`);
          await handleEvent(event, client);
        } catch (err) {
          console.error(`❌ เกิดข้อผิดพลาดขณะประมวลผล Event (${event.type}):`, err);
        }
      })
    );

    // 4. ส่ง 200 OK ตอบกลับ LINE เสมอเพื่อยืนยันการรับข้อมูล
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('❌ Webhook Fatal Error:', error);
    // ส่ง 200 พร้อมข้อความ log เพื่อป้องกัน LINE ยิง Retry ซ้ำเมื่อเจอ Error 500
    return res.status(200).json({ status: 'error', message: error.message });
  }
}