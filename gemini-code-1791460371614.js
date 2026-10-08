import { Client } from '@line/bot-sdk';
import { analyzeImage } from './vision.js';
import { getLanguageInfo } from '../config/languages.js';
import { generateScanId, savePendingScan } from './pending-temp.js';
import { buildResultFlex } from './flex.js';

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
};

const lineClient = new Client(lineConfig);

/**
 * เรียก Loading Animation บน LINE 1:1 Chat
 */
async function showLoading(userId) {
  if (!userId) return;
  try {
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({ chatId: userId, loadingSeconds: 20 })
    });
  } catch (err) {
    console.warn('⚠️ ไม่สามารถแสดง Loading Animation ได้:', err.message);
  }
}

/**
 * แปลง Stream จาก LINE Content API เป็น Buffer
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Router หลักจัดเส้นทาง Event จาก LINE
 */
export async function handleEvent(event) {
  const { type, source, replyToken } = event;
  const userId = source?.userId;

  try {
    switch (type) {
      case 'message':
        return await handleMessageEvent(event, userId, replyToken);
      case 'postback':
        return await handlePostbackEvent(event, replyToken);
      case 'follow':
        return await handleFollowEvent(replyToken);
      default:
        return null;
    }
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาดใน handleEvent:', err);
    return null;
  }
}

/**
 * จัดการ Message Events
 */
async function handleMessageEvent(event, userId, replyToken) {
  const messageType = event.message.type;

  if (messageType === 'image') {
    return await handleImageMessage(event, userId, replyToken);
  } else if (messageType === 'text') {
    return await lineClient.replyMessage(replyToken, {
      type: 'text',
      text: 'สวัสดีครับ! 📸 ส่งรูปภาพป้าย เมนูอาหาร หรือฉลากสินค้าภาษาต่างประเทศมาได้เลยครับ TravelLingo Bot พร้อมแปลภาษาและสกัดคำศัพท์ให้ทันที!'
    });
  }
}

/**
 * จัดการเมื่อผู้ใช้ส่งรูปภาพ
 */
async function handleImageMessage(event, userId, replyToken) {
  // 1. เรียก Loading Animation บน LINE
  await showLoading(userId);

  try {
    // 2. ดาวน์โหลดรูปภาพจาก LINE Content API
    const imageStream = await lineClient.getMessageContent(event.message.id);
    const imageBuffer = await streamToBuffer(imageStream);
    const mimeType = 'image/jpeg';

    // 3. วิเคราะห์รูปภาพด้วย Gemini Vision (ใช้ "ja" ชั่วคราว)
    const targetLang = 'ja';
    const langInfo = getLanguageInfo(targetLang);
    const result = await analyzeImage(imageBuffer, mimeType, targetLang);

    // 4. ตรวจสอบกรณีรูปภาพไม่มีข้อความ/อ่านไม่ได้
    if (!result || result.detected_lang === 'none' || !result.items || result.items.length === 0) {
      return await lineClient.replyMessage(replyToken, {
        type: 'text',
        text: '🔍 ไม่พบข้อความหรือตัวอักษรที่ชัดเจนในรูปภาพนี้ครับ\n\n💡 คำแนะนำ: ลองถ่ายรูปใหม่อีกครั้ง โดยขยับเข้ามาใกล้ขึ้น เน้นบริเวณตัวอักษร และอยู่ในจุดที่มีแสงเพียงพอครับ 📸'
      });
    }

    // 5. บันทึกผลสแกนชั่วคราว
    const scanId = generateScanId();
    savePendingScan(scanId, {
      userId,
      result,
      targetLang,
      createdAt: Date.now()
    });

    // 6. ส่ง Flex Message สรุปผลลัพธ์
    const flexMessage = buildResultFlex(result, scanId, langInfo);
    return await lineClient.replyMessage(replyToken, flexMessage);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ:', error);

    // Error Handling ภาษาไทยที่เป็นมิตร (ไม่ส่ง HTTP 500)
    return await lineClient.replyMessage(replyToken, {
      type: 'text',
      text: 'ขออภัยครับ เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพชั่วคราว 😅\n\n💡 กรุณาลองถ่ายหรือส่งรูปใหม่อีกครั้งนะครับ (แนะนำถ่ายให้ชัดเจน ใกล้ขึ้น และมีแสงเพียงพอ)'
    });
  }
}

/**
 * จัดการ Postback Events
 */
async function handlePostbackEvent(event, replyToken) {
  const data = event.postback.data || '';
  const params = new URLSearchParams(data);
  const action = params.get('action');

  if (action === 'save') {
    return await lineClient.replyMessage(replyToken, {
      type: 'text',
      text: 'รับทราบครับ! 📝 (บันทึกข้อมูลเรียบร้อย จะทำการเชื่อมต่อระบบ Google Sheets ใน Phase 4)'
    });
  }
}

/**
 * จัดการ Follow Events
 */
async function handleFollowEvent(replyToken) {
  return await lineClient.replyMessage(replyToken, {
    type: 'text',
    text: `ยินดีต้อนรับสู่ TravelLingo Bot! ✈️🇯🇵\n\nผู้ช่วยแปลภาษาและบันทึกคำศัพท์จากรูปภาพป้าย เมนูอาหาร และฉลากต่างประเทศ\n\n📸 วิธีใช้งานง่ายๆ:\nเพียงส่งรูปภาพป้ายหรือเมนูอาหารเข้ามาในแชต บอทจะแปลภาษา สกัดคำศัพท์ พร้อมออกคำอ่านภาษาไทยให้อัตโนมัติทันที!`
  });
}