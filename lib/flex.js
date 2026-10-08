/**
 * สร้าง Flex Message แสดงผลการวิเคราะห์รูปภาพ
 * @param {Object} data ข้อมูลจากการวิเคราะห์รูปภาพจาก Gemini
 * @param {string} scanIdParam รหัส Scan ID สำหรับบันทึกคำศัพท์
 * @param {Object} langInfo ข้อมูลภาษา (flag, name)
 * @returns {Object} LINE Flex Message Object
 */
export function buildResultFlex(data = {}, scanIdParam = null, langInfo = {}) {
  // 1. รับ scanId จากพารามิเตอร์ที่ 2 หรือดึงจาก data
  const scanId = scanIdParam || data.scan_id || data.scanId || 'temp_scan_id';
  
  // 2. รองรับ flag และภาษาจาก langInfo หรือ data
  const flag = langInfo?.flag || data.flag || data.language_flag || '🌐';
  const langName = langInfo?.name || data.language_name || data.lang_th || data.language || 'ภาษาต่างประเทศ';
  
  // 3. แมป title และ description จาก Gemini
  const imageType = data.title || data.image_type || data.imageType || 'ภาพทั่วไป';
  const summaryTh = String(data.description || data.summary_th || data.overall_summary || data.summary || '').trim();
  
  const rawItems = data.items || data.vocabulary || [];
  const items = Array.isArray(rawItems) ? rawItems : [];
  const unclear = String(data.unclear || data.unclear_text || data.unclear_items || '').trim();

  // ฟังก์ชันแปลง item แต่ละรายการเป็น Flex Component
  const renderItemComponent = (item) => {
    const original = String(item.original || item.word || '-').trim();
    const isImportant = Boolean(item.important);
    const reading = String(item.reading || item.kana || item.romaji || '').trim();
    const thaiSound = String(item.thai_sound || item.thai_reading || item.thaiReading || '').trim();
    const translation = String(item.translation || item.meaning || '-').trim();
    const note = String(item.note || '').trim();

    const contents = [];

    // 1. คำศัพท์เดิม (ถ้าเป็นคำสำคัญ: แสดง ⚠️ และใช้สีแดง)
    contents.push({
      type: 'text',
      text: isImportant ? `⚠️ ${original}` : original,
      weight: 'bold',
      size: 'md',
      color: isImportant ? '#D9381E' : '#111111',
      wrap: true
    });

    // 2. ออกเสียงต้นทาง (ถ้ามี)
    if (reading) {
      contents.push({
        type: 'text',
        text: reading,
        size: 'xs',
        color: '#777777',
        wrap: true
      });
    }

    // 3. คำอ่านไทย (โดยประมาณ)
    if (thaiSound) {
      contents.push({
        type: 'text',
        text: `คำอ่านไทย (โดยประมาณ): ${thaiSound}`,
        size: 'xs',
        color: '#555555',
        wrap: true
      });
    }

    // 4. คำแปล
    contents.push({
      type: 'text',
      text: `แปล: ${translation}`,
      size: 'sm',
      color: '#0066CC',
      weight: 'bold',
      wrap: true
    });

    // 5. หมายเหตุ/ข้อแนะนำเพิ่มเติม (ถ้ามี)
    if (note) {
      contents.push({
        type: 'text',
        text: `💡 ${note}`,
        size: 'xs',
        color: '#666666',
        style: 'italic',
        wrap: true
      });
    }

    return {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'xs',
      contents: contents
    };
  };

  // แบ่งรายการคำศัพท์ออกเป็นชุดละไม่เกิน 6 คำ (สูงสุดไม่เกิน 2 Bubbles / Carousel)
  const chunkedItems = [];
  if (items.length > 0) {
    chunkedItems.push(items.slice(0, 6));
    if (items.length > 6) {
      chunkedItems.push(items.slice(6, 12));
    }
  } else {
    chunkedItems.push([]);
  }

  const totalBubbles = chunkedItems.length;

  const bubbles = chunkedItems.map((chunk, bubbleIndex) => {
    const isLastBubble = bubbleIndex === totalBubbles - 1;
    const bodyContents = [];

    // 1. summary_th / description อยู่ใต้หัวการ์ดใน Body (แสดงเฉพาะ Bubble แรก)
    if (summaryTh && bubbleIndex === 0) {
      bodyContents.push({
        type: 'text',
        text: summaryTh,
        size: 'xs',
        color: '#666666',
        wrap: true,
        maxLines: 2,
        margin: 'none'
      });
      bodyContents.push({
        type: 'separator',
        margin: 'md'
      });
    }

    // 2. รายการคำศัพท์
    if (chunk.length > 0) {
      chunk.forEach((item) => {
        bodyContents.push(renderItemComponent(item));
      });
    } else {
      bodyContents.push({
        type: 'text',
        text: 'ไม่พบข้อความที่สามารถแปลได้ในภาพนี้',
        size: 'sm',
        color: '#999999',
        wrap: true
      });
    }

    // 3. ส่วนข้อความอ่านไม่ชัดเจน (แสดงล่างสุดของ Bubble สุดท้าย)
    if (unclear && isLastBubble) {
      bodyContents.push({
        type: 'separator',
        margin: 'md'
      });
      bodyContents.push({
        type: 'text',
        text: `อาจอ่านไม่ชัด: ${unclear}`,
        size: 'xs',
        color: '#888888',
        wrap: true,
        margin: 'md'
      });
    }

    const bubble = {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#271041',
        contents: [
          {
            type: 'text',
            text: `${flag} ${langName} • ${imageType}`,
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
            wrap: true,
            maxLines: 1
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents
      }
    };

    // Footer: ปุ่มบันทึกคำศัพท์ทั้งหมด (แสดงเฉพาะ Bubble สุดท้าย เมื่อมี items อย่างน้อย 1 คำ)
    if (isLastBubble && items.length >= 1) {
      bubble.footer = {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#281242',
            action: {
              type: 'postback',
              label: '💾 บันทึกคำศัพท์ทั้งหมด',
              data: `action=save_vocab&scanId=${scanId}`,
              displayText: 'บันทึกคำศัพท์ทั้งหมด'
            }
          }
        ]
      };
    }

    return bubble;
  });

  // ข้อความสำรอง (altText) ความยาวไม่เกิน 100 ตัวอักษร
  const altText = `ผลแปลภาษา ${flag} ${langName} (${items.length} คำ)`.substring(0, 100);

  return {
    type: 'flex',
    altText: altText,
    contents: bubbles.length > 1 ? { type: 'carousel', contents: bubbles } : bubbles[0]
  };
}

export const createTranslationFlex = buildResultFlex;