// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { saveListingRecoveryDraft, readListingRecoveryDraft, clearListingRecoveryDraft, writeListingTextRecoveryDraft, reconcileListingEditRecovery } from '../listingDraftRecovery'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function browserStorage() {
 const values = new Map()
 vi.stubGlobal('localStorage', { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) })
 return values
}

it.each(['sale', 'rental', 'developer'])('keeps newest %s text with older photo bytes, including clears and reordered photos', async kind => {
 browserStorage()
 const scope = `newest:${kind}`; const photoField = kind === 'rental' ? 'galleryImages' : 'listingImages'
 const file = new File(['photo-bytes'], 'local.jpg', { type: 'image/jpeg' })
 const photos = [{ id: 'local', file, url: 'blob:preview' }, { id: 'remote', url: 'https://fixture.example/photo.jpg' }]
 await saveListingRecoveryDraft(scope, { form: { title: 'Older', selectedSyndicationChannels: ['property24'], [photoField]: photos }, photoField })
 writeListingTextRecoveryDraft(scope, { form: { title: '', selectedSyndicationChannels: [], [photoField]: [...photos].reverse(), coverImageId: 'remote' }, photoField })
 const restored = await readListingRecoveryDraft(scope)
 expect(restored.form.title).toBe(''); expect(restored.form.selectedSyndicationChannels).toEqual([])
 expect(restored.form[photoField].map(photo => photo.id)).toEqual(['remote', 'local'])
 expect(await restored.form[photoField][1].file.text()).toBe('photo-bytes')
 expect(restored.form.coverImageId).toBe('remote')
 restored.release(); await clearListingRecoveryDraft(scope)
})

it('recovers text while clearly counting photo bytes that never committed', async () => {
 browserStorage()
 const scope = 'uncommitted-photo'
 writeListingTextRecoveryDraft(scope, { form: { title: 'Latest text', listingImages: [{ id: 'new', file: new File(['bytes'], 'new.jpg'), url: 'blob:new' }] } })
 const restored = await readListingRecoveryDraft(scope)
 expect(restored.form.title).toBe('Latest text'); expect(restored.missingPhotos).toBe(1)
 await clearListingRecoveryDraft(scope)
})

it.each(['residential','commercial','industrial','retail','agricultural','mixed_use','vacant_land'])('recovers %s edits with deliberate clears and protects untouched competing values', category => {
 const baseForm = { propertyCategory: category, description: 'Original', selectedSyndicationChannels: ['property24'], specialistSize: '12.5', monthlyRent: '11000', expectedUpdatedAt: 'old' }
 const draft = { form: { ...baseForm, description: '', selectedSyndicationChannels: [], specialistSize: '42.5' }, recovery: { baseForm, baseRevision: 'old|' } }
 const unchanged = reconcileListingEditRecovery(draft, baseForm, 'old|')
 expect(unchanged.conflict).toBe(false); expect(unchanged.form.description).toBe(''); expect(unchanged.form.selectedSyndicationChannels).toEqual([])
 const competing = reconcileListingEditRecovery(draft, { ...baseForm, monthlyRent: '15000', expectedUpdatedAt: 'new' }, 'new|')
 expect(competing.conflict).toBe(true); expect(competing.form.monthlyRent).toBe('15000')
 expect(competing.form.specialistSize).toBe('42.5'); expect(competing.form.expectedUpdatedAt).toBe('new')
})

it('requires review for an old edit draft without a trustworthy saved baseline', () => {
 expect(reconcileListingEditRecovery({ form: { description: '' } }, { description: 'Saved' }, 'current|').conflict).toBe(true)
})

it('does not turn a confirmed save into a failure when browser cleanup is blocked', async () => {
 browserStorage()
 await saveListingRecoveryDraft('blocked-cleanup', { form: { title: 'Already saved', listingImages: [] } })
 vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('Browser storage blocked') })
 await expect(clearListingRecoveryDraft('blocked-cleanup')).resolves.toBeUndefined()
})

