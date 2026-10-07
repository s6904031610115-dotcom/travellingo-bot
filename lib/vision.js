// lib/vision.js
// โมดูลสแกนรูปภาพและสกัดคำศัพท์ด้วย Gemini AI Vision API

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getLanguage } from '../config/languages.js';

const apiKey = process.env.GEMINI_API_KEY || '';
const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const genAI = new GoogleGenerativeAI(apiKey);

const SYSTEM_PROMPT_TEMPLATE = `คุณเป็นครูสอนภาษา {{LANG_NAME}} สำหรับคนไทยที่เดินทางหรือเรียนภาษา
ผู้ใช้ส่งรูปป้าย เมนู ฉลาก หรือข้อความมา งานของคุณ:
1. ระบุประเภทของรูปใน field type (เมนูอาหาร / ป้ายบอกทาง / ป้ายเตือนห้าม / ฉลากสินค้า / อื่นๆ)
2. เขียน summary_th: สรุปภาษาไทย 1-2 ประโยคว่ารูปนี้บอกอะไร
3. ตรวจว่าข้อความหลักในรูปเป็นภาษาอะไร ใส่รหัสใน detected_lang
   (ja, ko, zh, en, vi, fr, de, es, it, id หรือ "mixed" ถ้าปนกัน หรือ "none" ถ้าไม่มีตัวอักษร)
4. เลือกคำศัพท์ภาษา {{LANG_NAME}} ที่มีประโยชน์ที่สุดสูงสุด 8 คำ
   ข้ามภาษาอื่นที่ปนอยู่ ข้ามคำที่ซ้ำหรือไม่สำคัญ
5. แต่ละคำใส่:
   - word: คำตามที่เขียนในรูป
   - reading: {{READING_RULE}}
   - thai_sound: คำอ่านออกเสียงด้วยอักษรไทยโดยประมาณ (ใส่เฉพาะเมื่อจำเป็น ไม่งั้นเป็นสตริงว่าง)
   - meaning_th: ความหมายภาษาไทยสั้นกระชับ
   - note: ข้อควรรู้สั้นๆ เช่น วัตถุดิบที่คนแพ้บ่อย (ถั่ว นม กุ้ง) / เป็นป้ายห้าม / ราคา (ไม่มีให้เว้นว่าง)
   - important: true ถ้าเกี่ยวกับความปลอดภัย ข้อห้าม หรือสารก่อภูมิแพ้
6. ถ้ามีส่วนที่อ่านไม่ชัด ห้ามเดา ให้ใส่ข้อความอธิบายสั้นๆ ใน array unclear
ตอบเป็น JSON เท่านั้น ตามรูปแบบ:
{"type":"","summary_th":"","detected_lang":"","items":[{"word":"","reading":"","thai_sound":"","meaning_th":"","note":"","important":false}],"unclear":[]}`;

/**
 * ฟังก์ชันช่วยหยุดรอเวลา (ms)
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * แปลง Buffer รูปภาพเป็น Object รูปแบบ Inline Data สำหรับ Gemini API
 */
function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType
    }
  };
}

/**
 * เรียก Gemini API พร้อมจัดการ Retry กรณีติด Rate limit (429) หรือ Server Unavailable (503)
 */
async function callGeminiApiWithRetry(model, prompt, imagePart) {
  try {
    return await model.generateContent([prompt, imagePart]);
  } catch (error) {
    const errorMsg = error?.message || '';
    const isRetryable =
      errorMsg.includes('429') ||
      errorMsg.includes('503') ||
      error?.status === 429 ||
      error?.status === 503 ||
      errorMsg.toLowerCase().includes('resource_exhausted') ||
      errorMsg.toLowerCase().includes('unavailable');

    if (isRetryable) {
      console.warn('⚠️ เซิร์ฟเวอร์ยุ่งชั่วคราวหรือติด Rate limit กำลังรอ 2 วินาทีแล้วลองใหม่อีกครั้ง...');
      await sleep(2000);
      return await model.generateContent([prompt, imagePart]);
    }
    throw error;
  }
}

/**
 * วิเคราะห์รูปภาพ สกัดคำศัพท์ และสรุปความหมาย
 * @param {Buffer} imageBuffer - Buffer ของไฟล์รูปภาพ
 * @param {string} mimeType - ชนิดรูปภาพ เช่น 'image/jpeg'
 * @param {string} langCode - รหัสภาษาเป้าหมาย
 */
export async function analyzeImage(imageBuffer, mimeType = 'image/jpeg', langCode = 'en') {
  if (!apiKey) {
    throw new Error('ไม่พบ GEMINI_API_KEY ในระบบ กรุณาตรวจสอบการตั้งค่า Environment Variables');
  }

  const langInfo = getLanguage(langCode);

  // แทนค่าตัวแปรลงใน Prompt Template
  const prompt = SYSTEM_PROMPT_TEMPLATE
    .replace(/{{LANG_NAME}}/g, langInfo.name_th)
    .replace(/{{READING_RULE}}/g, langInfo.reading_rule);

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2
    }
  });

  const imagePart = bufferToGenerativePart(imageBuffer, mimeType);

  let rawResponseText = '';
  let parsedData = null;

  // ลองเรียก API และ Parse JSON หากล้มเหลวจะลองใหม่ 1 ครั้ง (รวมสูงสุด 2 รอบ)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await callGeminiApiWithRetry(model, prompt, imagePart);
      rawResponseText = result.response.text();
      parsedData = JSON.parse(rawResponseText);
      break;
    } catch (err) {
      console.error(`❌ Parse JSON ไม่สำเร็จ (รอบที่ ${attempt}):`, err?.message || err);
      if (attempt === 2) {
        throw new Error('ไม่สามารถประมวลผลข้อมูลจากรูปภาพได้ กรุณาลองส่งรูปภาพใหม่อีกครั้ง');
      }
    }
  }

  // ตรวจสอบข้อมูลคำศัพท์ สกัดคำซ้ำ จำกัดไม่เกิน 8 คำ และเติมค่าเริ่มต้น
  const rawItems = Array.isArray(parsedData.items) ? parsedData.items : [];
  const seenWords = new Set();
  const sanitizedItems = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;

    const word = (item.word || '').trim();
    if (!word) continue;

    const lowerWord = word.toLowerCase();
    if (seenWords.has(lowerWord)) continue;
    seenWords.add(lowerWord);

    sanitizedItems.push({
      word,
      reading: (item.reading || '').trim(),
      thai_sound: (item.thai_sound || '').trim(),
      meaning_th: (item.meaning_th || '').trim(),
      note: (item.note || '').trim(),
      important: Boolean(item.important)
    });

    if (sanitizedItems.length >= 8) break;
  }

  const detectedLang = (parsedData.detected_lang || 'none').toLowerCase().trim();

  // เช็กว่าภาษาที่ตรวจพบไม่ตรงกับภาษาที่เลือกหรือไม่
  const languageMismatch =
    detectedLang !== langCode &&
    detectedLang !== 'mixed' &&
    detectedLang !== 'none';

  return {
    type: parsedData.type || 'อื่นๆ',
    summary_th: parsedData.summary_th || 'ไม่สามารถสรุปความหมายได้',
    detected_lang: detectedLang,
    items: sanitizedItems,
    unclear: Array.isArray(parsedData.unclear) ? parsedData.unclear : [],
    languageMismatch
  };
}
