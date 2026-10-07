// api/webhook.js
// Serverless Function สำหรับรับ Webhook จาก LINE

import { validateSignature } from '@line/bot-sdk';
import { lineClient, showLoading } from '../lib/line.js';

// ปิด bodyParser ของ Vercel เพื่ออ่าน Buffer ดิบสำหรับตรวจสอบ Signature
export const config = {
  api: {
    bodyParser: false
  }
};

/**
 * อ่าน Stream จาก HTTP Request แปลงเป็น Buffer
 */
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. อ่าน Raw Body เพื่อตรวจความถูกต้องของ Signature
    const rawBodyBuffer = await getRawBody(req);
    const rawBody = rawBodyBuffer.toString('utf-8');

    const signature = req.headers['x-line-signature'];
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

    // 2. ตรวจสอบ x-line-signature ด้วย HMAC-SHA256
    if (!signature || !validateSignature(rawBody, channelSecret, signature)) {
      console.error('Signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 3. แปลงข้อความ JSON
    const body = JSON.parse(rawBody);
    const events = body.events || [];

    // กรณี LINE กด Verify Webhook ใน Developer Console (ส่ง events ว่างมา)
    if (events.length === 0) {
      return res.status(200).json({ message: 'Webhook verified successfully' });
    }

    // 4. วนลูปประมวลผลข้อความ
    await Promise.all(
      events.map(async (event) => {
        if (event.type !== 'message') return;

        const { replyToken, message, source } = event;
        const userId = source?.userId;

        if (message.type === 'text') {
          // ตอบกลับข้อความแบบ Text
          await lineClient.replyMessage({
            replyToken,
            messages: [
              {
                type: 'text',
                text: `ได้รับข้อความ: ${message.text}`
              }
            ]
          });
        } else if (message.type === 'image') {
          // แสดงอนิเมชัน Loading ระหว่างรอมือถือประมวลผล
          if (userId) {
            await showLoading(userId, 5);
          }

          // ตอบกลับข้อความเมื่อรับ รูปภาพ
          await lineClient.replyMessage({
            replyToken,
            messages: [
              {
                type: 'text',
                text: 'ได้รับรูปแล้ว'
              }
            ]
          });
        }
      })
    );

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}