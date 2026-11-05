import {it,expect,vi} from 'vitest'
import {prepareAudienceSheet,reviewAudienceImport,readAudienceImportFile,importAudienceContacts} from '../audienceImportService'
import {supabase} from '../../lib/supabaseClient'
vi.mock('../../lib/supabaseClient',()=>({supabase:{rpc:vi.fn()}}))
it('maps common headers, normalises email and keeps the strictest duplicate permission',()=>{
 const sheet=prepareAudienceSheet([['Email address','First Name','Consent','Consent source','Consent date'],[' PAT@example.test ','Pat','opted_in','Web form','2026-01-01'],['pat@example.test','Pat','opted_out','',''],['bad','Bad','','','']])
 const review=reviewAudienceImport(sheet,sheet.mapping,new Date('2026-11-05T00:00:00Z'))
 expect(review.contacts).toHaveLength(1);expect(review.contacts[0]).toMatchObject({email:'pat@example.test',consent:'opted_out'});expect(review.duplicates).toBe(1);expect(review.invalid).toBe(1)
})
it('keeps missing permission unknown and requires source and a valid non-future date for opt-in',()=>{
 const sheet=prepareAudienceSheet([['Email','Consent','Consent source','Consent date'],['unknown@example.test','','',''],['missing@example.test','opted_in','',''],['future@example.test','opted_in','Form','2099-01-01'],['bad-date@example.test','opted_in','Form','2026-02-30'],['yes@example.test','yes','Form','2026-01-01']]);const review=reviewAudienceImport(sheet,sheet.mapping,new Date('2026-11-05'))
 expect(review.contacts).toEqual([expect.objectContaining({email:'unknown@example.test',consent:'unknown'})]);expect(review.invalid).toBe(4)
})
it('rejects duplicate headers, extra rows, empty sheets and unsupported file types',async()=>{
 expect(()=>prepareAudienceSheet([['Email','email'],['a','b']])).toThrow('unique');expect(()=>prepareAudienceSheet([['Email']])).toThrow('at least one');expect(()=>prepareAudienceSheet([['Email'],...Array.from({length:1001},()=>['test@example.test'])])).toThrow('1,000')
 await expect(readAudienceImportFile({name:'file.pdf',size:100})).rejects.toThrow('.csv');await expect(readAudienceImportFile({name:'file.csv',size:6*1024*1024})).rejects.toThrow('5 MiB')
})
it('reads CSV quoting and Excel through the same mapping preview',async()=>{
 const csv=await readAudienceImportFile({name:'list.csv',size:100,text:async()=> 'Email,First name,Last name\r\npat@example.test,"Pat, Jr",Smith'})
 expect(reviewAudienceImport(csv,csv.mapping).contacts[0].firstName).toBe('Pat, Jr')
 const XLSX=await import('xlsx');const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Email','First Name'],['excel@example.test','Excel']]),'Audience');for(const [extension,bookType] of [['xlsx','xlsx'],['xls','biff8']]){const bytes=XLSX.write(workbook,{type:'array',bookType});const excel=await readAudienceImportFile({name:`list.${extension}`,size:bytes.byteLength,arrayBuffer:async()=>bytes});expect(reviewAudienceImport(excel,excel.mapping).contacts[0].email).toBe('excel@example.test')}
})
it('uses the atomic organisation-scoped import RPC and reports an unapplied update',async()=>{
 const contacts=[{email:'pat@example.test',consent:'unknown'}];supabase.rpc.mockResolvedValueOnce({data:{audienceId:'saved',contactIds:['contact']}})
 await importAudienceContacts({organisationId:'org',requestId:'request',name:' List ',subscriptionId:'category',contacts});expect(supabase.rpc).toHaveBeenCalledWith('email_import_audience',{p_org:'org',p_request:'request',p_name:'List',p_subscription:'category',p_rows:contacts})
 supabase.rpc.mockResolvedValueOnce({error:{code:'PGRST202'}});await expect(importAudienceContacts({organisationId:'org',requestId:'same',name:'List',subscriptionId:'category',contacts})).rejects.toThrow('database update')
})
