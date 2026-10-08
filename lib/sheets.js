import { google } from 'googleapis';

/**
 * เชื่อมต่อ Google Sheets API ด้วย Service Account
 */
function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.SHEET_ID;

  if (!email || !privateKey || !spreadsheetId) {
    throw new Error('❌ Missing credentials! กรุณาตั้งค่า GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY และ SHEET_ID ใน env');
  }

  // แปลง \n ใน private key ให้เป็นบรรทัดใหม่จริง
  privateKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT(
    email,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, spreadsheetId };
}

/**
 * จัดการและแสดงข้อความ Error
 */
function handleSheetsError(error) {
  if (error.code === 403 || (error.response && error.response.status === 403)) {
    console.error('❌ Google Sheets API Error (403 Forbidden): กรุณาตรวจสอบว่าได้ Share Google Sheet ให้กับ Service Account Email เรียบร้อยแล้วหรือยัง');
  } else if (error.code === 404 || (error.response && error.response.status === 404)) {
    console.error('❌ Google Sheets API Error (404 Not Found): ไม่พบ SHEET_ID ที่ระบุใน env');
  } else {
    console.error('❌ Google Sheets API Error:', error.message || error);
  }
  throw error;
}

/**
 * ดึงข้อมูลทั้งแท็บครั้งเดียวเพื่อลดการเรียก API (Quota Optimization)
 */
async function getTabRows(tabName) {
  try {
    const { sheets, spreadsheetId } = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A1:Z`,
    });

    const rows = res.data.values || [];
    if (rows.length < 1) return { headers: [], data: [] };

    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => {
      const obj = { _rowIndex: index + 2 }; // แถวใน Sheet เริ่มที่ 1 (แถว 1 คือ Header)
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex] !== undefined ? row[colIndex] : '';
      });
      return obj;
    });

    return { headers, data };
  } catch (error) {
    handleSheetsError(error);
  }
}

/**
 * เพิ่มข้อมูลต่อท้ายแท็บ (Append)
 */
async function appendRow(tabName, rowValues) {
  try {
    const { sheets, spreadsheetId } = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: Array.isArray(rowValues[0]) ? rowValues : [rowValues],
      },
    });
  } catch (error) {
    handleSheetsError(error);
  }
}

/**
 * อัปเดตข้อมูลแถวที่กำหนด
 */
async function updateRow(tabName, rowIndex, rowValues) {
  try {
    const { sheets, spreadsheetId } = getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowValues],
      },
    });
  } catch (error) {
    handleSheetsError(error);
  }
}

/**
 * เขียนทับทั้งแท็บ (สำหรับ Cleanup)
 */
async function clearAndSetTab(tabName, headers, dataRows) {
  try {
    const { sheets, spreadsheetId } = getSheetsClient();
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${tabName}!A1:Z`,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers, ...dataRows],
      },
    });
  } catch (error) {
    handleSheetsError(error);
  }
}

/* ==========================================================================
   USERS API
   ========================================================================== */

export async function getUser(userId) {
  const { data } = await getTabRows('Users');
  const user = data.find((r) => r.userId === userId);
  return user ? { userId: user.userId, lang: user.lang, updatedAt: user.updatedAt } : null;
}

export async function upsertUser(userId, lang) {
  const { data } = await getTabRows('Users');
  const existing = data.find((r) => r.userId === userId);
  const now = new Date().toISOString();

  if (existing) {
    await updateRow('Users', existing._rowIndex, [userId, lang, now]);
  } else {
    await appendRow('Users', [userId, lang, now]);
  }
  return { userId, lang };
}

export async function getAllUsers() {
  const { data } = await getTabRows('Users');
  return data.map((r) => ({ userId: r.userId, lang: r.lang }));
}

/* ==========================================================================
   PENDING SCAN API
   ========================================================================== */

export async function savePending(userId, lang, items) {
  const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();
  await appendRow('Pending', [scanId, userId, lang, JSON.stringify(items), now]);
  return scanId; // ส่ง scanId กลับออกไปใช้สร้าง Flex Message
}

export async function getPending(scanId) {
  const { data } = await getTabRows('Pending');
  const pending = data.find((r) => r.scanId === scanId);
  if (!pending) return null;

  try {
    // รองรับทั้งหัวคอลัมน์ชื่อ items และ itemsJson
    const rawItems = pending.items || pending.itemsJson || '[]';
    const items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
    return { userId: pending.userId, lang: pending.lang, items };
  } catch (e) {
    console.error('❌ Error parsing pending items:', e);
    return null;
  }
}

export async function cleanupPending() {
  const { headers, data } = await getTabRows('Pending');
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  const validRows = data.filter((r) => {
    const createdAt = new Date(r.createdAt).getTime();
    return !isNaN(createdAt) && createdAt >= oneDayAgo;
  });

  if (validRows.length < data.length) {
    const rowsToKeep = validRows.map((r) => [
      r.scanId, 
      r.userId, 
      r.lang, 
      r.items || r.itemsJson || '[]', 
      r.createdAt
    ]);
    const defaultHeaders = headers.length > 0 ? headers : ['scanId', 'userId', 'lang', 'items', 'createdAt'];
    await clearAndSetTab('Pending', defaultHeaders, rowsToKeep);
  }
  return data.length - validRows.length;
}

