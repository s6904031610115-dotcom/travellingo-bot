import 'dotenv/config';
import { savePending, getPending, addVocab, getDueVocab } from '../lib/sheets.js';

async function runTest() {
  console.log('🧪 เริ่มทดสอบการทำงานของ Google Sheets API...\n');

  const testUserId = 'test_user_demo_01';
  const testLang = 'ja';
  const testItems = [
    {
      original: '準備中',
      reading: 'じゅんびちゅう',
      thai_sound: 'จุนบิจู',
      translation: 'กำลังเตรียมร้าน',
      note: 'พบหน้าร้านค้า'
    },
    {
      original: 'ようこそ',
      reading: 'Youkoso',
      thai_sound: 'โยโคโสะ',
      translation: 'ยินดีต้อนรับ',
      note: 'ข้อความต้อนรับ'
    }
  ];

  try {
    // 1. ทดสอบ savePending
    console.log('1️⃣ ทดสอบ savePending...');
    const scanId = await savePending(testUserId, testLang, testItems);
    console.log(`✅ บันทึก Pending สำเร็จ! scanId: ${scanId}\n`);

    // 2. ทดสอบ getPending
    console.log('2️⃣ ทดสอบ getPending...');
    const pendingData = await getPending(scanId);
    console.log('✅ ดึงข้อมูล Pending สำเร็จ:', pendingData, '\n');

    // 3. ทดสอบ addVocab
    console.log('3️⃣ ทดสอบ addVocab...');
    const result = await addVocab(pendingData.userId, pendingData.lang, pendingData.items, 'สคริปต์ทดสอบ');
    console.log(`✅ เพิ่มคำศัพท์สำเร็จ! เพิ่มใหม่: ${result.added} คำ, ซ้ำ: ${result.duplicate} คำ\n`);

    // 4. ทดสอบ getDueVocab
    console.log('4️⃣ ทดสอบ getDueVocab...');
    const dueItems = await getDueVocab(testUserId, testLang, 5);
    console.log(`✅ ดึงรายการที่ค้างทบทวนสำเร็จ (${dueItems.length} คำ):`);
    console.dir(dueItems, { depth: null });

    console.log('\n🎉 ทดสอบทุกฟังก์ชันเรียบร้อยแล้ว!');
  } catch (error) {
    console.error('\n❌ การทดสอบล้มเหลว:', error);
  }
}

runTest();