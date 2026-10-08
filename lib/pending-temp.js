import { savePending as savePendingSheet, getPending as getPendingSheet } from './sheets.js';

export async function savePendingScan(userId, lang, items) {
  return await savePendingSheet(userId, lang, items);
}

export async function getPendingScan(scanId) {
  return await getPendingSheet(scanId);
}
