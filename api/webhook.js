import { handleEvent } from '../lib/router.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const events = req.body?.events || [];

    // ประมวลผล Events ทั้งหมด
    await Promise.all(events.map(event => handleEvent(event)));

    // ตอบกลับ LINE ด้วย 200 OK เสมอ
    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('❌ Webhook Error:', error);
    // ป้องกัน HTTP 500 ไม่ให้เกิด Retry Loop จาก LINE Server
    return res.status(200).json({ status: 'error_handled' });
  }
}
