const VERSION = 1
const MAX_AGE = 7 * 24 * 60 * 60 * 1000
const DB_NAME = 'arch9-development-draft-files'
const FILE_STORE = 'files'
const fileIds = new WeakMap()
const fileWrites = new Map()
let database

export function developmentDraftScope(profile, workspace, role) {
  const user = profile?.userId || profile?.id || profile?.email
  const organisation = workspace?.id || workspace?.organisation_id || workspace?.organisationId
  return user && organisation ? `arch9:development-create:v${VERSION}:${encodeURIComponent(organisation)}:${encodeURIComponent(user)}:${encodeURIComponent(role)}` : ''
}

function storage() { return window.localStorage }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function flatRecord(value) {
  return object(value) && Object.values(value).every((field) => field === null || ['string', 'number', 'boolean'].includes(typeof field))
}
function validLayout(layout) {
  if (!object(layout) || typeof layout.id !== 'string' || typeof layout.name !== 'string' || typeof layout.propertyType !== 'string' || !Array.isArray(layout.allocations)) return false
  if (!flatRecord({ ...layout, allocations: null, fileRef: null })) return false
  return layout.allocations.every((allocation) => flatRecord(allocation) && typeof allocation.targetId === 'string') &&
    (!layout.fileRef || (flatRecord(layout.fileRef) && ['id', 'name', 'type'].every((key) => typeof layout.fileRef[key] === 'string')))
}
function validData(data) {
  return object(data) && flatRecord(data.details) && ['name', 'address', 'suburb', 'city'].every((key) => typeof data.details[key] === 'string') &&
    flatRecord(data.financials) && flatRecord(data.transactionDefaults) && flatRecord(data.developerAccess) &&
    object(data.legal) && ['agents', 'conveyancers', 'bondOriginators', 'requiredDocuments'].every((key) => Array.isArray(data.legal[key]) && data.legal[key].every(flatRecord)) &&
    Array.isArray(data.documents) && data.documents.every(flatRecord) && ['residential', 'mixed_use', 'estate'].includes(data.developmentType) && ['later', 'generate_range'].includes(data.unitConfigurationMethod) &&
    ['basic', 'units', 'unit_setup', 'financials', 'review'].includes(data.stepId) && Number.isInteger(data.stockStepIndex) && data.stockStepIndex >= 0 && data.stockStepIndex <= 2 &&
    object(data.stockPlan) && Array.isArray(data.stockPlan.groups) && data.stockPlan.groups.every((group) => object(group) && typeof group.name === 'string' && Array.isArray(group.floors) && group.floors.every((floor) => flatRecord(floor) && typeof floor.name === 'string')) &&
    Array.isArray(data.stockPlan.unitTypes) && data.stockPlan.unitTypes.every((type) => object(type) && typeof type.name === 'string' && Array.isArray(type.floorplans) && type.floorplans.every(validLayout)) &&
    (!data.stockEditor || (object(data.stockEditor) && validLayout(data.stockEditor.layout)))
}

export function readDevelopmentDraft(scope) {
  if (!scope) return null
  const raw = storage().getItem(scope)
  if (!raw) return null
  try {
    const record = JSON.parse(raw)
    if (record.version === VERSION && record.scope === scope && Number.isFinite(record.updatedAt) && record.updatedAt <= Date.now() + 60000 && Date.now() - record.updatedAt < MAX_AGE &&
        (record.savedDevelopment ? (typeof record.savedDevelopment.id === 'string' && Boolean(record.savedDevelopment.id.trim()) && (!record.savedDevelopment.name || typeof record.savedDevelopment.name === 'string')) : validData(record.data))) return record
  } catch { /* A malformed draft must never replace the form. */ }
  storage().removeItem(scope)
  void clearFiles(scope).catch(() => {})
  return null
}

function openDatabase() {
  if (database) return database
  database = new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('File recovery unavailable'))
    const request = window.indexedDB.open(DB_NAME, 1)
    let expired = false
    const timer = window.setTimeout(() => { expired = true; reject(new Error('File recovery unavailable')) }, 4000)
    request.onupgradeneeded = () => request.result.createObjectStore(FILE_STORE)
    request.onerror = request.onblocked = () => { expired = true; window.clearTimeout(timer); reject(new Error('File recovery unavailable')) }
    request.onsuccess = () => {
      if (expired) { request.result.close(); return }
      window.clearTimeout(timer)
      const db = request.result
      db.onversionchange = () => { db.close(); database = null; fileWrites.clear() }
      resolve(db)
    }
  }).catch((error) => { database = null; throw error })
  return database
}

