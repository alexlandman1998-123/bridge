// @vitest-environment node
import { expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { saveListingRecoveryDraft, readListingRecoveryDraft, clearListingRecoveryDraft } from '../listingDraftRecovery'

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
