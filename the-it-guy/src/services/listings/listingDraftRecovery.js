const DB_NAME = 'arch9-listing-drafts'
const MAX_AGE = 7 * 24 * 60 * 60 * 1000
let database
const writes = new Map()
const unreadableScopes = new Set()
const savedFiles = new Map()
const fileIds = new WeakMap()
function openDatabase() {
  if (database) return database
  database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Photo recovery is unavailable in this browser.'))
    const request = indexedDB.open(DB_NAME, 1)
    let expired = false
    const timer = setTimeout(() => { expired = true; reject(new Error('Photo recovery storage is unavailable.')) }, 4000)
    request.onupgradeneeded = () => { request.result.createObjectStore('drafts'); request.result.createObjectStore('photos') }
    request.onerror = request.onblocked = () => { expired = true; clearTimeout(timer); reject(new Error('Photo recovery storage is unavailable.')) }
    request.onsuccess = () => {
      clearTimeout(timer)
      if (expired) { request.result.close(); return }
      const db = request.result
      db.onversionchange = () => { db.close(); database = null; savedFiles.clear() }
      resolve(db)
    }
  }).catch(error => { database = null; throw error })
  return database
}
function ordered(scope, operation) {
  const pending = (writes.get(scope) || Promise.resolve()).catch(() => {}).then(operation)
  writes.set(scope, pending)
  void pending.finally(() => { if (writes.get(scope) === pending) writes.delete(scope) }).catch(() => {})
  return pending
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onerror = transaction.onabort = () => reject(new Error('Draft photos could not be saved on this device. Keep this tab open until the listing is saved.'))
  })
}

// Text and photo references commit together. File bytes are written only when
// selected/replaced, never again for each keystroke in the form.
export function saveListingRecoveryDraft(scope, { form, recovery = {}, photoField = 'listingImages' }) {
  if (!scope) return Promise.resolve()
  return ordered(scope, async () => {
    if (unreadableScopes.has(scope)) throw new Error('The previous photo draft could not be read. Reload before replacing its recovery copy.')
    const files = []
    const photos = (form[photoField] || []).map(photo => {
      const next = { ...photo }; delete next.file
      if (typeof Blob !== 'undefined' && photo.file instanceof Blob) {
        let id = fileIds.get(photo.file)
        if (!id) { id = crypto.randomUUID(); fileIds.set(photo.file, id) }
        next.recoveryFileId = id
        files.push({ key: `${scope}:${id}`, file: photo.file })
      }
      if (/^(blob:|data:)/i.test(next.url || '')) next.url = ''
      return next
    })
    const db = await openDatabase()
    const transaction = db.transaction(['drafts','photos'], 'readwrite')
    for (const { key, file } of files) if (savedFiles.get(key) !== file) transaction.objectStore('photos').put(file, key)
    transaction.objectStore('drafts').put({ scope, updatedAt: Date.now(), form: { ...form, [photoField]: photos }, recovery, photoField }, scope)
    await transactionDone(transaction)
    for (const { key, file } of files) savedFiles.set(key, file)
  })
}
async function readDraft(scope) {
  if (!scope) return null
  await writes.get(scope)?.catch(() => {})
  const db = await openDatabase()
  const record = await new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(scope)
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
  })
  if (!record) return null
  if (record.scope !== scope || !Number.isFinite(record.updatedAt) || Date.now() - record.updatedAt > MAX_AGE) { await clearListingRecoveryDraft(scope); return null }
  const urls = []
  let missingPhotos = 0
  const photos = await Promise.all((record.form[record.photoField] || []).map(async photo => {
    if (!photo.recoveryFileId) return photo
    const file = await new Promise((resolve, reject) => {
      const request = db.transaction('photos').objectStore('photos').get(`${scope}:${photo.recoveryFileId}`)
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    if (!(file instanceof Blob)) { missingPhotos++; return photo }
    const restoredFile = file instanceof File ? file : new File([file], photo.name || 'photo.jpg', { type: file.type })
    const url = URL.createObjectURL(restoredFile); urls.push(url)
    return { ...photo, file: restoredFile, url }
  }))
  return { ...record, form: { ...record.form, [record.photoField]: photos }, missingPhotos, release: () => urls.forEach(url => URL.revokeObjectURL(url)) }
}
export async function readListingRecoveryDraft(scope) {
  try {
    const draft = await readDraft(scope)
    unreadableScopes.delete(scope)
    return draft
  } catch (error) {
    // A transient read failure must not let an empty form erase stored photos.
    unreadableScopes.add(scope)
    throw error
  }
}
export function clearListingRecoveryDraft(scope) {
  if (!scope) return Promise.resolve()
  return ordered(scope, async () => {
    const db = await openDatabase()
    const transaction = db.transaction(['drafts','photos'], 'readwrite')
    transaction.objectStore('drafts').delete(scope)
    const cursor = transaction.objectStore('photos').openCursor()
    cursor.onsuccess = () => { const row = cursor.result; if (!row) return; if (String(row.key).startsWith(`${scope}:`)) row.delete(); row.continue() }
    await transactionDone(transaction)
    for (const key of savedFiles.keys()) if (key.startsWith(`${scope}:`)) savedFiles.delete(key)
  })
}
