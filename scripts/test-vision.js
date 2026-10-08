import { analyzeImage } from '../lib/vision.js';
import fs from 'fs';

async function test() {
  try {
    const imagePath = process.argv[2] || './sample.jpg';
    const lang = process.argv[3] || 'ja';
    console.log(`🔍 กำลังวิเคราะห์รูปภาพ: ${imagePath} (${lang})...`);
    
    const buffer = fs.readFileSync(imagePath);
    const result = await analyzeImage(buffer, 'image/jpeg', lang);
    
    console.log('✅ ผลการวิเคราะห์สำเร็จ:\n', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', err.message);
  }
}

test();