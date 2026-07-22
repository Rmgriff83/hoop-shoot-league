/**
 * Durable-storage request + quota reporting (bball_sim pattern). Call once at
 * campaign creation; browsers may silently decline — that's fine, IndexedDB
 * still works, it's just evictable under pressure.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted()
      if (already) return true
      return await navigator.storage.persist()
    }
  } catch {
    // Non-fatal — continue without durability.
  }
  return false
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
    }
  } catch {
    // ignore
  }
  return null
}
