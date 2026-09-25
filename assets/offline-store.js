const SNAPSHOT_PREFIX = 'sales-offline-snapshot:';
const QUEUE_PREFIX = 'sales-offline-queue:';
const ACTIVE_USER_KEY = 'sales-offline-active-user';

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function saveOfflineSnapshot({ user, state, audit, capabilities }) {
  if (!user?.id || !state?.products || !state?.entries) return false;
  const saved = writeJSON(`${SNAPSHOT_PREFIX}${user.id}`, {
    user,
    state,
    audit: Array.isArray(audit) ? audit : [],
    capabilities,
    savedAt: new Date().toISOString()
  });
  if (saved) {
    try { localStorage.setItem(ACTIVE_USER_KEY, user.id); } catch { return false; }
  }
  return saved;
}

export function loadOfflineSnapshot() {
  let userId = null;
  try { userId = localStorage.getItem(ACTIVE_USER_KEY); } catch { return null; }
  if (!userId) return null;
  const snapshot = readJSON(`${SNAPSHOT_PREFIX}${userId}`, null);
  return snapshot?.user?.id === userId && snapshot?.state ? snapshot : null;
}

// Clears the cached server view but keeps unsynchronized sales: they belong to the user
// and are sent as soon as the same user signs in again on this device.
export function clearOfflineSnapshot(userId) {
  try {
    localStorage.removeItem(ACTIVE_USER_KEY);
    if (userId) {
      localStorage.removeItem(`${SNAPSHOT_PREFIX}${userId}`);
      localStorage.removeItem(`${OPERATIONS_SNAPSHOT_PREFIX}${userId}`);
    }
  } catch {}
}

// Production and expense records use the same offline pattern as sales: one queue per
// record kind and user, deduplicated by the record key (date for production, id for expenses).
const RECORD_QUEUE_PREFIX = 'sales-offline-records:';
const OPERATIONS_SNAPSHOT_PREFIX = 'sales-offline-operations:';

function recordQueueKey(kind, userId) {
  return `${RECORD_QUEUE_PREFIX}${kind}:${userId}`;
}

export function listPendingRecords(kind, userId) {
  if (!userId) return [];
  const queue = readJSON(recordQueueKey(kind, userId), []);
  return Array.isArray(queue) ? queue : [];
}

export function enqueuePendingRecord(kind, userId, record, keyField) {
  if (!userId || !record?.[keyField]) return false;
  const queue = listPendingRecords(kind, userId);
  const nextRecord = { ...record, queueId: crypto.randomUUID(), queuedAt: new Date().toISOString() };
  const existingIndex = queue.findIndex((item) => item[keyField] === record[keyField]);
  if (existingIndex >= 0) queue[existingIndex] = nextRecord;
  else queue.push(nextRecord);
  return writeJSON(recordQueueKey(kind, userId), queue);
}

export function removePendingRecords(kind, userId, queueIds) {
  const ids = new Set(queueIds);
  return writeJSON(recordQueueKey(kind, userId), listPendingRecords(kind, userId).filter((item) => !ids.has(item.queueId)));
}

export function markPendingRecordsRejected(kind, userId, rejections) {
  const errors = new Map(rejections.filter((item) => item?.queueId).map((item) => [item.queueId, item.error]));
  const queue = listPendingRecords(kind, userId).map((item) => errors.has(item.queueId) ? { ...item, error: errors.get(item.queueId) } : item);
  return writeJSON(recordQueueKey(kind, userId), queue);
}

export function saveOperationsSnapshot(userId, data) {
  if (!userId) return false;
  return writeJSON(`${OPERATIONS_SNAPSHOT_PREFIX}${userId}`, { ...data, savedAt: new Date().toISOString() });
}

export function loadOperationsSnapshot(userId) {
  if (!userId) return null;
  return readJSON(`${OPERATIONS_SNAPSHOT_PREFIX}${userId}`, null);
}

export function listPendingSales(userId) {
  if (!userId) return [];
  const queue = readJSON(`${QUEUE_PREFIX}${userId}`, []);
  return Array.isArray(queue) ? queue : [];
}

export function enqueuePendingSale(userId, mutation) {
  if (!userId || !mutation?.date) return false;
  const queue = listPendingSales(userId);
  const nextMutation = {
    ...mutation,
    id: mutation.id || crypto.randomUUID(),
    queuedAt: new Date().toISOString()
  };
  const existingIndex = queue.findIndex((item) => item.date === mutation.date);
  if (existingIndex >= 0) queue[existingIndex] = nextMutation;
  else queue.push(nextMutation);
  return writeJSON(`${QUEUE_PREFIX}${userId}`, queue);
}

export function removePendingSales(userId, mutationIds) {
  const ids = new Set(mutationIds);
  const queue = listPendingSales(userId).filter((item) => !ids.has(item.id));
  return writeJSON(`${QUEUE_PREFIX}${userId}`, queue);
}

export function markPendingSalesRejected(userId, rejections) {
  const errors = new Map(rejections.filter((item) => item?.id).map((item) => [item.id, item.error]));
  const queue = listPendingSales(userId).map((item) => errors.has(item.id) ? { ...item, error: errors.get(item.id) } : item);
  return writeJSON(`${QUEUE_PREFIX}${userId}`, queue);
}
