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

    const headers = rows[0].map((h) => String(h).trim());
    const data = rows.slice(1).map((row, index) => {
      const obj = { _rowIndex: index + 2, _rawRow: row }; // แถวใน Sheet เริ่มที่ 1 (แถว 1 คือ Header)
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
  const user = data.find((r) => r.userId === userId || (r._rawRow && r._rawRow[0] === userId));
  if (!user) return null;
  const raw = user._rawRow || [];
  return { 
    userId: user.userId || raw[0], 
    lang: user.lang || raw[1], 
    updatedAt: user.updatedAt || raw[2] 
  };
}

export async function upsertUser(userId, lang) {
  const { data } = await getTabRows('Users');
  const existing = data.find((r) => r.userId === userId || (r._rawRow && r._rawRow[0] === userId));
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
  return data.map((r) => {
    const raw = r._rawRow || [];
    return { userId: r.userId || raw[0], lang: r.lang || raw[1] };
  });
}

/* ==========================================================================
   PENDING SCAN API
   ========================================================================== */

/**
 * บันทึก Pending Scan (รองรับการเรียกทั้ง 3 และ 4 Arguments)
 * - savePending(scanId, userId, lang, items)
 * - savePending(userId, lang, items)
 */
export async function savePending(arg1, arg2, arg3, arg4) {
  let scanId, userId, lang, items;

  if (arg4 !== undefined || (typeof arg1 === 'string' && arg1.startsWith('scan_'))) {
    // ถูกเรียกแบบ: savePending(scanId, userId, lang, items)
    scanId = arg1;
    userId = arg2;
    lang = arg3;
    items = arg4;
  } else {
    // ถูกเรียกแบบ: savePending(userId, lang, items)
    scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    userId = arg1;
    lang = arg2;
    items = arg3;
  }

  const now = new Date().toISOString();
  const itemsJson = typeof items === 'string' ? items : JSON.stringify(items || []);

  // ลำดับคอลัมน์ใน Sheet: A=scanId, B=userId, C=lang, D=itemsJson, E=createdAt
  await appendRow('Pending', [scanId, userId, lang, itemsJson, now]);
  return scanId;
}

export async function getPending(scanId) {
  if (!scanId) return null;

  const { data } = await getTabRows('Pending');
  if (!data || data.length === 0) return null;

  // ค้นหาแถวที่มี scanId ตรงกัน
  const pending = data.find((r) => {
    if (r.scanId === scanId || r.scan === scanId || r['Scan ID'] === scanId) return true;
    return Object.values(r).includes(scanId) || (r._rawRow && r._rawRow[0] === scanId);
  });

  if (!pending) return null;

  try {
    const raw = pending._rawRow || [];
    
    // ดึง userId (ถ้าค่าเดิมโดนบันทึกสลับกับ scanId ให้แก้อัตโนมัติ)
    let userId = pending.userId || pending['userId'] || raw[1] || '';
    if (userId === scanId && raw[1] && raw[1] !== scanId) {
      userId = raw[1];
    }

    // ดึง lang
    let lang = pending.lang || pending['lang'] || raw[2] || 'ja';
    if (lang.length > 10 && raw[2]) {
      lang = raw[2];
    }

    // ดึง items JSON
    let rawItems = pending.itemsJson || pending.items || pending['itemsJson'] || pending['items'] || raw[3];

    // Fallback: หากดึงได้เป็นภาษาตัวสั้นๆ เช่น "ja" แสดงว่าเป็นข้อมูลแถวเก่าที่เคยลงผิด ให้หา String JSON ในแถวนั้น
    if (typeof rawItems === 'string' && !rawItems.startsWith('[') && !rawItems.startsWith('{')) {
      const jsonCandidate = Object.values(pending).find(
        (val) => typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))
      );
      if (jsonCandidate) rawItems = jsonCandidate;
    }

    const items = typeof rawItems === 'string' ? JSON.parse(rawItems || '[]') : (rawItems || []);

    return { scanId: pending.scanId || raw[0] || scanId, userId, lang, items };
  } catch (e) {
    console.error('❌ Error parsing pending items:', e);
    return null;
  }
}

