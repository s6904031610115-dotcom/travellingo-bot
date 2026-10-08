/**
 * สร้าง Flex Message แสดงผลการวิเคราะห์รูปภาพ
 */
export function buildResultFlex(data) {
  // ดึงและกรองข้อมูลอย่างปลอดภัย เพื่อป้องกันค่า undefined
  const summary = String(data.overall_summary || data.summary || data.overallSummary || 'สรุปผลการวิเคราะห์').trim();
  const imageType = String(data.image_type || data.imageType || 'ภาพทั่วไป').trim();
  const rawItems = data.items || data.vocabulary || [];
  const items = Array.isArray(rawItems) ? rawItems : [];

  // สร้างรายการคำศัพท์ (จำกัดสูงสุด 5 รายการเพื่อไม่ให้ Flex โตเกินขนาด)
  const itemComponents = items.slice(0, 5).map((item) => {
    const original = String(item.original || '-').trim();
    const reading = String(item.thai_reading || item.thaiReading || item.reading || '').trim();
    const translation = String(item.translation || '-').trim();

    const contents = [
      {
        type: 'text',
        text: original,
        weight: 'bold',
        size: 'sm',
        color: '#111111',
        wrap: true
      }
    ];

    if (reading) {
      contents.push({
        type: 'text',
        text: reading,
        size: 'xs',
        color: '#888888',
        wrap: true
      });
    }

    contents.push({
      type: 'text',
      text: `แปล: ${translation}`,
      size: 'sm',
      color: '#0066CC',
      wrap: true
    });

    return {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'xs',
      contents: contents
    };
  });

  // หากไม่มีคำศัพท์เลย ให้ใส่ข้อความแจ้งเตือนไว้
  if (itemComponents.length === 0) {
    itemComponents.push({
      type: 'text',
      text: 'ไม่พบข้อความที่สามารถแปลได้ในภาพนี้',
      size: 'sm',
      color: '#999999',
      wrap: true
    });
  }

  // โครงสร้าง Flex Bubble
  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#271041',
      contents: [
        {
          type: 'text',
          text: `📍 ${imageType}`,
          weight: 'bold',
          color: '#FFFFFF',
          size: 'sm'
        },
        {
          type: 'text',
          text: summary,
          weight: 'bold',
          color: '#FFFFFF',
          size: 'md',
          wrap: true,
          margin: 'xs'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: itemComponents
    }
  };

  // ส่งคืน Payload ตามโครงสร้างมาตรฐานของ LINE API
  return {
    type: 'flex',
    altText: `ผลการแปลภาษา: ${summary.substring(0, 30)}`,
    contents: bubble
  };
}

// ส่งออกในชื่อ createTranslationFlex ด้วยเพื่อรองรับโค้ดจุดอื่น
export const createTranslationFlex = buildResultFlex;