/**
 * ตารางข้อมูลภาษาที่รองรับ (10 ภาษาหลัก)
 */
export const LANGUAGES = {
  ja: { code: 'ja', name_th: 'ญี่ปุ่น', flag: '🇯🇵' },
  en: { code: 'en', name_th: 'อังกฤษ', flag: '🇺🇸' },
  zh: { code: 'zh', name_th: 'จีน (ตัวย่อ)', flag: '🇨🇳' },
  ko: { code: 'ko', name_th: 'เกาหลี', flag: '🇰🇷' },
  fr: { code: 'fr', name_th: 'ฝรั่งเศส', flag: '🇫🇷' },
  de: { code: 'de', name_th: 'เยอรมัน', flag: '🇩🇪' },
  es: { code: 'es', name_th: 'สเปน', flag: '🇪🇸' },
  it: { code: 'it', name_th: 'อิตาลี', flag: '🇮🇹' },
  vi: { code: 'vi', name_th: 'เวียดนาม', flag: '🇻🇳' },
  'zh-TW': { code: 'zh-TW', name_th: 'จีน (ตัวเต็ม)', flag: '🇹🇼' }
};

/**
 * ดึงข้อมูลภาษาตามรหัส (เช่น 'ja', 'en')
 * - คืนค่าออบเจกต์ที่มี { code, name, flag } เพื่อให้เข้ากันได้กับทุกส่วนของระบบ
 */
export function getLanguageInfo(code) {
  if (typeof LANGUAGES === 'undefined' || !LANGUAGES[code]) {
    return { code: code || 'ja', name: 'ภาษาต่างประเทศ', flag: '🌐' };
  }
  const lang = LANGUAGES[code];
  return {
    code: lang.code,
    name: lang.name_th || lang.name || 'ภาษาต่างประเทศ',
    flag: lang.flag || '🌐'
  };
}

/**
 * สร้าง Quick Reply ปุ่มเลือกภาษา 10 รายการ (ธง + ชื่อไทย)
 */
export function buildLanguageQuickReply() {
  return {
    items: Object.values(LANGUAGES).map((lang) => {
      const info = getLanguageInfo(lang.code);
      return {
        type: 'action',
        action: {
          type: 'postback',
          label: `${info.flag} ${info.name}`.substring(0, 20),
          data: `action=setlang&lang=${info.code}`,
          displayText: `เลือกภาษา ${info.flag} ${info.name}`
        }
      };
    })
  };
}