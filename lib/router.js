import { analyzeImage } from './vision.js';
import { getLanguageInfo } from '../config/languages.js';
import { generateScanId, savePendingScan } from './pending-temp.js';
import { buildResultFlex } from './flex.js';

const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

/**
 * ส่งข้อความตอบกลับไปยัง LINE Messaging API โดยตรง
 */
async function replyLine(replyToken, messages) {
  if (!replyToken) return;
  const messageArray = Array.isArray(messages) ? messages : [messages];

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken,
        messages: messageArray
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ LINE Reply Error:', response.status, errorText);
    }
  } catch (err) {
    console.error('❌ ไม่สามารถเรียก LINE Reply API ได้:', err.message);
  }
}

/**
 * ดาวน์โหลดรูปภาพจาก LINE Content API แปลงเป็น Buffer
 */
async function fetchImageBuffer(messageId) {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: {
      'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download image from LINE API: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * เรียก Loading Animation บน LINE 1:1 Chat
 */
async function showLoading(userId) {
  if (!userId || !LINE_ACCESS_TOKEN) return;
  try {
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({ chatId: userId, loadingSeconds: 20 })
    });
  } catch (err) {
    console.warn('⚠️ ไม่สามารถแสดง Loading Animation ได้:', err.message);
  }
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
    return await replyLine(replyToken, {
      type: 'text',
      text: 'สวัสดีครับ! 📸 ส่งรูปภาพป้าย เมนูอาหาร หรือฉลากสินค้าภาษาต่างประเทศมาได้เลยครับ TravelLingo Bot พร้อมแปลภาษาและสกัดคำศัพท์ให้ทันที!'
    });
  }
}

/**
 * จัดการเมื่อผู้ใช้ส่งรูปภาพ
 */
async function handleImageMessage(event, userId, replyToken) {
  // 1. เรียก Loading Animation (ไม่บล็อกโค้ดหลัก)
  showLoading(userId).catch(() => {});

  try {
    // 2. ดาวน์โหลดรูปภาพจาก LINE Content API
    const imageBuffer = await fetchImageBuffer(event.message.id);
    const mimeType = 'image/jpeg';

    // 3. วิเคราะห์รูปภาพด้วย Gemini Vision (ใช้ "ja" ชั่วคราว)
    const targetLang = 'ja';
    const langInfo = getLanguageInfo(targetLang);
    const result = await analyzeImage(imageBuffer, mimeType, targetLang);

    // 4. ตรวจสอบกรณีรูปภาพไม่มีข้อความ/อ่านไม่ได้
    if (!result || result.detected_lang === 'none' || !result.items || result.items.length === 0) {
      return await replyLine(replyToken, {
        type: 'text',
        text: '🔍 ไม่พบข้อความหรือตัวอักษรที่ชัดเจนในรูปภาพนี้ครับ\n\n💡 คำแนะนำ: ลองถ่ายรูปใหม่อีกครั้ง โดยขยับเข้ามาใกล้ขึ้น เน้นบริเวณตัวอักษร และมีแสงเพียงพอครับ 📸'
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
    return await replyLine(replyToken, flexMessage);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ:', error);

    return await replyLine(replyLine, {
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
    return await replyLine(replyToken, {
      type: 'text',
      text: 'รับทราบครับ! 📝 (บันทึกข้อมูลเรียบร้อย จะทำการเชื่อมต่อระบบ Google Sheets ใน Phase 4)'
    });
  }
}

/**
 * จัดการ Follow Events
 */
async function handleFollowEvent(replyToken) {
  return await replyLine(replyToken, {
    type: 'text',
    text: `ยินดีต้อนรับสู่ TravelLingo Bot! ✈️🇯🇵\n\nผู้ช่วยแปลภาษาและบันทึกคำศัพท์จากรูปภาพป้าย เมนูอาหาร และฉลากต่างประเทศ\n\n📸 วิธีใช้งานง่ายๆ:\nเพียงส่งรูปภาพป้ายหรือเมนูอาหารเข้ามาในแชต บอทจะแปลภาษา สกัดคำศัพท์ พร้อมออกคำอ่านภาษาไทยให้อัตโนมัติทันที!`
  });
}
