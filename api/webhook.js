import { messagingApi } from '@line/bot-sdk';
import { handleEvent } from '../lib/router.js';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const events = req.body.events || [];
    
    // วนลูปประมวลผลทุก Event (ทั้ง Message และ Postback)
    await Promise.all(events.map(event => handleEvent(event, client)));

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ error: error.message });
  }
}