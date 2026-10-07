// config/languages.js
// ข้อมูลภาษาทั้ง 10 ภาษาและฟังก์ชันช่วยเหลือสำหรับการเลือกภาษา

export const LANGUAGES = {
  ja: {
    code: 'ja',
    name_th: 'ภาษาญี่ปุ่น',
    native_name: '日本語',
    flag: '🇯🇵',
    reading_rule: 'reading = ฮิรางานะ ตามด้วยโรมะจิในวงเล็บ',
    needs_thai_sound: true
  },
  ko: {
    code: 'ko',
    name_th: 'ภาษาเกาหลี',
    native_name: '한국어',
    flag: '🇰🇷',
    reading_rule: 'reading = Revised Romanization',
    needs_thai_sound: true
  },
  zh: {
    code: 'zh',
    name_th: 'ภาษาจีน',
    native_name: '中文',
    flag: '🇨🇳',
    reading_rule: 'reading = พินอินพร้อมวรรณยุกต์',
    needs_thai_sound: true
  },
  en: {
    code: 'en',
    name_th: 'ภาษาอังกฤษ',
    native_name: 'English',
    flag: '🇺🇸',
    reading_rule: 'reading ให้เป็นสตริงว่าง',
    needs_thai_sound: false
  },
  vi: {
    code: 'vi',
    name_th: 'ภาษาเวียดนาม',
    native_name: 'Tiếng Việt',
    flag: '🇻🇳',
    reading_rule: 'reading ให้เป็นสตริงว่าง',
    needs_thai_sound: true
  },
  fr: {
    code: 'fr',
    name_th: 'ภาษาฝรั่งเศส',
    native_name: 'Français',
    flag: '🇫🇷',
    reading_rule: 'reading ให้เป็นสตริงว่าง',
    needs_thai_sound: true
  },
  de: {
    code: 'de',
    name_th: 'ภาษาเยอรมัน',
    native_name: 'Deutsch',
    flag: '🇩🇪',
    reading_rule: 'reading ให้เป็นสตริงว่าง',
    needs_thai_sound: true
  },
  es: {
    code: 'es',
    name_th: 'ภาษาสเปน',
    native_name: 'Español',
    flag: '🇪🇸',
    reading_rule: 'reading ให้เป็นสตริงว่าง',
    needs_thai_sound: true
  },
  it: {
    code: 'it',
    name_th: 'ภาษาอิตาลี',
    native_name: 'Italiano',
    flag: '🇮🇹',
    reading_rule: 'reading ให้เป็นสตริงว่าง',
    needs_thai_sound: true
  },
  id: {
    code: 'id',
    name_th: 'ภาษาอินโดนีเซีย',
    native_name: 'Bahasa Indonesia',
    flag: '🇮🇩',
    reading_rule: 'reading ให้เป็นสตริงว่าง',
    needs_thai_sound: false
  }
};

/**
 * ดึงข้อมูลภาษาตามรหัส ถ้าไม่พบจะคืนภาษาอังกฤษ (en) เป็นค่าเริ่มต้น
 * @param {string} code - รหัสภาษา เช่น 'ja', 'ko'
 */
export function getLanguage(code) {
  return LANGUAGES[code] || LANGUAGES.en;
}

/**
 * คืนค่า Array รายชื่อภาษาทั้งหมดสำหรับทำปุ่มเลือกภาษา
 */
export function listLanguages() {
  return Object.values(LANGUAGES).map((lang) => ({
    code: lang.code,
    name_th: lang.name_th,
    native_name: lang.native_name,
    flag: lang.flag
  }));
}