export async function cleanupPending() {
  const { headers, data } = await getTabRows('Pending');
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  const validRows = data.filter((r) => {
    const raw = r._rawRow || [];
    const createdAtStr = r.createdAt || raw[4];
    const createdAt = new Date(createdAtStr).getTime();
    return !isNaN(createdAt) && createdAt >= oneDayAgo;
  });

  if (validRows.length < data.length) {
    const rowsToKeep = validRows.map((r) => {
      const raw = r._rawRow || [];
      return [
        r.scanId || raw[0], 
        r.userId || raw[1], 
        r.lang || raw[2], 
        r.itemsJson || r.items || raw[3] || '[]', 
        r.createdAt || raw[4]
      ];
    });
    const defaultHeaders = headers.length > 0 ? headers : ['scanId', 'userId', 'lang', 'itemsJson', 'createdAt'];
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
      .filter((r) => (r.userId === userId || (r._rawRow && r._rawRow[1] === userId)) && (r.lang === lang || (r._rawRow && r._rawRow[2] === lang)))
      .map((r) => {
        const raw = r._rawRow || [];
        return String(r.word || raw[3] || '').trim().toLowerCase();
      })
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
        vocabId,       // Col A: id / vocabId
        userId,        // Col B: userId
        lang,          // Col C: lang
        word,          // Col D: word
        reading,       // Col E: reading
        thaiSound,     // Col F: thaiSound
        translation,   // Col G: translation
        note,          // Col H: note
        context,       // Col I: context
        1,             // Col J: box = 1
        tomorrow,      // Col K: nextReviewAt
        0,             // Col L: correctCount = 0
        0,             // Col M: wrongCount = 0
        now.toISOString() // Col N: createdAt
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
    .filter((r) => (r.userId === userId || (r._rawRow && r._rawRow[1] === userId)) && (r.lang === lang || (r._rawRow && r._rawRow[2] === lang)))
    .map((r) => {
      const raw = r._rawRow || [];
      return {
        id: r.id || r.vocabId || raw[0] || '',
        userId: r.userId || raw[1] || '',
        lang: r.lang || raw[2] || '',
        word: r.word || raw[3] || '',
        reading: r.reading || raw[4] || '',
        thaiSound: r.thaiSound || raw[5] || '',
        translation: r.translation || raw[6] || '',
        note: r.note || raw[7] || '',
        context: r.context || raw[8] || '',
        box: Number(r.box || raw[9]) || 1,
        nextReviewAt: r.nextReviewAt || raw[10] || '',
        correctCount: Number(r.correctCount || raw[11]) || 0,
        wrongCount: Number(r.wrongCount || raw[12]) || 0,
        createdAt: r.createdAt || raw[13] || '',
      };
    });
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
  const target = data.find((r) => r.vocabId === vocabId || r.id === vocabId || (r._rawRow && r._rawRow[0] === vocabId));
  if (!target) return null;

  const raw = target._rawRow || [];
  let box = Number(target.box || raw[9]) || 1;
  let correctCount = Number(target.correctCount || raw[11]) || 0;
  let wrongCount = Number(target.wrongCount || raw[12]) || 0;

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
    target.vocabId || target.id || raw[0],
    target.userId || raw[1],
    target.lang || raw[2],
    target.word || raw[3],
    target.reading || raw[4],
    target.thaiSound || raw[5],
    target.translation || raw[6],
    target.note || raw[7],
    target.context || raw[8],
    box,
    nextReviewAt,
    correctCount,
    wrongCount,
    target.createdAt || raw[13],
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
  const session = data.find((r) => r.userId === userId || (r._rawRow && r._rawRow[0] === userId));
  if (!session) return null;

  const raw = session._rawRow || [];
  const stateJson = session.stateJson || raw[2] || '{}';

  try {
    return {
      userId: session.userId || raw[0],
      mode: session.mode || raw[1],
      state: typeof stateJson === 'string' ? JSON.parse(stateJson) : (stateJson || {}),
    };
  } catch (e) {
    return { userId: session.userId || raw[0], mode: session.mode || raw[1], state: {} };
  }
}

export async function setSession(userId, mode, state = {}) {
  const { data } = await getTabRows('Sessions');
  const existing = data.find((r) => r.userId === userId || (r._rawRow && r._rawRow[0] === userId));
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