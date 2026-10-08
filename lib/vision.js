import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * แปลง Buffer ให้เป็น inlineData สำหรับ Gemini
 */
function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType: mimeType || 'image/jpeg'
    }
  };
}

/**
 * ฟังก์ชัน Retry กรณีเจอ Error 503 / 429 (จำกัดเวลาเพื่อไม่ให้เกิน 30s Timeout ของ Vercel)
 */
async function callWithRetry(fn, retries = 2, delayMs = 1200) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isOverloaded = error.message?.includes('503') || error.message?.includes('429');
      if (isOverloaded && i < retries - 1) {
        console.warn(`⚠️ Gemini API หนาแน่น (ลองใหม่อีกครั้งรอบที่ ${i + 1}/${retries})...`);
        await new Promise((res) => setTimeout(res, delayMs));
        delayMs *= 1.5;
      } else {
        throw error;
      }
    }
  }
}

/**
 * วิเคราะห์รูปภาพและสกัดคำศัพท์ด้วย Gemini Vision
 */
export async function analyzeImage(imageBuffer, mimeType = 'image/jpeg', targetLang = 'ja') {
  if (!apiKey) {
    throw new Error('❌ Missing GEMINI_API_KEY in environment variables');
  }

  // ใช้ gemini-3.1-flash-lite
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const prompt = `
  คุณคือผู้เชี่ยวชาญด้านการแปลภาษาเพื่อการท่องเที่ยว
  โปรดวิเคราะห์ข้อความหรือป้ายในรูปภาพนี้ และตอบกลับเป็น JSON Structure ดังต่อไปนี้เท่านั้น:
  {
    "detected_lang": "${targetLang}",
    "title": "หัวข้อหรือประเภทของป้าย/เมนู (ภาษาไทย)",
    "description": "คำอธิบายบริบทของภาพสั้นๆ (ภาษาไทย)",
    "items": [
      {
        "original": "ข้อความต้นฉบับภาษาต่างประเทศ",
        "reading": "คำอ่านภาษาญี่ปุ่น/จีน/เกาหลี (ถ้ามี)",
        "thai_sound": "คำอ่านภาษาไทยแบบทับศัพท์",
        "translation": "คำแปลภาษาไทย"
      }
    ]
  }

  หากในรูปภาพไม่มีข้อความหรือตัวอักษร ให้ตั้งค่า "detected_lang": "none" และ "items": []
  `;

  const imagePart = bufferToGenerativePart(imageBuffer, mimeType);

  try {
    console.log(`🔍 กำลังวิเคราะห์รูปภาพด้วย Gemini (gemini-3.1-flash-lite)...`);

    const responseText = await callWithRetry(async () => {
      const result = await model.generateContent([prompt, imagePart]);
      return result.response.text();
    }, 2, 1200);

    const cleanedJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedJson);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการวิเคราะห์ด้วย Gemini:', error.message);
    throw error;
  }
}