import { analyzeImage } from './vision.js';
import { getLanguageInfo } from '../config/languages.js';
import { savePending, getPending, addVocab } from './sheets.js';
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
    throw new Error(`Failed to download image from LINE API: ${response.status} ${response.statusText}`);
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
 * Router หลักกระจาย Event ตามประเภท
 */
export async function handleEvent(event, client) {
  switch (event.type) {
    case 'message':
      if (event.message.type === 'image') {
        return handleImageMessage(event, client);
      } else if (event.message.type === 'text') {
        return handleTextMessage(event, client);
      }
      break;

    case 'postback':
      return handlePostback(event, client);

    case 'follow':
      return handleFollowEvent(event, client);

    default:
      return Promise.resolve(null);
  }
}

/**
 * จัดการเมื่อผู้ใช้ส่งข้อความตัวอักษร
 */
async function handleTextMessage(event, client) {
  const replyToken = event.replyToken;
  return await replyLine(replyToken, {
    type: 'text',
    text: 'สวัสดีครับ! 📸 ส่งรูปภาพป้าย เมนูอาหาร หรือฉลากสินค้าภาษาต่างประเทศมาได้เลยครับ TravelLingo Bot พร้อมแปลภาษาและสกัดคำศัพท์ให้ทันที!'
  });
}

/**
 * จัดการเมื่อผู้ใช้ส่งรูปภาพ
 */
async function handleImageMessage(event, client) {
  const userId = event.source?.userId;
  const replyToken = event.replyToken;

  showLoading(userId).catch(() => {});

  try {
    console.log('📸 เริ่มประมวลผลรูปภาพ ID:', event.message.id);

    const imageBuffer = await fetchImageBuffer(event.message.id);
    const mimeType = 'image/jpeg';
    console.log('✅ ดาวน์โหลดรูปสำเร็จ ขนาด:', imageBuffer.length, 'bytes');

    const targetLang = 'ja';
    const langInfo = getLanguageInfo(targetLang);
    const result = await analyzeImage(imageBuffer, mimeType, targetLang);
    console.log('✅ วิเคราะห์ภาพด้วย Gemini สำเร็จ');

    if (!result || result.detected_lang === 'none' || !result.items || result.items.length === 0) {
      return await replyLine(replyToken, {
        type: 'text',
        text: '🔍 ไม่พบข้อความหรือตัวอักษรที่ชัดเจนในรูปภาพนี้ครับ\n\n💡 คำแนะนำ: ลองถ่ายรูปใหม่อีกครั้ง โดยขยับเข้ามาใกล้ขึ้น เน้นบริเวณตัวอักษร และมีแสงเพียงพอครับ 📸'
      });
    }

    // บันทึกผลสแกนชั่วคราวลง Google Sheets และรับ scanId กลับมา
    const scanId = await savePending(userId, targetLang, result.items);
    console.log('💾 บันทึก Pending สำเร็จ ได้ scanId:', scanId);

    const flexMessage = buildResultFlex(result, scanId, langInfo);
    return await replyLine(replyToken, flexMessage);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ:', error);

    return await replyLine(replyToken, {
      type: 'text',
      text: 'ขออภัยครับ เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพชั่วคราว 😅\n\n💡 กรุณาลองถ่ายหรือส่งรูปใหม่อีกครั้งนะครับ'
    });
  }
}

/**
 * จัดการ Follow Events
 */
async function handleFollowEvent(event, client) {
  const replyToken = event.replyToken;
  return await replyLine(replyToken, {
    type: 'text',
    text: `ยินดีต้อนรับสู่ TravelLingo Bot! ✈️🇯🇵\n\nผู้ช่วยแปลภาษาและบันทึกคำศัพท์จากรูปภาพป้าย เมนูอาหาร และฉลากต่างประเทศ\n\n📸 วิธีใช้งานง่ายๆ:\nเพียงส่งรูปภาพป้ายหรือเมนูอาหารเข้ามาในแชต บอทจะแปลภาษา สกัดคำศัพท์ พร้อมออกคำอ่านภาษาไทยให้อัตโนมัติทันที!`
  });
}

/**
 * จัดการ Event ประเภท Postback (กดปุ่มจากการ์ด Flex)
 */
export async function handlePostback(event, client) {
  const replyToken = event.replyToken;
  const data = event.postback?.data || '';
  console.log('📌 [Postback Received] Raw Data:', data);

  const params = new URLSearchParams(data);
  const action = params.get('action');
  const scanId = params.get('scan') || params.get('scanId');

  console.log(`🔎 [Postback Parsed] Action: "${action}", ScanID: "${scanId}"`);

  if (action === 'save') {
    if (!scanId) {
      console.error('❌ Postback Error: ไม่พบ scanId ใน postback data');
      return await replyLine(replyToken, {
        type: 'text',
        text: 'เกิดข้อผิดพลาด: ไม่พบรหัสสแกน กรุณาส่งรูปภาพใหม่อีกครั้งครับ'
      });
    }

    console.log(`🔎 กำลังค้นหาข้อมูล Pending สำหรับ scanId: ${scanId}`);
    const pendingData = await getPending(scanId);
    console.log('📦 ผลการค้นหา Pending Data:', JSON.stringify(pendingData));

    if (!pendingData) {
      return await replyLine(replyToken, {
        type: 'text',
        text: 'ผลสแกนนี้หมดอายุหรือไม่มีข้อมูล กรุณาส่งรูปภาพสแกนใหม่อีกครั้งครับ'
      });
    }

    const { userId, lang, items } = pendingData;
    const result = await addVocab(userId, lang, items, 'สแกนรูปภาพ');
    console.log('✅ บันทึกคำศัพท์สำเร็จ:', result);

    return await replyLine(replyToken, {
      type: 'text',
      text: `บันทึกแล้ว ${result?.added ?? items.length} คำ 🎉 (ซ้ำ ${result?.duplicate ?? 0} คำ)`,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: 'ทบทวน', text: 'ทบทวน' } },
          { type: 'action', action: { type: 'message', label: 'สมุดคำศัพท์', text: 'สมุดคำศัพท์' } }
        ]
      }
    });
  }
}