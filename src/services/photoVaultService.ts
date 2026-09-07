/**
 * Client-Side Persistent Photo Vault (IndexedDB)
 * Allows players to store compressed photos safely on their device across game sessions.
 * 100% private: All data stays exclusively in the local browser database.
 */

export interface VaultPhoto {
  id: string
  type: 'image' | 'video'
  dataUrl: string
  previewUrl?: string
  addedAt: number
}

const DB_NAME = 'PhotoRouletteVaultDB'
const DB_VERSION = 1
const STORE_NAME = 'vault_photos'

/**
 * Standard uniform Fisher-Yates shuffle algorithm
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'))
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
  })
}

/**
 * Save new photos to the local vault, skipping duplicate IDs
 */
export async function savePhotosToVault(
  photos: Array<{ id: string; type: 'image' | 'video'; dataUrl: string; previewUrl?: string }>
): Promise<number> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    let savedCount = 0
    const now = Date.now()

    for (const photo of photos) {
      const entry: VaultPhoto = {
        id: photo.id,
        type: photo.type,
        dataUrl: photo.dataUrl,
        previewUrl: photo.previewUrl || photo.dataUrl,
        addedAt: now,
      }
      store.put(entry)
      savedCount++
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close()
        resolve(savedCount)
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
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
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const countRequest = store.count()

    return new Promise((resolve) => {
      countRequest.onsuccess = () => {
        db.close()
        resolve(countRequest.result || 0)
      }
      countRequest.onerror = () => {
        db.close()
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
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close()
        resolve(request.result || [])
      }
      request.onerror = () => {
        db.close()
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
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
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
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
  } catch (error) {
    console.error('Failed to clear photo vault:', error)
  }
}
