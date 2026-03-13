import fs from 'fs';
import path from 'path';

const HISTORY_FILE = path.join(process.cwd(), 'data', 'alert-history.json');

export function readAlertHistory() {
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function writeAlertHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

export function findAlertsByUserAndGame(userId, gameId) {
  return readAlertHistory().filter(
    (a) => a.userId === userId && a.gameId === gameId
  );
}

export function wasAlertSentRecently(userId, gameId, alertType, withinMs = 3 * 60 * 1000) {
  const now = Date.now();
  return readAlertHistory().some(
    (a) =>
      a.userId === userId &&
      a.gameId === gameId &&
      a.alertType === alertType &&
      now - new Date(a.sentAt).getTime() < withinMs
  );
}

export function recordAlert(userId, gameId, alertType) {
  const history = readAlertHistory();
  history.push({ userId, gameId, alertType, sentAt: new Date().toISOString() });
  writeAlertHistory(history);
}
