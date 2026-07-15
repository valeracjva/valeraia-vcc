import { readFile } from 'fs/promises';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'telegram-config.json');

const ICONS  = { fresh: '✅', watch: '⚠️', critico: '🔴' };
const LABELS = { fresh: 'normal', watch: 'atención', critico: 'crítico' };

// watch -> fresh no genera mensaje: es una recuperacion parcial (bajo del umbral critico
// pero sigue en atencion), no amerita interrumpir por Telegram -- decision tomada en
// brainstorming (ver spec 2026-07-07).
export function buildTransitionMessage(serverId, fromState, toState) {
  if (fromState === 'watch' && toState === 'fresh') return null;
  const icon = ICONS[toState] ?? 'ℹ️';
  return `${icon} ${serverId}: ${LABELS[fromState] ?? fromState} → ${LABELS[toState] ?? toState}`;
}

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export async function notifyTransition(serverId, fromState, toState) {
  const message = buildTransitionMessage(serverId, fromState, toState);
  if (!message) return;

  const config = await loadConfig();
  if (!config?.botToken || !config?.chatId) {
    console.error('[monitoring-core] telegram-config.json ausente o incompleto, no se envia:', message);
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: message }),
    });
    if (!res.ok) console.error('[monitoring-core] telegram send FAIL:', res.status, await res.text());
  } catch (err) {
    console.error('[monitoring-core] telegram send FAIL:', err.message);
  }
}
