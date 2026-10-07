// scripts/test-vision.js
// สคริปต์สำหรับทดสอบรันการวิเคราะห์รูปภาพบนเครื่อง Local

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { analyzeImage } from '../lib/vision.js';

async function runTest() {
  const args = process.argv.slice(2);
  const imagePath = args[0];
  const langCode = args[1] || 'ja';

  if (!imagePath) {
    console.log('📌 วิธีใช้งาน: node scripts/test-vision.js <พาธรูปภาพ> [langCode]');
    console.log('💡 ตัวอย่าง: node scripts/test-vision.js ./test-image.jpg ja');
    process.exit(1);
  }

  const absolutePath = path.resolve(imagePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ ไม่พบไฟล์รูปภาพที่: ${absolutePath}`);
    process.exit(1);
  }

  console.log(`🔍 กำลังวิเคราะห์รูปภาพ: ${path.basename(absolutePath)} (ภาษาเป้าหมาย: ${langCode})...`);

  const startTime = Date.now();

  try {
    const imageBuffer = fs.readFileSync(absolutePath);

    // ระบุ MIME Type ตามนามสกุลไฟล์
    const ext = path.extname(absolutePath).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    if (ext === '.webp') mimeType = 'image/webp';

    const result = await analyzeImage(imageBuffer, mimeType, langCode);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n========================================');
    console.log(`✅ ผลการวิเคราะห์ภาพสำเร็จ (ใช้เวลา ${duration} วินาที)`);
    console.log('========================================');
    console.log(`📌 ประเภทภาพ: ${result.type}`);
    console.log(`📝 สรุปความหมาย: ${result.summary_th}`);
    console.log(`🌐 ภาษาที่ตรวจพบ: ${result.detected_lang}`);
    console.log(`⚠️ ภาษาไม่ตรงกับที่เลือก: ${result.languageMismatch ? 'ใช่ (Mismatch)' : 'ไม่ (ตรงกัน)'}`);
    console.log(`❓ ส่วนที่ไม่ชัดเจน: ${result.unclear.length > 0 ? result.unclear.join(', ') : 'ไม่มี'}`);
    console.log('----------------------------------------');
    console.log(`📚 รายการคำศัพท์ที่สกัดได้ (${result.items.length} คำ):`);

    result.items.forEach((item, index) => {
      console.log(`\n ${index + 1}. ${item.word} ${item.reading ? `(${item.reading})` : ''}`);
      if (item.thai_sound) console.log(`    คำอ่านไทย: ${item.thai_sound}`);
      console.log(`    คำแปล: ${item.meaning_th}`);
      if (item.note) console.log(`    หมายเหตุ: ${item.note}`);
      if (item.important) console.log(`    ⚠️ คำสำคัญ/ข้อควรระวัง!`);
    });

    console.log('========================================\n');
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n❌ เกิดข้อผิดพลาด (ใช้เวลา ${duration} วินาที):`, error.message || error);
  }
}

runTest();