import { analyzeImage } from './vision.js';
import { getLanguageInfo } from '../config/languages.js';
import { savePending, getPending, addVocab } from './sheets.js';
import { buildResultFlex } from './flex.js';

const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

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

async function fetchImageBuffer(messageId) {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: {
      'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download image from LINE API: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

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

async function handleTextMessage(event, client) {
  return await replyLine(event.replyToken, {
    type: 'text',
    text: 'สวัสดีครับ! 📸 ส่งรูปภาพป้าย เมนูอาหาร หรือฉลากสินค้าภาษาต่างประเทศมาได้เลยครับ TravelLingo Bot พร้อมแปลภาษาและสกัดคำศัพท์ให้ทันที!'
  });
}

async function handleImageMessage(event, client) {
  const userId = event.source?.userId;
  const replyToken = event.replyToken;

  showLoading(userId).catch(() => {});

  try {
    console.log('📸 เริ่มประมวลผลรูปภาพ ID:', event.message.id);

    const imageBuffer = await fetchImageBuffer(event.message.id);
    const mimeType = 'image/jpeg';

    const targetLang = 'ja';
    const langInfo = getLanguageInfo(targetLang);
    const result = await analyzeImage(imageBuffer, mimeType, targetLang);

    if (!result || result.detected_lang === 'none' || !result.items || result.items.length === 0) {
      return await replyLine(replyToken, {
        type: 'text',
        text: '🔍 ไม่พบข้อความหรือตัวอักษรที่ชัดเจนในรูปภาพนี้ครับ ลองถ่ายรูปใหม่อีกครั้งนะครับ 📸'
      });
    }

    // สร้าง scanId อิงตามเวลาปัจจุบัน
    const scanId = `scan_${Date.now()}`;
    await savePending(scanId, userId, targetLang, result.items);
    console.log('💾 บันทึก Pending สำเร็จ ScanID:', scanId);

    const flexMessage = buildResultFlex(result, scanId, langInfo);
    return await replyLine(replyToken, flexMessage);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ:', error);
    return await replyLine(replyToken, {
      type: 'text',
      text: 'ขออภัยครับ เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพชั่วคราว 😅 กรุณาลองส่งรูปใหม่อีกครั้งนะครับ'
    });
  }
}

async function handleFollowEvent(event, client) {
  return await replyLine(event.replyToken, {
    type: 'text',
    text: `ยินดีต้อนรับสู่ TravelLingo Bot! ✈️🇯🇵\nส่งรูปภาพป้ายหรือเมนูอาหารเข้ามาเพื่อแปลภาษาและบันทึกคำศัพท์ได้ทันทีครับ`
  });
}

export async function handlePostback(event, client) {
  const replyToken = event.replyToken;
  const data = event.postback?.data || '';
  const currentUserId = event.source?.userId;
  console.log('📌 [Postback Received] Raw Data:', data);

  try {
    const params = new URLSearchParams(data);
    const action = params.get('action');
    const scanId = params.get('scanId') || params.get('scan');

    console.log(`🔎 [Postback Parsed] Action: "${action}", ScanID: "${scanId}"`);

    // รองรับทั้ง save_vocab และ save
    if (action === 'save_vocab' || action === 'save') {
      if (!scanId || scanId === 'temp_scan_id') {
        return await replyLine(replyToken, {
          type: 'text',
          text: 'ผลสแกนนี้หมดอายุหรือข้อมูลไม่ถูกต้อง กรุณาส่งรูปภาพสแกนใหม่อีกครั้งครับ'
        });
      }

      const pendingData = await getPending(scanId);
      console.log('📦 ผลการค้นหา Pending Data:', JSON.stringify(pendingData));

      if (!pendingData) {
        return await replyLine(replyToken, {
          type: 'text',
          text: 'ผลสแกนนี้หมดอายุหรือไม่มีข้อมูล กรุณาส่งรูปภาพสแกนใหม่อีกครั้งครับ'
        });
      }

      const userId = currentUserId || pendingData.userId;
      const lang = pendingData.lang || 'ja';
      const items = Array.isArray(pendingData.items) ? pendingData.items : [];

      if (items.length === 0) {
        return await replyLine(replyToken, {
          type: 'text',
          text: 'ไม่พบรายการคำศัพท์ในผลสแกนนี้ กรุณาส่งรูปภาพใหม่อีกครั้งครับ'
        });
      }

      const result = await addVocab(userId, lang, items, 'สแกนรูปภาพ');

      return await replyLine(replyToken, {
        type: 'text',
        text: `✅ บันทึกคำศัพท์สำเร็จ ${result?.added ?? items.length} คำเรียบร้อยแล้วครับ!`,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: 'สมุดคำศัพท์', text: 'สมุดคำศัพท์' } }
          ]
        }
      });
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดใน handlePostback:', error);
    return await replyLine(replyToken, {
      type: 'text',
      text: 'เกิดข้อผิดพลาดในการบันทึกคำศัพท์ชั่วคราว กรุณาลองใหม่อีกครั้งครับ'
    });
  }
}