import fs from 'fs';
import path from 'path';

const SUBS_FILE = path.join(process.cwd(), 'data', 'subscriptions.json');

export function readSubscriptions() {
  try {
    const data = fs.readFileSync(SUBS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function writeSubscriptions(subs) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

export function findSubscriptionsByUser(userId) {
  return readSubscriptions().filter((s) => s.userId === userId);
}

export function findSubscription(userId, gameId) {
  return readSubscriptions().find(
    (s) => s.userId === userId && s.gameId === gameId
  ) || null;
}

export function addSubscription(userId, gameId) {
  const subs = readSubscriptions();
  subs.push({ userId, gameId, createdAt: new Date().toISOString() });
  writeSubscriptions(subs);
}

export function removeSubscription(userId, gameId) {
  const subs = readSubscriptions().filter(
    (s) => !(s.userId === userId && s.gameId === gameId)
  );
  writeSubscriptions(subs);
}
