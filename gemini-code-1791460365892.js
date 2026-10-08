/**
 * สร้าง Flex Message แสดงผลการวิเคราะห์ภาพถ่าย
 * @param {Object} result - ผลลัพธ์จาก analyzeImage
 * @param {string} scanId - ID อ้างอิงสแกนชั่วคราว 8 หลัก
 * @param {Object} langInfo - ข้อมูลภาษาเป้าหมาย { code, name, flag }
 */
export function buildResultFlex(result, scanId, langInfo) {
  const flag = langInfo?.flag || '🌐';
  const langName = langInfo?.name || 'ต่างประเทศ';
  const typeText = result.type || 'ป้าย/ข้อความ';
  const summaryTh = result.summary_th || 'วิเคราะห์ข้อความสำเร็จ';

  // สกัดรายการคำศัพท์ (จำกัดสูงสุด 10 คำเพื่อไม่ให้ขนาดเกินโควตา Flex Message)
  const items = Array.isArray(result.items) ? result.items.slice(0, 10) : [];

  const vocabContents = [];

  items.forEach((item, index) => {
    const isImportant = item.important === true;
    const wordText = isImportant ? `⚠️ ${item.word}` : item.word;
    const wordColor = isImportant ? '#D9383A' : '#111111';

    const itemBlock = {
      type: 'box',
      layout: 'vertical',
      margin: index > 0 ? 'md' : 'none',
      spacing: 'xs',
      contents: [
        // คำศัพท์หลัก
        {
          type: 'text',
          text: wordText,
          weight: 'bold',
          size: 'md',
          color: wordColor,
          wrap: true
        }
      ]
    };

    // คำอ่านต่างประเทศ / คำอ่านไทย
    const readings = [];
    if (item.reading) readings.push(item.reading);
    if (item.thai_sound) readings.push(`[${item.thai_sound}]`);

    if (readings.length > 0) {
      itemBlock.contents.push({
        type: 'text',
        text: readings.join(' '),
        size: 'xs',
        color: '#666666',
        wrap: true
      });
    }

    // คำแปลภาษาไทย
    if (item.meaning_th) {
      itemBlock.contents.push({
        type: 'text',
        text: `• ${item.meaning_th}`,
        size: 'sm',
        color: '#333333',
        weight: 'bold',
        wrap: true
      });
    }

    // หมายเหตุเพิ่มเติม (ถ้ามี)
    if (item.note) {
      itemBlock.contents.push({
        type: 'text',
        text: `💡 ${item.note}`,
        size: 'xs',
        color: '#888888',
        wrap: true
      });
    }

    vocabContents.push(itemBlock);

    // เส้นคั่นระหว่างคำศัพท์
    if (index < items.length - 1) {
      vocabContents.push({
        type: 'separator',
        margin: 'md',
        color: '#F0F0F0'
      });
    }
  });

  // ป้ายบอกเรื่องคำอ่านไทยด้านล่างรายการคำศัพท์
  if (vocabContents.length > 0) {
    vocabContents.push({
      type: 'text',
      text: '(คำอ่านไทยโดยประมาณ)',
      size: 'xxs',
      color: '#AAAAAA',
      align: 'end',
      margin: 'md'
    });
  }

  // บล็อกส่วนที่ไม่ชัดเจน (ถ้ามี)
  const unclearContents = [];
  if (result.unclear) {
    unclearContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      paddingAll: 'sm',
      backgroundColor: '#F8F9FA',
      cornerRadius: 'md',
      contents: [
        {
          type: 'text',
          text: `ส่วนที่อ่านไม่ชัด: ${result.unclear}`,
          size: 'xs',
          color: '#777777',
          wrap: true
        }
      ]
    });
  }

  // โครงสร้าง Bubble หลัก
  const bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#06C755',
      paddingAll: 'lg',
      contents: [
        {
          type: 'text',
          text: `${flag} ภาษา${langName} • ${typeText}`,
          weight: 'bold',
          color: '#FFFFFF',
          size: 'xs'
        },
        {
          type: 'text',
          text: summaryTh,
          weight: 'bold',
          color: '#FFFFFF',
          size: 'lg',
          wrap: true,
          margin: 'xs'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      contents: [
        {
          type: 'text',
          text: '📚 คำศัพท์ที่สกัดได้',
          weight: 'bold',
          size: 'sm',
          color: '#111111'
        },
        {
          type: 'separator',
          margin: 'sm',
          color: '#E5E5E5'
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          contents: vocabContents
        },
        ...unclearContents
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: 'lg',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#06C755',
          height: 'sm',
          action: {
            type: 'postback',
            label: '💾 บันทึกคำศัพท์ทั้งหมด',
            data: `action=save&scan=${scanId}`,
            displayText: '💾 บันทึกคำศัพท์ทั้งหมด'
          }
        }
      ]
    }
  };

  return {
    type: 'flex',
    altText: `[TravelLingo] แปลสำเร็จ: ${summaryTh}`,
    contents: bubble
  };
}