/* ==========================================================================
   VOCABULARY API
   ========================================================================== */

export async function addVocab(userId, lang, items, context = '') {
  const { data } = await getTabRows('Vocabulary');
  
  // กรองเฉพาะคำศัพท์ของผู้ใช้นี้ในภาษานี้ที่มีอยู่แล้ว
  const userVocabSet = new Set(
    data
      .filter((r) => r.userId === userId && r.lang === lang)
      .map((r) => String(r.word).trim().toLowerCase())
  );

  let addedCount = 0;
  let duplicateCount = 0;
  const newRows = [];
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  for (const item of items) {
    const word = String(item.original || item.word || '').trim();
    if (!word) continue;

    if (userVocabSet.has(word.toLowerCase())) {
      duplicateCount++;
    } else {
      addedCount++;
      userVocabSet.add(word.toLowerCase());

      const vocabId = `vocab_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const reading = item.reading || item.kana || item.romaji || '';
      const thaiSound = item.thai_sound || item.thai_reading || item.thaiReading || '';
      const translation = item.translation || item.meaning || '';
      const note = item.note || '';

      newRows.push([
        vocabId,
        userId,
        lang,
        word,
        reading,
        thaiSound,
        translation,
        note,
        context,
        1,             // box = 1
        tomorrow,      // nextReviewAt
        0,             // correctCount = 0
        0,             // wrongCount = 0
        now.toISOString()
      ]);
    }
  }

  if (newRows.length > 0) {
    await appendRow('Vocabulary', newRows);
  }

  return { added: addedCount, duplicate: duplicateCount };
}

export async function getVocab(userId, lang) {
  const { data } = await getTabRows('Vocabulary');
  return data
    .filter((r) => r.userId === userId && r.lang === lang)
    .map((r) => ({
      id: r.vocabId || r.id,
      userId: r.userId,
      lang: r.lang,
      word: r.word,
      reading: r.reading,
      thaiSound: r.thaiSound,
      translation: r.translation,
      note: r.note,
      context: r.context,
      box: Number(r.box) || 1,
      nextReviewAt: r.nextReviewAt,
      correctCount: Number(r.correctCount) || 0,
      wrongCount: Number(r.wrongCount) || 0,
      createdAt: r.createdAt,
    }));
}

export async function getRecentVocab(userId, lang, limit = 10) {
  const all = await getVocab(userId, lang);
  return all
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

export async function getDueVocab(userId, lang, limit = 10) {
  const all = await getVocab(userId, lang);
  const now = new Date();
  return all
    .filter((v) => new Date(v.nextReviewAt) <= now)
    .sort((a, b) => new Date(a.nextReviewAt) - new Date(b.nextReviewAt))
    .slice(0, limit);
}

export async function updateReview(vocabId, correct) {
  const { data } = await getTabRows('Vocabulary');
  const target = data.find((r) => r.vocabId === vocabId || r.id === vocabId);
  if (!target) return null;

  let box = Number(target.box) || 1;
  let correctCount = Number(target.correctCount) || 0;
  let wrongCount = Number(target.wrongCount) || 0;

  if (correct) {
    box = Math.min(box + 1, 3);
    correctCount++;
  } else {
    box = 1;
    wrongCount++;
  }

  // คำนวณวันทบทวนรอบถัดไปตาม Leitner Box System
  const days = box === 1 ? 1 : box === 2 ? 3 : 7;
  const nextReviewAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const updatedRowValues = [
    target.vocabId || target.id,
    target.userId,
    target.lang,
    target.word,
    target.reading,
    target.thaiSound,
    target.translation,
    target.note,
    target.context,
    box,
    nextReviewAt,
    correctCount,
    wrongCount,
    target.createdAt,
  ];

  await updateRow('Vocabulary', target._rowIndex, updatedRowValues);

  return {
    ...target,
    box,
    nextReviewAt,
    correctCount,
    wrongCount,
  };
}

export async function getStats(userId, lang) {
  const all = await getVocab(userId, lang);
  const now = new Date();

  const box1 = all.filter((v) => v.box === 1).length;
  const box2 = all.filter((v) => v.box === 2).length;
  const box3 = all.filter((v) => v.box === 3).length;
  const dueCount = all.filter((v) => new Date(v.nextReviewAt) <= now).length;

  return {
    total: all.length,
    box1,
    box2,
    box3,
    dueCount,
  };
}

/* ==========================================================================
   SESSIONS API
   ========================================================================== */

export async function getSession(userId) {
  const { data } = await getTabRows('Sessions');
  const session = data.find((r) => r.userId === userId);
  if (!session) return null;

  try {
    return {
      userId: session.userId,
      mode: session.mode,
      state: JSON.parse(session.stateJson || '{}'),
    };
  } catch (e) {
    return { userId: session.userId, mode: session.mode, state: {} };
  }
}

export async function setSession(userId, mode, state = {}) {
  const { data } = await getTabRows('Sessions');
  const existing = data.find((r) => r.userId === userId);
  const now = new Date().toISOString();
  const stateJson = JSON.stringify(state);

  if (existing) {
    await updateRow('Sessions', existing._rowIndex, [userId, mode, stateJson, now]);
  } else {
    await appendRow('Sessions', [userId, mode, stateJson, now]);
  }
}

export async function clearSession(userId) {
  await setSession(userId, '', {});
}