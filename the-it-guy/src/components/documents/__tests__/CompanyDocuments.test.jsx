// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,test,vi } from 'vitest'
import CompanyDocuments from '../CompanyDocuments.jsx'
import { fetchCompanyDocuments,uploadCompanyDocument,changeCompanyDocument } from '../../../domains/documents/companyDocumentsApi.js'
vi.mock('../../../domains/documents/companyDocumentsApi.js',()=>({fetchCompanyDocuments:vi.fn(),uploadCompanyDocument:vi.fn(),changeCompanyDocument:vi.fn(),createCompanyDocumentSignedUrl:vi.fn(),COMPANY_DOCUMENT_CHANGE_EVENT:'arch9:company-documents-changed'}))
vi.mock('../../../lib/settingsApi.js',()=>({fetchOrganisationSettings:vi.fn()}))
vi.mock('../DocumentAccessButton.jsx',()=>({default:()=> <button>Open file</button>}))
const org='org-a',actor='user-a'
const row={id:'doc-a',organisation_id:org,uploaded_by:actor,title:'Company certificate',category:'CIPC Documents',fileName:'certificate.pdf',storagePath:'org/file.pdf',storageBucket:'company-documents',version:1,revision:1,status:'approved',visibility:'management'}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();fetchCompanyDocuments.mockResolvedValue({organisationId:org,canManageAll:true,documents:[]});uploadCompanyDocument.mockResolvedValue({...row,saved:true});changeCompanyDocument.mockResolvedValue({...row,saved:true,archivedAt:'2026-11-09'})})
afterEach(cleanup)
async function open(){render(<CompanyDocuments organisationId={org} organisationName="Kingdom" actorId={actor} />);await screen.findByText('No company documents uploaded yet.')}
function chooseFile(){fireEvent.change(screen.getByPlaceholderText('e.g. CIPC Registration'),{target:{value:'Company certificate'}});fireEvent.change(screen.getByLabelText('Document file'),{target:{files:[new File(['%PDF-1.4 bytes'],'certificate.pdf',{type:'application/pdf'})]}})}

test('new files are saved securely with management access and no browser file cache',async()=>{
 await open();chooseFile()
 uploadCompanyDocument.mockImplementation(async args=>{args.onProgress({stage:'saving',message:'Saving…',fileName:args.file.name});args.onProgress({stage:'complete',fileName:args.file.name});return {...row,saved:true}})
 fireEvent.click(screen.getByRole('button',{name:'Upload Document'}))
 await screen.findByText(/Company document saved securely/)
 expect(uploadCompanyDocument.mock.calls[0][0]).toMatchObject({organisationId:org,actorId:actor,visibility:'management',title:'Company certificate'})
 expect(localStorage.getItem(`itg:developer-company-docs:v1:${actor}`)).toBeNull()
 expect(fetchCompanyDocuments).toHaveBeenCalledTimes(2)
})
test('reopened company workspaces read server files and manager sharing is an explicit action',async()=>{
 fetchCompanyDocuments.mockResolvedValue({organisationId:org,canManageAll:true,documents:[row]})
 const view=render(<CompanyDocuments organisationId={org} actorId={actor} />)
 await screen.findByText('Company certificate')
 fireEvent.click(screen.getByRole('button',{name:'Share with staff'}))
 await screen.findByText('Document sharing updated.')
 expect(changeCompanyDocument.mock.calls[0][0]).toMatchObject({organisationId:org,document:row,action:'visibility',visibility:'organisation'})
 view.unmount();render(<CompanyDocuments organisationId={org} actorId={actor} />)
 await screen.findByText('Company certificate')
 expect(fetchCompanyDocuments.mock.calls.length).toBeGreaterThan(2)
})
test('staff cannot share files and replacements require an actual new file',async()=>{
 fetchCompanyDocuments.mockResolvedValue({organisationId:org,canManageAll:false,documents:[row]})
 render(<CompanyDocuments organisationId={org} actorId={actor} />)
 await screen.findByText('Company certificate')
 expect(screen.queryByRole('button',{name:'Share with staff'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Replace'}))
 expect(screen.getByRole('button',{name:'Save Replacement'}).disabled).toBe(true)
 expect(screen.getByLabelText('Access').disabled).toBe(true)
})
test('an uncertain save keeps the selected file available and never claims it was not saved',async()=>{
 await open();chooseFile()
 uploadCompanyDocument.mockRejectedValue(Object.assign(new Error('Connection lost'),{code:'document_save_unconfirmed',retained:true}))
 fireEvent.click(screen.getByRole('button',{name:'Upload Document'}))
 await screen.findAllByRole('alert')
 expect(screen.getByLabelText('Document file').files[0].name).toBe('certificate.pdf')
 expect(screen.getAllByText(/check the saved record/).length).toBeGreaterThan(0)
})
test('failed access loads do not expose a writable or apparently healthy empty workspace',async()=>{
 fetchCompanyDocuments.mockRejectedValue(new Error('Organisation access denied'))
 render(<CompanyDocuments organisationId={org} actorId={actor} />)
 await screen.findByRole('alert')
 expect(screen.queryByText('No company documents uploaded yet.')).toBeNull()
 expect(screen.getByRole('button',{name:'Upload Document'}).disabled).toBe(true)
 expect(screen.getByLabelText('Document file').disabled).toBe(true)
})
test('browser recovery is explicit, defaults to restricted access, and clears only confirmed saved copies',async()=>{
 const legacy={id:'company_doc_1',title:'Old certificate',category:'CIPC Documents',fileName:'old.pdf',fileUrl:'data:application/pdf;base64,JVBERi0xLjQ='}
 localStorage.setItem(`itg:developer-company-docs:v1:${actor}`,JSON.stringify([legacy]))
 uploadCompanyDocument.mockResolvedValue({...row,saved:true,legacy_import_key:'company_doc_1:sha'})
 await open()
 expect(uploadCompanyDocument).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Recover browser documents to this organisation'}))
 await screen.findByText(/Browser-saved documents recovered securely/)
 expect(uploadCompanyDocument.mock.calls[0][0]).toMatchObject({organisationId:org,actorId:actor,legacyId:'company_doc_1',visibility:'management',status:'pending_review'})
 expect(JSON.parse(localStorage.getItem(`itg:developer-company-docs:v1:${actor}`))).toEqual([])
})
test('late reads from an old organisation cannot populate the next workspace',async()=>{
 let finish
 fetchCompanyDocuments.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({organisationId:'org-b',canManageAll:false,documents:[]})
 const view=render(<CompanyDocuments key="a" organisationId={org} actorId={actor} />)
 await waitFor(()=>expect(finish).toBeTypeOf('function'))
 view.rerender(<CompanyDocuments key="b" organisationId="org-b" actorId={actor} />)
 await screen.findByText('No company documents uploaded yet.')
 await act(async()=>{finish({organisationId:org,canManageAll:true,documents:[row]})})
 expect(screen.queryByText('Company certificate')).toBeNull()
})
