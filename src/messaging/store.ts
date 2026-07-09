import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../config.js';

const inboxes: Map<string, Message[]> = new Map();
let dataFile = '';
let tmpFile = '';

export interface Message {
  message_id: string;
  from: string;
  to: string;
  body: string;
  thread_id: string;
  timestamp: string;
}

export function initStore(dataDir: string): void {
  dataFile = join(dataDir, 'messages.json');
  tmpFile = join(dataDir, 'messages.json.tmp');
  mkdirSync(dataDir, { recursive: true });
  inboxes.clear();
  // CRASH RECOVERY: promote a completed write that survived a crash
  if (existsSync(tmpFile)) {
    try {
      JSON.parse(readFileSync(tmpFile, 'utf8'));
      renameSync(tmpFile, dataFile);
    } catch {
      rmSync(tmpFile, { force: true });
    }
  }
  if (existsSync(dataFile)) {
    try {
      const entries = JSON.parse(readFileSync(dataFile, 'utf8'));
      for (const [key, msgs] of entries) {
        inboxes.set(key, msgs);
      }
    } catch {
      // Corrupted data file — start with empty state
    }
  }
}

export function sendMessage(
  from: string,
  to: string,
  body: string,
  thread_id?: string,
): { message_id: string; thread_id: string } {
  const message_id = randomUUID();
  const resolvedThreadId = thread_id ?? randomUUID();

  const message: Message = {
    message_id,
    from,
    to,
    body,
    thread_id: resolvedThreadId,
    timestamp: new Date().toISOString(),
  };

  const inbox = inboxes.get(to) ?? [];
  inbox.push(message);
  inboxes.set(to, inbox);

  flushToDisk();

  return { message_id, thread_id: resolvedThreadId };
}

export function receiveMessages(
  sessionId: string,
  threadId?: string,
): { messages: Message[] } {
  const inbox = inboxes.get(sessionId);
  if (!inbox || inbox.length === 0) {
    return { messages: [] };
  }

  if (threadId) {
    const matching = inbox.filter(m => m.thread_id === threadId);
    const remaining = inbox.filter(m => m.thread_id !== threadId);
    if (remaining.length === 0) {
      inboxes.delete(sessionId);
    } else {
      inboxes.set(sessionId, remaining);
    }
    flushToDisk();
    return { messages: matching };
  }

  inboxes.delete(sessionId);
  flushToDisk();
  return { messages: inbox };
}

export function getUnreadCount(sessionId: string): number {
  return inboxes.get(sessionId)?.length ?? 0;
}

export function clearAllInboxes(): void {
  inboxes.clear();
  if (dataFile !== '' && existsSync(dataFile)) {
    rmSync(dataFile);
  }
  if (tmpFile !== '' && existsSync(tmpFile)) {
    rmSync(tmpFile);
  }
}

function flushToDisk(): void {
  if (dataFile === '') return;
  const json = JSON.stringify(Array.from(inboxes.entries()));
  try {
    writeFileSync(tmpFile, json, 'utf8');
    renameSync(tmpFile, dataFile);
  } catch (e) {
    console.error('flushToDisk failed:', e);
  }
}

if (!process.env.VITEST) {
  initStore(DATA_DIR);
}
