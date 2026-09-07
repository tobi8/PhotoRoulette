/**
 * Client-Side Persistent Photo Vault (IndexedDB)
 * Stores compressed photos safely on the user's device across game sessions.
 * 100% private: All media stays strictly inside the local browser storage.
 */

export interface VaultPhoto {
  id: string
  type: 'image' | 'video'
  dataUrl: string
  previewUrl?: string
  addedAt: number
}

const DB_NAME = 'PhotoRouletteVaultDB'
const DB_VERSION = 2
const STORE_NAME = 'vault_photos'

let cachedDB: IDBDatabase | null = null

/**
 * Uniform Fisher-Yates shuffle algorithm
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Gets or opens the persistent IndexedDB connection without closing prematurely
 */
function getDB(): Promise<IDBDatabase> {
  if (cachedDB) {
    try {
      // Test if connection is still usable
      cachedDB.transaction(STORE_NAME, 'readonly')
      return Promise.resolve(cachedDB)
    } catch {
      cachedDB = null
    }
  }

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this browser'))
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => {
      cachedDB = request.result
      cachedDB.onversionchange = () => {
        cachedDB?.close()
        cachedDB = null
      }
      resolve(cachedDB)
    }

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'))
    }
  })
}

/**
 * Save photos to the local vault.
 * Saves in safe batches to avoid browser transaction quota issues.
 */
export async function savePhotosToVault(
  photos: Array<{ id?: string; type: 'image' | 'video'; dataUrl: string; previewUrl?: string }>
): Promise<number> {
  if (!photos || photos.length === 0) return 0

  try {
    const db = await getDB()
    const now = Date.now()
    let savedCount = 0

    // Process in batches of 20 to avoid transaction timeouts on mobile
    const BATCH_SIZE = 20
    for (let i = 0; i < photos.length; i += BATCH_SIZE) {
      const chunk = photos.slice(i, i + BATCH_SIZE)
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)

        for (const p of chunk) {
          const id = p.id || `vault-${now}-${Math.random().toString(36).slice(2, 7)}`
          const entry: VaultPhoto = {
            id,
            type: p.type || 'image',
            dataUrl: p.dataUrl,
            previewUrl: p.previewUrl || p.dataUrl,
            addedAt: now,
          }
          store.put(entry)
          savedCount++
        }

        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }

    return savedCount
  } catch (error) {
    console.error('Failed to save photos to vault:', error)
    return 0
  }
}

/**
 * Get total count of photos stored in the local vault
 */
export async function getVaultCount(): Promise<number> {
  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const countRequest = store.count()

      countRequest.onsuccess = () => {
        resolve(countRequest.result || 0)
      }
      countRequest.onerror = () => {
        resolve(0)
      }
    })
  } catch {
    return 0
  }
}

/**
 * Get all photos stored in the local vault
 */
export async function getAllVaultPhotos(): Promise<VaultPhoto[]> {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('Failed to read photos from vault:', error)
    return []
  }
}

/**
 * Randomly sample up to `count` photos from the vault using Fisher-Yates
 */
export async function sampleRandomFromVault(count = 15): Promise<VaultPhoto[]> {
  const allPhotos = await getAllVaultPhotos()
  if (allPhotos.length === 0) return []
  const shuffled = fisherYatesShuffle(allPhotos)
  return shuffled.slice(0, count)
}

/**
 * Remove a single photo from the local vault by ID
 */
export async function removePhotoFromVault(id: string): Promise<void> {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('Failed to remove photo from vault:', error)
  }
}

/**
 * Clear all photos from the local vault
 */
export async function clearVault(): Promise<void> {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('Failed to clear photo vault:', error)
  }
}
