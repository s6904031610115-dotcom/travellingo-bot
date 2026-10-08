import { analyzeImage } from './vision.js';
import { getLanguageInfo, buildLanguageQuickReply, LANGUAGES } from '../config/languages.js';
import { 
  getUser, 
  upsertUser, 
  savePending, 
  getPending, 
  addVocab, 
  getRecentVocab, 
  getStats 
} from './sheets.js';
import { buildResultFlex, buildVocabListFlex, buildStatsFlex } from './flex.js';

const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

/**
 * ฟังก์ชันสำหรับส่งข้อความตอบกลับไปยัง LINE Messaging API
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
 * ดาวน์โหลดรูปภาพจาก LINE CDN เป็น Buffer
 */
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

/**
 * แสดง Animation Loading ในห้องแชท
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
 * ข้อความช่วยเหลือรวมคำสั่งทั้งหมด
 */
function getHelpMessage() {
  return (
    `📖 รายการคำสั่งที่สามารถใช้งานได้:\n\n` +
    `📸 [ส่งรูปภาพ] - สแกนและแปลป้าย/เมนูอาหาร\n` +
    `📚 "สมุดคำศัพท์" - ดูคำศัพท์ 10 คำล่าสุดที่บันทึกไว้\n` +
    `🔄 "ทบทวน" - เริ่มฝึกจำคำศัพท์ด้วย Flashcard\n` +
    `📊 "สถิติ" - ดูสรุปจำนวนคำศัพท์และการเรียนรู้\n` +
    `🌐 "เปลี่ยนภาษา" - เปลี่ยนภาษาที่ต้องการเรียนรู้\n` +
    `❓ "วิธีใช้" หรือ "help" - แสดงรายการคำสั่งนี้`
  );
}

/**
 * Main Event Handler ตัวรับ Event ทั้งหมดจาก LINE Webhook
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
 * 1) ข้อความต้อนรับเมื่อผู้ใช้ Follow หรือเพิ่มเพื่อน
 */
async function handleFollowEvent(event, client) {
  const welcomeText = 
    `ยินดีต้อนรับสู่ TravelLingo Bot! ✈️🌍\n` +
    `ผู้ช่วยแปลภาษาและเรียนรู้คำศัพท์ระหว่างเดินทาง\n\n` +
    `📌 วิธีใช้งานง่ายๆ ใน 3 ขั้นตอน:\n` +
    `1️⃣ ส่งรูปภาพป้าย หรือเมนูอาหารภาษาต่างประเทศ\n` +
    `2️⃣ พิมพ์ "สมุดคำศัพท์" เพื่อดูคำศัพท์ที่บันทึกไว้\n` +
    `3️⃣ พิมพ์ "ทบทวน" เพื่อฝึกจำคำศัพท์ด้วย Flashcard\n\n` +
    `👇 กรุณาเลือกภาษาที่คุณต้องการเรียนรู้ครับ:`;

  return await replyLine(event.replyToken, {
    type: 'text',
    text: welcomeText,
    quickReply: buildLanguageQuickReply()
  });
}

/**
 * จัดการข้อความตัวอักษร
 */
async function handleTextMessage(event, client) {
  const userId = event.source?.userId;
  const text = (event.message.text || '').trim();
  const lowerText = text.toLowerCase();

  // ดึงข้อมูลภาษาปัจจุบันของผู้ใช้
  const user = await getUser(userId);
  const currentLang = user?.lang || 'ja';
  const langInfo = getLanguageInfo(currentLang);

  // 3) คำสั่ง "เปลี่ยนภาษา" หรือ "ภาษา"
  if (text === 'เปลี่ยนภาษา' || text === 'ภาษา') {
    return await replyLine(event.replyToken, {
      type: 'text',
      text: `ภาษาปัจจุบันของคุณคือ: ${langInfo.flag} ${langInfo.name}\nกรุณาเลือกภาษาที่ต้องการเรียนรู้ใหม่ครับ:`,
      quickReply: buildLanguageQuickReply()
    });
  }

  // 7) คำสั่ง "สมุดคำศัพท์"
  if (text === 'สมุดคำศัพท์') {
    const vocabs = await getRecentVocab(userId, currentLang, 10);
    const flex = buildVocabListFlex(vocabs, langInfo);
    return await replyLine(event.replyToken, flex);
  }

  // 8) คำสั่ง "สถิติ"
  if (text === 'สถิติ') {
    const stats = await getStats(userId, currentLang);
    const flex = buildStatsFlex(stats, langInfo);
    return await replyLine(event.replyToken, flex);
  }

  // 9) คำสั่ง "วิธีใช้" / "help"
  if (text === 'วิธีใช้' || lowerText === 'help') {
    return await replyLine(event.replyToken, {
      type: 'text',
      text: getHelpMessage()
    });
  }

  // 10) กรณีข้อความทั่วไปที่บอทไม่เข้าใจ ให้ส่งรายการคำสั่ง (ไม่ Echo)
  return await replyLine(event.replyToken, {
    type: 'text',
    text: `ขออภัยครับ บอทไม่เข้าใจคำสั่ง "${text}" 😅\n\n${getHelpMessage()}`
  });
}

/**
 * 4) & 5) & 6) จัดการเมื่อผู้ใช้ส่งรูปภาพ
 */
