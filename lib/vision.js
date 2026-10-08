import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * แปลง Buffer ให้เป็นโครงสร้างข้อมูล inlineData ของ Gemini API
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
 * ฟังก์ชัน Retry อัตโนมัติกรณีเจอ Error 503 / 429 จาก Gemini API
 */
async function callGeminiWithRetry(fn, retries = 3, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isOverloaded = error.message?.includes('503') || error.message?.includes('429');
      if (isOverloaded && i < retries - 1) {
        console.warn(`⚠️ Gemini API หนาแน่น (ลองใหม่อีกครั้งใน ${delayMs}ms - รอบที่ ${i + 1}/${retries})...`);
        await new Promise((res) => setTimeout(res, delayMs));
        delayMs *= 2; // เพิ่มเวลาถอยแบบ Exponential Backoff
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

  // ใช้โมเดล gemini-2.5-flash หรือ gemini-1.5-flash ที่มีความเสถียรสูง
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
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
    console.log(`🔍 กำลังวิเคราะห์รูปภาพด้วย Gemini...`);

    const responseText = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([prompt, imagePart]);
      return result.response.text();
    });

    // Clean JSON Response
    const cleanedJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedJson);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการวิเคราะห์ด้วย Gemini:', error.message);
    throw error;
  }
}