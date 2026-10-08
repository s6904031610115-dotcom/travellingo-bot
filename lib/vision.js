import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * แปลง Buffer เป็น inlineData
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
 * กำหนดเวลาทำงานสูงสุด (Timeout) เพื่อป้องกัน Vercel 30s Timeout Error
 */
function withTimeout(promise, ms = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Gemini API ตอบสนองช้าเกิน ${ms / 1000} วินาที`));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * วิเคราะห์รูปภาพและสกัดคำศัพท์ด้วย Gemini Vision
 */
export async function analyzeImage(imageBuffer, mimeType = 'image/jpeg', targetLang = 'ja') {
  if (!apiKey) {
    throw new Error('❌ Missing GEMINI_API_KEY in environment variables');
  }

  // ใช้ gemini-1.5-flash โมเดลมาตรฐาน ความเร็วสูงและมีความเสถียรสำหรับงานประมวลผลภาพ
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
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

    // จำกัดเวลาเรียก Gemini ไม่ให้เกิน 12 วินาที
    const responseText = await withTimeout(
      (async () => {
        const result = await model.generateContent([prompt, imagePart]);
        return result.response.text();
      })(),
      12000
    );

    const cleanedJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedJson);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการวิเคราะห์ด้วย Gemini:', error.message);
    throw error;
  }
}