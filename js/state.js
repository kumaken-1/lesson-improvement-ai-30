// 校務版と同じドメインで公開しても記録が混ざらないよう、専用のキーを使う。
// 旧版から引き継ぐ記録はないため、読み込みは新しいキーだけを見る。
export const STORAGE_KEY = "lesson-improve-ai-30-tried-v1";

const MIN_ID = 1;
const MAX_ID = 30;

function toChallengeId(value) {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isInteger(numeric) && numeric >= MIN_ID && numeric <= MAX_ID ? numeric : null;
}

export function normalizeTried(value) {
  const list = Array.isArray(value) ? value : value?.tried;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(toChallengeId).filter((id) => id !== null))].sort((a, b) => a - b);
}

export function isTried(tried, id) {
  const challengeId = toChallengeId(id);
  return challengeId !== null && normalizeTried(tried).includes(challengeId);
}

export function toggleTried(tried, id) {
  const current = normalizeTried(tried);
  const challengeId = toChallengeId(id);
  if (challengeId === null) return current;
  return current.includes(challengeId)
    ? current.filter((value) => value !== challengeId)
    : [...current, challengeId].sort((a, b) => a - b);
}

export function getLocalStorageSafely(scope = globalThis) {
  try {
    return scope.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadTried(storage = window.localStorage) {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return stored === null ? [] : normalizeTried(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function saveTried(tried, storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeTried(tried)));
}

export function checkStorageAvailability(storage = window.localStorage) {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored === null) {
    storage.setItem(STORAGE_KEY, "[]");
    storage.removeItem(STORAGE_KEY);
  } else {
    storage.setItem(STORAGE_KEY, stored);
  }
}

export function clearTried(storage = window.localStorage) {
  storage.removeItem(STORAGE_KEY);
}
