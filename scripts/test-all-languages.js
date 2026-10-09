import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeImage } from '../lib/vision.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_IMAGES_DIR = path.join(__dirname, '..', 'test-images');
const OUTPUT_FILE = path.join(__dirname, '..', 'results.md');

// ระยะเวลาหน่วงระหว่างการสแกนแต่ละรูป (3 วินาที เพื่อป้องกัน Rate Limit)
const DELAY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ดึง MIME Type จากนามสกุลไฟล์
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/jpeg';
}

async function runAllLanguageTests() {
  console.log('🚀 เริ่มต้นการทดสอบประมวลผลรูปภาพทุกภาษา...\n');

  if (!fs.existsSync(TEST_IMAGES_DIR)) {
    console.error(`❌ ไม่พบโฟลเดอร์: ${TEST_IMAGES_DIR}`);
    console.log('💡 กรุณาสร้างโฟลเดอร์ test-images/<langCode>/ และวางรูปภาพทดสอบไว้ด้านใน');
    process.exit(1);
  }

  // อ่านโฟลเดอร์ภาษาทั้งหมดใน test-images/
  const langFolders = fs.readdirSync(TEST_IMAGES_DIR).filter((item) => {
    const itemPath = path.join(TEST_IMAGES_DIR, item);
    return fs.statSync(itemPath).isDirectory();
  });

  if (langFolders.length === 0) {
    console.log('⚠️ ไม่พบโฟลเดอร์ภาษาใน test-images/');
    return;
  }

  const results = [];
  const langSummary = {}; // สรุปผลรายภาษา { lang: { total: 0, passed: 0 } }

  for (const langCode of langFolders) {
    const folderPath = path.join(TEST_IMAGES_DIR, langCode);
    const files = fs.readdirSync(folderPath).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png'].includes(ext);
    });

    if (!langSummary[langCode]) {
      langSummary[langCode] = { total: 0, passed: 0 };
    }

    if (files.length === 0) {
      console.log(`📁 โฟลเดอร์ [${langCode}] ไม่มีรูปภาพทดสอบ`);
      continue;
    }

    console.log(`📂 กำลังทดสอบภาษา [${langCode}] (${files.length} รูป)...`);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const relativeFilePath = path.join(langCode, file);
      const mimeType = getMimeType(file);

      console.log(`  🔍 วิเคราะห์: ${relativeFilePath}...`);
      langSummary[langCode].total += 1;

      const startTime = Date.now();
      let isValidJson = false;
      let wordCount = 0;
      let isLangMatch = false;
      let durationSec = '0.00';
      let unclearCount = 0;
      let note = '';

      try {
        const buffer = fs.readFileSync(filePath);
        const result = await analyzeImage(buffer, mimeType, langCode);
        const endTime = Date.now();
        durationSec = ((endTime - startTime) / 1000).toFixed(2);

        // 1. ตรวจสอบว่าได้ออบเจกต์ JSON หรือไม่
        isValidJson = Boolean(result && typeof result === 'object');

        // 2. ดึงจำนวนคำศัพท์
        const items = Array.isArray(result?.items) ? result.items : [];
        wordCount = items.length;

        // 3. ตรวจสอบว่าภาษาตรงกันหรือไม่
        const detectedLang = String(result?.detected_lang || '').toLowerCase();
        isLangMatch = detectedLang === langCode.toLowerCase() || result?.languageMismatch === false;

        // 4. ตรวจสอบจำนวนข้อความอ่านไม่ชัด (unclear)
        const unclear = result?.unclear || result?.unclear_text || '';
        if (typeof unclear === 'string' && unclear.trim().length > 0) {
          unclearCount = 1;
        } else if (Array.isArray(unclear)) {
          unclearCount = unclear.length;
        }

        // เกณฑ์การผ่าน: JSON ถูกต้อง + detected_lang ตรง + มีคำอย่างน้อย 1 คำ
        if (isValidJson && isLangMatch && wordCount >= 1) {
          langSummary[langCode].passed += 1;
        }

        results.push({
          lang: langCode,
          file: relativeFilePath,
          validJson: isValidJson ? '✅' : '❌',
          wordCount,
          langMatch: isLangMatch ? '✅' : '❌',
          duration: durationSec,
          unclearCount,
          manualCheck: '' // เว้นว่างไว้ให้ตรวจเอง
        });

        console.log(`     ✅ สำเร็จใน ${durationSec}s | พบ ${wordCount} คำ | ภาษาตรง: ${isLangMatch ? 'ใช่' : 'ไม่'}`);

      } catch (err) {
        const endTime = Date.now();
        durationSec = ((endTime - startTime) / 1000).toFixed(2);
        const errorMsg = err.message || 'Unknown Error';

        results.push({
          lang: langCode,
          file: relativeFilePath,
          validJson: '❌',
          wordCount: 0,
          langMatch: '❌',
          duration: durationSec,
          unclearCount: 0,
          manualCheck: `Error: ${errorMsg}`
        });

        console.error(`     ❌ เกิดข้อผิดพลาด (${durationSec}s): ${errorMsg}`);
      }

      // หน่วงเวลา 3 วินาทีระหว่างแต่ละรูป
      console.log(`     ⏳ รอ ${DELAY_MS / 1000} วินาที...`);
      await sleep(DELAY_MS);
    }
  }

  // ----------------------------------------------------------------------
  // สร้างเนื้อหาไฟล์ results.md
  // ----------------------------------------------------------------------
  let mdContent = `# 📊 ผลการทดสอบการสแกนแปลภาษาทุกภาษา\n\n`;
  mdContent += `*ทดสอบเมื่อ: ${new Date().toLocaleString('th-TH')}*\n\n`;

  mdContent += `## 📝 รายละเอียดการทดสอบรายรูป\n\n`;
  mdContent += `| ภาษา | ไฟล์ | JSON ถูกต้อง | จำนวนคำ | detected_lang ตรงไหม | เวลา(วินาที) | จำนวน unclear | ตรวจความถูกต้องของคำแปล |\n`;
  mdContent += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

  for (const r of results) {
    mdContent += `| ${r.lang} | \`${r.file}\` | ${r.validJson} | ${r.wordCount} | ${r.langMatch} | ${r.duration} | ${r.unclearCount} | ${r.manualCheck} |\n`;
  }

  mdContent += `\n---\n\n`;
  mdContent += `## 📈 สรุปผลการทดสอบแยกตามภาษา\n\n`;
  mdContent += `> **เกณฑ์การผ่าน:** JSON ถูกต้อง + detected_lang ตรงกับภาษาเป้าหมาย + สกัดคำศัพท์ได้อย่างน้อย 1 คำ\n\n`;
  mdContent += `| ภาษา | จำนวนที่ผ่าน / ทั้งหมด | อัตราผ่าน (Pass Rate) | สถานะ |\n`;
  mdContent += `| :--- | :---: | :---: | :---: |\n`;

  for (const [lang, stat] of Object.entries(langSummary)) {
    const rate = stat.total > 0 ? ((stat.passed / stat.total) * 100).toFixed(1) : '0.0';
    let status = '🔴 ไม่ผ่าน';
    if (stat.passed === stat.total && stat.total > 0) {
      status = '🟢 ผ่านทั้งหมด';
    } else if (stat.passed > 0) {
      status = '🟡 ผ่านบางส่วน';
    }

    mdContent += `| ${lang} | ${stat.passed} / ${stat.total} | ${rate}% | ${status} |\n`;
  }

  fs.writeFileSync(OUTPUT_FILE, mdContent, 'utf-8');
  console.log(`\n🎉 ทำการทดสอบเสร็จสิ้น! บันทึกรายงานไว้ที่: ${OUTPUT_FILE}`);
}

runAllLanguageTests();
