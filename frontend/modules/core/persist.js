export function loadState(key, fallback, storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveState(key, value, storage = globalThis.localStorage) {
  storage.setItem(key, JSON.stringify(value));
}
