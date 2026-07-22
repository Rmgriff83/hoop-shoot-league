/**
 * Versioned idb wrapper (adapted from bball_sim's GameDatabase.js pattern):
 * one shared connection, incremental upgrade migrations, and robust
 * blocked/blocking/terminated handling so a stale tab can't wedge the app.
 */
import { openDB, type IDBPDatabase } from 'idb'

export const DB_NAME = 'hoop-shoot-league'
export const DB_VERSION = 1

export type Db = IDBPDatabase

let dbPromise: Promise<Db> | null = null

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1 — initial schema. Future versions append `if (oldVersion < n)` blocks.
        if (oldVersion < 1) {
          db.createObjectStore('campaigns', { keyPath: 'id' })
          const shots = db.createObjectStore('shots', { keyPath: 'key' })
          shots.createIndex('byGame', 'gameKey')
          db.createObjectStore('liveGames', { keyPath: 'key' })
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      },
      blocked() {
        console.warn('[db] open blocked by another connection')
      },
      blocking() {
        // A newer version wants to open elsewhere — release our connection.
        void dbPromise?.then((db) => db.close())
        dbPromise = null
      },
      terminated() {
        dbPromise = null
      },
    })
  }
  return dbPromise
}
