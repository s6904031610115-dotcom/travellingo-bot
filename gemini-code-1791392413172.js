// lib/line.js
// จัดการ LINE Messaging API Client และฟังก์ชันอนิเมชัน Loading

import { messagingApi } from '@line/bot-sdk';

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

// Messaging Client สำหรับส่ง/ตอบกลับข้อความทั่วไป
export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken
});

// Blob Client สำหรับดาวน์โหลดไฟล์สื่อ เช่น รูปภาพ
export const lineBlobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken
});

/**
 * แสดงไอคอนอนิเมชันกำลังพิมพ์/โหลดในห้องแชต LINE
 * @param {string} userId - LINE User ID
 * @param {number} loadingSeconds - ระยะเวลาแสดงอนิเมชัน (วินาที)
 */
export async function showLoading(userId, loadingSeconds = 5) {
  if (!userId) return;
  try {
    await lineClient.showLoadingAnimation({
      chatId: userId,
      loadingSeconds
    });
  } catch (error) {
    console.error('Error showing loading animation:', error?.message || error);
  }
}