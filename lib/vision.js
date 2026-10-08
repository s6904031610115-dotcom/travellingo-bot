import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * แปลง Buffer ให้เป็นโครงสร้าง inlineData สำหรับ Gemini
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
 * วิเคราะห์รูปภาพด้วย Gemini API พร้อมระบบ Fallback สลับโมเดล
 */
export async function analyzeImage(imageBuffer, mimeType = 'image/jpeg', targetLang = 'ja') {
  if (!apiKey) {
    throw new Error('❌ Missing GEMINI_API_KEY in environment variables');
  }

  // รายชื่อโมเดลที่ใช้ลองตามลำดับ
  const candidateModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];
  
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
  let responseText = null;
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`🔍 กำลังวิเคราะห์รูปภาพด้วย Gemini (${modelName})...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      const result = await model.generateContent([prompt, imagePart]);
      responseText = result.response.text();
      if (responseText) break; // สแกนสำเร็จ ออกจากลูปทันที
    } catch (error) {
      console.warn(`⚠️ โมเดล ${modelName} ไม่พร้อมใช้งาน:`, error.message);
      lastError = error;
    }
  }

  if (!responseText) {
    throw lastError || new Error('❌ ไม่สามารถเรียกใช้งาน Gemini API ได้ทุกโมเดล');
  }

  // Clean JSON Response
  const cleanedJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleanedJson);
}