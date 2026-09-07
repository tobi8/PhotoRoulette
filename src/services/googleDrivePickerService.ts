/**
 * Google Drive Online Cloud Picker Service
 * Allows users to browse, view, and select photos or entire folders directly from Google Drive online.
 */

declare const google: any
declare const gapi: any

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  thumbnailUrl?: string
}

let gsiLoaded = false
let gapiLoaded = false

/**
 * Dynamically loads Google Identity Services and Google API scripts
 */
export async function loadGoogleScripts(): Promise<void> {
  const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`)
      if (existing) return resolve()
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error(`Failed to load script ${src}`))
      document.body.appendChild(script)
    })
  }

  const tasks: Promise<void>[] = []
  if (!gsiLoaded && typeof google === 'undefined') {
    tasks.push(loadScript('https://accounts.google.com/gsi/client').then(() => { gsiLoaded = true }))
  }
  if (!gapiLoaded && (typeof window === 'undefined' || !(window as any).gapi?.load)) {
    tasks.push(loadScript('https://apis.google.com/js/api.js').then(() => {
      return new Promise<void>((resolve) => {
        const win = window as any
        if (win.gapi && win.gapi.load) {
          win.gapi.load('picker', () => {
            gapiLoaded = true
            resolve()
          })
        } else {
          resolve()
        }
      })
    }))
  }

  await Promise.all(tasks)
}

/**
 * Gets the configured Google Client ID from environment or localStorage
 */
export function getSavedGoogleClientId(): string {
  if (typeof window === 'undefined') return ''
  return (
    (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
    localStorage.getItem('photoroulette_google_client_id') ||
    ''
  )
}

/**
 * Saves a Google Client ID in localStorage for persistent use
 */
export function saveGoogleClientId(clientId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('photoroulette_google_client_id', clientId.trim())
  }
}

/**
 * Prompts user with OAuth popup and opens the official Google Picker to select photos/folders
 */
export async function openGoogleDriveOnlinePicker(options: {
  clientId?: string
  apiKey?: string
  onProgress?: (status: string) => void
}): Promise<File[]> {
  const clientId = options.clientId || getSavedGoogleClientId()
  if (!clientId) {
    throw new Error('MISSING_CLIENT_ID')
  }

  options.onProgress?.('Loading Google Drive Cloud Viewer...')
  await loadGoogleScripts()

  return new Promise((resolve, reject) => {
    try {
      options.onProgress?.('Authenticating with Google Account...')
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: async (response: any) => {
          if (response.error) {
            return reject(new Error(response.error_description || response.error))
          }

          const accessToken = response.access_token
          options.onProgress?.('Opening Google Drive file viewer...')

          // Setup Google Picker with photos, images, and folders
          const viewImages = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMode(google.picker.DocsViewMode.GRID)

          const viewFolders = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
            .setSelectFolderEnabled(true)

          const builder = new google.picker.PickerBuilder()
            .addView(viewImages)
            .addView(viewFolders)
            .addView(google.picker.ViewId.PHOTOS)
            .setOAuthToken(accessToken)
            .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
            .setTitle('Select Photos or Folder from Google Drive')
            .setCallback(async (data: any) => {
              if (data.action === google.picker.Action.CANCEL) {
                return resolve([])
              }

              if (data.action === google.picker.Action.PICKED) {
                try {
                  const docs: any[] = data.docs || []
                  options.onProgress?.(`Processing ${docs.length} item(s) from Drive...`)

                  const filesToDownload: Array<{ id: string; name: string; mimeType: string }> = []

                  for (const doc of docs) {
                    if (doc.mimeType === 'application/vnd.google-apps.folder') {
                      options.onProgress?.(`Reading files from folder "${doc.name}"...`)
                      // Query all images and videos inside the chosen Google Drive folder
                      const q = encodeURIComponent(
                        `'${doc.id}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`
                      )
                      const folderRes = await fetch(
                        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=100`,
                        {
                          headers: { Authorization: `Bearer ${accessToken}` },
                        }
                      )
                      const folderData = await folderRes.json()
                      if (folderData.files && folderData.files.length > 0) {
                        filesToDownload.push(...folderData.files)
                      }
                    } else {
                      filesToDownload.push({
                        id: doc.id,
                        name: doc.name || `photo-${doc.id}`,
                        mimeType: doc.mimeType || 'image/jpeg',
                      })
                    }
                  }

                  if (filesToDownload.length === 0) {
                    return resolve([])
                  }

                  options.onProgress?.(`Downloading ${filesToDownload.length} photos from Google Drive...`)
                  const downloadedFiles: File[] = []

                  for (let i = 0; i < filesToDownload.length; i++) {
                    const item = filesToDownload[i]
                    options.onProgress?.(`Downloading photo ${i + 1} of ${filesToDownload.length}...`)
                    try {
                      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                      })
                      if (!res.ok) {
                        // Fallback to high-res thumbnail if direct alt=media is restricted
                        const thumbRes = await fetch(`https://drive.google.com/thumbnail?id=${item.id}&sz=w1200`, {
                          headers: { Authorization: `Bearer ${accessToken}` },
                        })
                        if (thumbRes.ok) {
                          const thumbBlob = await thumbRes.blob()
                          downloadedFiles.push(new File([thumbBlob], item.name, { type: thumbBlob.type || item.mimeType }))
                        }
                        continue
                      }
                      const blob = await res.blob()
                      const fileObj = new File([blob], item.name, { type: blob.type || item.mimeType })
                      downloadedFiles.push(fileObj)
                    } catch (fetchErr) {
                      console.warn('Failed to download Google Drive file', item.name, fetchErr)
                    }
                  }

                  resolve(downloadedFiles)
                } catch (err) {
                  reject(err)
                }
              }
            })

          if (options.apiKey) {
            builder.setDeveloperKey(options.apiKey)
          }

          const picker = builder.build()
          picker.setVisible(true)
        },
      })

      tokenClient.requestAccessToken({ prompt: '' })
    } catch (err) {
      reject(err)
    }
  })
}
