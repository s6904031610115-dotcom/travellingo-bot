import { GoogleGenerativeAI } from '@google/generative-ai';
import { getLanguageInfo } from '../config/languages.js';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

/**
 * วิเคราะห์รูปภาพด้วย Gemini Vision
 */
export async function analyzeImage(imageBuffer, mimeType = 'image/jpeg', targetLang = 'ja') {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables');
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const langInfo = getLanguageInfo(targetLang);

  const prompt = `
  คุณคือระบบ AI ผู้ช่วยแปลภาษาสำหรับการเดินทาง
  โปรดวิเคราะห์ข้อความภาษาต่างประเทศในรูปภาพนี้

  ภาษาเป้าหมายที่คาดหวัง: ${targetLang} (${langInfo.name})

  กรุณาตอบกลับเป็น JSON เท่านั้นในรูปแบบนี้:
  {
    "image_type": "ประเภทภาพ (เช่น ป้ายบอกสถานะร้านค้า, เมนูอาหาร, ฉลากสินค้า)",
    "overall_summary": "สรุปเนื้อหาหลักของภาพเป็นภาษาไทย 1-2 ประโยค",
    "detected_lang": "${targetLang}",
    "is_lang_match": true,
    "items": [
      {
        "original": "ข้อความภาษาต่างประเทศต้นฉบับ",
        "reading": "คำอ่านโรมาจิ/พินอิน/การออกเสียง",
        "thai_reading": "คำอ่านออกเสียงภาษาไทย",
        "translation": "คำแปลภาษาไทย"
      }
    ]
  }
  `;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType
    }
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  let text = response.text().trim();

  if (text.startsWith('```')) {
    text = text.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  let parsed = {};
  try {
    parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      parsed = parsed[0] || {};
    }
  } catch (parseErr) {
    console.error('❌ ไม่สามารถแปลง JSON จาก Gemini ได้:', text);
    throw new Error('Invalid JSON format returned from Gemini Vision');
  }

  // ดึงรายการคำศัพท์
  const rawItems = parsed.items || parsed.vocabulary || parsed.words || [];
  const safeItems = Array.isArray(rawItems) ? rawItems : [];

  const normalizedItems = safeItems.map(item => ({
    original: item.original || item.word || item.text || '',
    reading: item.reading || item.romaji || item.pronunciation || '',
    thaiReading: item.thai_reading || item.thaiReading || item.reading_th || '',
    thai_reading: item.thai_reading || item.thaiReading || item.reading_th || '',
    translation: item.translation || item.meaning || item.meaning_th || item.thai || ''
  }));

  const imageTypeVal = parsed.image_type || parsed.imageType || 'ภาพทั่วไป';
  const summaryVal = parsed.overall_summary || parsed.summary || 'วิเคราะห์ภาพสำเร็จ';
  const detectedLangVal = parsed.detected_lang || parsed.detectedLang || targetLang;
  const isLangMatchVal = typeof parsed.is_lang_match === 'boolean' 
    ? parsed.is_lang_match 
    : (typeof parsed.isLangMatch === 'boolean' ? parsed.isLangMatch : true);

  // ส่งคืนข้อมูลพร้อมชื่อ Key ทั้ง camelCase และ snake_case
  return {
    imageType: imageTypeVal,
    image_type: imageTypeVal,
    summary: summaryVal,
    overall_summary: summaryVal,
    overallSummary: summaryVal,
    detectedLang: detectedLangVal,
    detected_lang: detectedLangVal,
    isLangMatch: isLangMatchVal,
    is_lang_match: isLangMatchVal,
    vocabulary: normalizedItems,
    items: normalizedItems
  };
}