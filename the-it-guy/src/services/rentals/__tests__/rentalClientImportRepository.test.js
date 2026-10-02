import { describe, expect, it, vi } from 'vitest'
import { listRentalImportContacts, previewRentalClientImport, saveRentalImportedContact } from '../rentalClientImportRepository.js'

describe('rental client imports', () => {
  it('preserves quoted names, notes and both rental roles', () => {
    const rows = previewRentalClientImport('Name;Email;Phone;Contact Type;Notes\n"River, Trust";owner@example.com;;landlord;"Line one\nLine two"\nAlex Tenant;;0825550101;tenant;Call after 5')
    expect(rows.map((row) => row.state)).toEqual(['ready', 'ready'])
    expect(rows[0]).toMatchObject({name:'River, Trust', contactType:'landlord', notes:'Line one\nLine two'})
    expect(rows[1]).toMatchObject({name:'Alex Tenant', phone:'0825550101', contactType:'tenant'})
  })
  it('matches email case and local/international phone duplicates without merging on names', () => {
    const rows = previewRentalClientImport('Name,Email,Phone,Contact Type\nAlex,OLD@example.com,,tenant\nBob,,0825550101,landlord\nChris,new@example.com,,tenant\nChris,other@example.com,,tenant\nCopy,NEW@example.com,,tenant', [{email:'old@example.com'}, {phone:'+27 82 555 0101'}])
    expect(rows.map((row) => row.state)).toEqual(['duplicate','duplicate','ready','ready','duplicate'])
  })
  it('flags missing names, missing contact details, invalid emails and unknown types', () => {
    const rows = previewRentalClientImport('Name,Email,Phone,Contact Type\n,owner@example.com,,landlord\nAlex,,,tenant\nBob,bad,,tenant\nChris,ok@example.com,,unknown')
    expect(rows.every((row) => row.state === 'invalid')).toBe(true)
    expect(() => previewRentalClientImport('Name,Email')).toThrow('no contacts')
  })
  it('reads duplicate candidates within the selected organisation', async () => {
    const query = {select:vi.fn(),eq:vi.fn(),order:vi.fn(),range:vi.fn().mockResolvedValue({data:[{email:'owner@example.com'}],error:null})}
    for (const key of ['select','eq','order']) query[key].mockReturnValue(query)
    const client = {from:vi.fn().mockReturnValue(query)}
    expect(await listRentalImportContacts('org', {client})).toEqual([{email:'owner@example.com'}])
    expect(query.eq).toHaveBeenCalledWith('organisation_id','org')
    expect(client.from).toHaveBeenCalledWith('contacts')
  })
  it('persists and verifies every contact field using the stable id when retrying', async () => {
    const [row] = previewRentalClientImport('Name,Email,Phone,Contact Type,Notes\nAlex Tenant,alex@example.com,0825550101,tenant,Call first')
    let payload
    const query = {upsert:vi.fn((data) => {payload=data;return query}),select:vi.fn(() => query),single:vi.fn(async () => ({data:payload,error:null}))}
    const client = {from:vi.fn(() => query)}
    const first = await saveRentalImportedContact('org',row,{client,actorId:'agent'})
    const second = await saveRentalImportedContact('org',row,{client,actorId:'agent'})
    expect(first).toMatchObject({contact_id:row.contactId,organisation_id:'org',assigned_agent_id:'agent',first_name:'Alex',last_name:'Tenant',email:'alex@example.com',phone:'0825550101',contact_type:'tenant',notes:'Call first'})
    expect(second.contact_id).toBe(first.contact_id)
    expect(query.upsert).toHaveBeenCalledWith(expect.any(Object),{onConflict:'contact_id'})
    expect(client.from.mock.calls.every(([table]) => table === 'contacts')).toBe(true)
    query.single.mockResolvedValueOnce({data:{...payload,notes:null},error:null})
    await expect(saveRentalImportedContact('org',row,{client,actorId:'agent'})).rejects.toThrow('could not be verified')
  })
  it('rejects invalid rows and propagates save failures', async () => {
    const [row] = previewRentalClientImport('Name,Email\nAlex,alex@example.com')
    const query = {upsert:vi.fn(() => query),select:vi.fn(() => query),single:vi.fn().mockResolvedValue({error:new Error('Save failed')})}
    const client = {from:vi.fn(() => query)}
    await expect(saveRentalImportedContact('org',{...row,state:'invalid'},{client})).rejects.toThrow('not ready')
    expect(client.from).not.toHaveBeenCalled()
    await expect(saveRentalImportedContact('org',row,{client})).rejects.toThrow('Save failed')
  })
})