async function handleImageMessage(event, client) {
  const userId = event.source?.userId;
  const replyToken = event.replyToken;
  const messageId = event.message.id;

  // 4) ตรวจสอบว่าผู้ใช้เลือกภาษาแล้วหรือยัง
  const user = await getUser(userId);
  if (!user || !user.lang) {
    return await replyLine(replyToken, {
      type: 'text',
      text: '⚠️ คุณยังไม่ได้เลือกภาษาที่ต้องการเรียนรู้ กรุณาเลือกภาษาก่อนส่งรูปภาพนะครับ:',
      quickReply: buildLanguageQuickReply()
    });
  }

  const targetLang = user.lang;
  const langInfo = getLanguageInfo(targetLang);

  showLoading(userId).catch(() => {});

  try {
    console.log('📸 เริ่มประมวลผลรูปภาพ ID:', messageId);

    const imageBuffer = await fetchImageBuffer(messageId);
    const mimeType = 'image/jpeg';
    const result = await analyzeImage(imageBuffer, mimeType, targetLang);

    if (!result || result.detected_lang === 'none' || !result.items || result.items.length === 0) {
      return await replyLine(replyToken, {
        type: 'text',
        text: '🔍 ไม่พบข้อความหรือตัวอักษรที่ชัดเจนในรูปภาพนี้ครับ ลองถ่ายรูปใหม่อีกครั้งนะครับ 📸'
      });
    }

    const scanId = `scan_${Date.now()}`;
    await savePending(scanId, userId, targetLang, result.items);
    console.log('💾 บันทึก Pending สำเร็จ ScanID:', scanId);

    const flexMessage = buildResultFlex(result, scanId, langInfo);

    // 6) กรณีที่ Gemini แจ้งว่าภาษาในรูปไม่ตรงกับภาษาที่เลือก (Language Mismatch)
    if (result.languageMismatch && result.detected_lang && LANGUAGES[result.detected_lang]) {
      const detectedInfo = getLanguageInfo(result.detected_lang);
      return await replyLine(replyToken, [
        flexMessage,
        {
          type: 'text',
          text: `💡 รูปนี้ดูเหมือนจะเป็นภาษา ${detectedInfo.flag} ${detectedInfo.name}\nคุณต้องการสลับเป็นภาษานี้ แล้วสแกนใหม่อีกครั้งไหมครับ?`,
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'postback',
                  label: `สลับเป็น ${detectedInfo.flag} ${detectedInfo.name}`,
                  data: `action=rescan_lang&lang=${detectedInfo.code}&msgId=${messageId}`,
                  displayText: `สลับเป็นภาษา ${detectedInfo.flag} ${detectedInfo.name} และสแกนใหม่`
                }
              },
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: `ใช้ภาษา ${langInfo.name} ต่อ`,
                  text: 'ใช้ภาษาเดิมต่อ'
                }
              }
            ]
          }
        }
      ]);
    }

    return await replyLine(replyToken, flexMessage);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ:', error);
    return await replyLine(replyToken, {
      type: 'text',
      text: 'ขออภัยครับ เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพชั่วคราว 😅 กรุณาลองส่งรูปใหม่อีกครั้งนะครับ'
    });
  }
}

/**
 * 2) & 6) จัดการ Postback Events ทั้งหมด
 */
export async function handlePostback(event, client) {
  const replyToken = event.replyToken;
  const currentUserId = event.source?.userId;
  const data = event.postback?.data || '';
  console.log('📌 [Postback Received] Raw Data:', data);

  try {
    const params = new URLSearchParams(data);
    const action = params.get('action');

    // 2) ตั้งค่าภาษาของผู้ใช้ (setlang)
    if (action === 'setlang') {
      const langCode = params.get('lang') || 'ja';
      await upsertUser(currentUserId, langCode);

      const langInfo = getLanguageInfo(langCode);
      return await replyLine(replyToken, {
        type: 'text',
        text: `✅ ตั้งภาษาเป็น ${langInfo.flag} ${langInfo.name} เรียบร้อยแล้ว!\n\nส่งรูปภาพป้าย เมนู หรือฉลากสินค้าเข้ามาสแกนได้เลยครับ 📸`
      });
    }

    // 6) กรณีผู้ใช้กดเลือก "สลับภาษาและสแกนรูปภาพเดิมซ้ำ"
    if (action === 'rescan_lang') {
      const newLang = params.get('lang');
      const msgId = params.get('msgId');

      if (!newLang || !msgId) return;

      // อัปเดตภาษาใหม่ให้ผู้ใช้
      await upsertUser(currentUserId, newLang);
      const newLangInfo = getLanguageInfo(newLang);

      showLoading(currentUserId).catch(() => {});

      // นำรูปภาพเดิมมาวิเคราะห์ใหม่ด้วยภาษาใหม่
      const imageBuffer = await fetchImageBuffer(msgId);
      const result = await analyzeImage(imageBuffer, 'image/jpeg', newLang);

      const scanId = `scan_${Date.now()}`;
      await savePending(scanId, currentUserId, newLang, result.items);

      const flexMessage = buildResultFlex(result, scanId, newLangInfo);
      return await replyLine(replyToken, [
        {
          type: 'text',
          text: `🔄 สลับเป็นภาษา ${newLangInfo.flag} ${newLangInfo.name} และสแกนใหม่เรียบร้อยแล้ว!`
        },
        flexMessage
      ]);
    }

    // บันทึกคำศัพท์ลงสมุดคำศัพท์ (save_vocab)
    if (action === 'save_vocab' || action === 'save') {
      const scanId = params.get('scanId') || params.get('scan');

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
      text: 'เกิดข้อผิดพลาดในการทำรายการชั่วคราว กรุณาลองใหม่อีกครั้งครับ'
    });
  }
}