function writeFiles(scope, files) {
  const fresh = [...files].filter(([id]) => !fileWrites.has(`${scope}:${id}`))
  if (fresh.length) {
    const written = openDatabase().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(FILE_STORE, 'readwrite')
      for (const [id, file] of fresh) transaction.objectStore(FILE_STORE).put(file, `${scope}:${id}`)
      transaction.oncomplete = resolve
      transaction.onerror = transaction.onabort = () => reject(new Error('Files not saved on this device'))
    })).catch((error) => {
      for (const [id] of fresh) if (fileWrites.get(`${scope}:${id}`) === written) fileWrites.delete(`${scope}:${id}`)
      throw error
    })
    for (const [id] of fresh) fileWrites.set(`${scope}:${id}`, written)
  }
  return Promise.all([...files.keys()].map((id) => fileWrites.get(`${scope}:${id}`)))
}

async function clearFiles(scope) {
  for (const key of fileWrites.keys()) if (key.startsWith(`${scope}:`)) fileWrites.delete(key)
  if (!window.indexedDB) return
  const db = await openDatabase()
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE, 'readwrite')
    const cursor = transaction.objectStore(FILE_STORE).openKeyCursor()
    cursor.onsuccess = () => {
      const entry = cursor.result
      if (!entry) return
      if (String(entry.key).startsWith(`${scope}:`)) transaction.objectStore(FILE_STORE).delete(entry.key)
      entry.continue()
    }
    transaction.oncomplete = resolve
    transaction.onerror = transaction.onabort = reject
  })
}

function packLayout(layout, files) {
  const { file, ...rest } = layout
  if (!file) return { ...rest, file: null }
  let id = fileIds.get(file)
  if (!id) { id = crypto.randomUUID(); fileIds.set(file, id) }
  files.set(id, file)
  return { ...rest, file: null, fileRef: { id, name: file.name, type: file.type, lastModified: file.lastModified } }
}

export function writeDevelopmentDraft(scope, data) {
  if (!scope) throw new Error('Recovery unavailable')
  const files = new Map()
  const record = { version: VERSION, scope, updatedAt: Date.now(), data: {
    ...data,
    stockPlan: { ...data.stockPlan, unitTypes: data.stockPlan.unitTypes.map((type) => ({ ...type, floorplans: type.floorplans.map((layout) => packLayout(layout, files)) })) },
    stockEditor: data.stockEditor ? { ...data.stockEditor, layout: packLayout(data.stockEditor.layout, files) } : null,
  } }
  // Text is synchronous so closing or refreshing cannot outrun a debounce.
  storage().setItem(scope, JSON.stringify(record))
  return writeFiles(scope, files)
}

export async function restoreDevelopmentDraft(record) {
  const restoreLayout = async (layout) => {
    if (!layout.fileRef) return layout
    const { fileRef, ...rest } = layout
    try {
      const db = await openDatabase()
      const blob = await new Promise((resolve, reject) => {
        const request = db.transaction(FILE_STORE).objectStore(FILE_STORE).get(`${record.scope}:${fileRef.id}`)
        request.onsuccess = () => resolve(request.result)
        request.onerror = reject
      })
      if (!blob) throw new Error('Missing attachment')
      const file = new File([blob], fileRef.name, { type: fileRef.type, lastModified: fileRef.lastModified })
      fileIds.set(file, fileRef.id)
      return { ...rest, file, recoveryFileName: '' }
    } catch { return { ...rest, file: null, recoveryFileName: fileRef.name } }
  }
  const data = record.data
  return { ...data,
    stockPlan: { ...data.stockPlan, unitTypes: await Promise.all(data.stockPlan.unitTypes.map(async (type) => ({ ...type, floorplans: await Promise.all(type.floorplans.map(restoreLayout)) }))) },
    stockEditor: data.stockEditor ? { ...data.stockEditor, layout: await restoreLayout(data.stockEditor.layout) } : null,
  }
}

export function markDevelopmentDraftCreated(scope, savedDevelopment) {
  if (!scope) return
  storage().setItem(scope, JSON.stringify({ version: VERSION, scope, updatedAt: Date.now(), savedDevelopment: { id: savedDevelopment.id, name: savedDevelopment.name || '' } }))
  void clearFiles(scope).catch(() => {})
}

export function clearDevelopmentDraft(scope) {
  if (!scope) return
  const previous = storage().getItem(scope)
  storage().removeItem(scope)
  if (previous) void clearFiles(scope).catch(() => {})
}
