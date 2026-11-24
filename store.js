// Хранилище статблоков.
//
// Статблоки лежат ТОЛЬКО в localStorage браузера мастера (на домене расширения).
// В Owlbear Rodeo они не отправляются: ни в метаданные комнаты, ни в сцену, ни в токены,
// поэтому игроки физически не получают этих данных, даже если откроют инструменты разработчика.
// В токене хранится лишь случайный идентификатор связи, без какого-либо содержимого.

export const EXT_ID = "com.statblocks";
export const LINK_KEY = `${EXT_ID}/link`; // метаданные токена: id статблока
export const PENDING_KEY = `${EXT_ID}/pending`; // «письмо» от фоновой страницы окну

const LIB_KEY = `${EXT_ID}/library`;
let memoryLibrary = [];

export function storageAvailable() {
  try {
    const probe = `${EXT_ID}/probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadLibrary() {
  if (!storageAvailable()) return memoryLibrary;
  try {
    const data = JSON.parse(localStorage.getItem(LIB_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveLibrary(list) {
  memoryLibrary = list;
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function setPending(payload) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...payload, at: Date.now() }));
  } catch {
    /* хранилище недоступно: окно просто откроется без перехода */
  }
}

export function takePending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    const payload = JSON.parse(raw);
    return Date.now() - payload.at < 30000 ? payload : null;
  } catch {
    return null;
  }
}