it.each(['sale','rental','developer'])('restores %s text, original photo bytes, cover and order after reopening',async kind=>{
 const scope=`user:agency:${kind}`;const field=kind==='rental'?'galleryImages':'listingImages'
 const file=new File(['original-image-bytes'],'original.jpg',{type:'image/jpeg'})
 const form={title:'Captured listing',[field]:[{id:'one',name:file.name,file,url:'blob:expired'},{id:'two',url:'https://fixture.example/2.jpg'}],coverImageId:'one'}
 await saveListingRecoveryDraft(scope,{form,photoField:field,recovery:{pendingListingId:'saved-listing'}})
 const restored=await readListingRecoveryDraft(scope)
 expect(restored.form.title).toBe(form.title);expect(restored.form[field].map(p=>p.id)).toEqual(['one','two'])
 expect(await restored.form[field][0].file.text()).toBe('original-image-bytes');expect(restored.form[field][0].url).toMatch(/^blob:/)
 expect(restored.recovery.pendingListingId).toBe('saved-listing');expect(restored.missingPhotos).toBe(0)
 restored.release();await clearListingRecoveryDraft(scope);expect(await readListingRecoveryDraft(scope)).toBeNull()
})
it('isolates agency/user/type and orders rapid edits before deletion',async()=>{
 const scope='agent-a:agency-a:sale';const first=saveListingRecoveryDraft(scope,{form:{title:'First',listingImages:[]}})
 const second=saveListingRecoveryDraft(scope,{form:{title:'Latest',listingImages:[]}})
 await Promise.all([first,second]);expect((await readListingRecoveryDraft(scope)).form.title).toBe('Latest')
 for(const other of ['agent-b:agency-a:sale','agent-a:agency-b:sale','agent-a:agency-a:developer']) expect(await readListingRecoveryDraft(other)).toBeNull()
 const pending=saveListingRecoveryDraft(scope,{form:{title:'Pending',listingImages:[]}});const clear=clearListingRecoveryDraft(scope)
 await Promise.all([pending,clear]);expect(await readListingRecoveryDraft(scope)).toBeNull()
})
it('expires drafts rather than restoring old photos indefinitely',async()=>{
 await saveListingRecoveryDraft('expired',{form:{listingImages:[]}})
 const time=vi.spyOn(Date,'now').mockReturnValue(Date.now()+8*24*60*60*1000)
 expect(await readListingRecoveryDraft('expired')).toBeNull();time.mockRestore()
})

it('does not overwrite saved photos after a transient read failure', async () => {
 const scope='read-failure'
 await saveListingRecoveryDraft(scope,{form:{title:'Retain me',listingImages:[]}})
 const failure=vi.spyOn(IDBDatabase.prototype,'transaction').mockImplementationOnce(()=>{throw new Error('Storage unavailable')})
 await expect(readListingRecoveryDraft(scope)).rejects.toThrow('Storage unavailable')
 failure.mockRestore()
 await expect(saveListingRecoveryDraft(scope,{form:{title:'Empty replacement',listingImages:[]}})).rejects.toThrow('could not be read')
 expect((await readListingRecoveryDraft(scope)).form.title).toBe('Retain me')
 await saveListingRecoveryDraft(scope,{form:{title:'Recovered edit',listingImages:[]}})
 expect((await readListingRecoveryDraft(scope)).form.title).toBe('Recovered edit')
 await clearListingRecoveryDraft(scope)
})

it('does not restore a recovery copy that is identical to the confirmed saved form', () => {
 const form = { listingTitle: 'Saved', listingImages: [], listingPrice: '1234567' }
 expect(reconcileListingEditRecovery({ form, recovery: { baseForm: form, baseRevision: 'saved|' } }, form, 'saved|')).toBeNull()
 expect(reconcileListingEditRecovery({ form, recovery: { baseForm: form, baseRevision: 'old|' } }, { ...form, listingPrice: '1300000' }, 'new|')).toBeNull()
})

it('discards text recovery when photo storage is unavailable', async () => {
 browserStorage()
 vi.stubGlobal('indexedDB', undefined)
 const scope = 'discard:text-only'
 writeListingTextRecoveryDraft(scope, { form: { title: 'Old rental', galleryImages: [] }, photoField: 'galleryImages' })
 await clearListingRecoveryDraft(scope)
 expect(await readListingRecoveryDraft(scope)).toBeNull()
})
