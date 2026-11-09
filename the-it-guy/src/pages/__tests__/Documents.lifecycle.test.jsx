// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Documents from '../Documents.jsx'
import { fetchDevelopmentDocuments } from '../../domains/developments/readApi.js'
import { uploadDevelopmentDocumentAsset, deleteDevelopmentDocument } from '../../lib/developmentDetailApi.js'
import { fetchDocumentWorkspacePage, fetchDocumentClientWorkspace } from '../../domains/documents/workspaceReadApi.js'
import { uploadDocument } from '../../domains/documents/uploadWorkflow.js'
vi.mock('../../context/WorkspaceContext',()=>({useWorkspace:()=>({workspace:{id:'all'},role:'developer',profile:{id:'actor'}})}))
vi.mock('../../domains/transactions/detailApi.js',()=>({fetchTransactionsByParticipant:vi.fn(async()=>[])}))
vi.mock('../../domains/documents/uploadWorkflow.js',()=>({uploadDocument:vi.fn()}))
vi.mock('../../lib/developmentDetailApi',()=>({deleteDevelopmentDocument:vi.fn(),saveDevelopmentDocument:vi.fn(),uploadDevelopmentDocumentAsset:vi.fn()}))
vi.mock('../../domains/developments/selectionReadApi.js',()=>({fetchDevelopmentOptions:vi.fn(async()=>[{id:'development',name:'Selected Development'}])}))
vi.mock('../../domains/documents/workspaceReadApi.js',()=>({fetchDocumentWorkspacePage:vi.fn(async()=>({rows:[],nextCursor:null})),fetchDocumentClientWorkspace:vi.fn()}))
vi.mock('../../domains/developments/readApi.js',()=>({fetchDevelopmentDocuments:vi.fn(async()=>[])}))
vi.mock('../../domains/developments/api.js',()=>({fetchDevelopmentDetail:()=>{throw new Error('Must not load the full workspace for a document refresh')}}))
vi.mock('../../lib/settingsApi',()=>({fetchOrganisationSettings:vi.fn(async()=>({organisation:{id:'organisation'}}))}))
vi.mock('../../lib/supabaseClient',()=>({isSupabaseConfigured:true}))
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();fetchDevelopmentDocuments.mockResolvedValue([]);fetchDocumentWorkspacePage.mockResolvedValue({rows:[],nextCursor:null})})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
async function openDevelopment(){
  render(<Documents />)
  fireEvent.click(await screen.findByRole('button',{name:'Development Documents'}))
  await waitFor(()=>expect(fetchDevelopmentDocuments).toHaveBeenCalledWith('development',{includeHistory:false}))
}
async function chooseFile(){
  fireEvent.change(screen.getByPlaceholderText('e.g. NHBRC Certificate'),{target:{value:'NHBRC Certificate'}})
  fireEvent.change(screen.getByLabelText('Document file'),{target:{files:[new File(['%PDF-1.4 synthetic'],'certificate.pdf',{type:'application/pdf'})]}})
}
test('loads only the document list, shows upload/save progress and can explicitly load protected history',async()=>{
  uploadDevelopmentDocumentAsset.mockImplementation(async options=>{
    options.onProgress({stage:'saving',fileName:options.file.name,message:'Saving document…'})
    options.onProgress({stage:'complete',fileName:options.file.name,message:'Uploaded'})
    return {id:'saved',saved:true}
  })
  await openDevelopment()
  await chooseFile()
  fireEvent.click(screen.getByRole('button',{name:'Upload Document'}))
  await screen.findByText(/Uploaded · certificate.pdf/)
  await waitFor(()=>expect(fetchDevelopmentDocuments).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByLabelText('Show protected history'))
  await waitFor(()=>expect(fetchDevelopmentDocuments).toHaveBeenLastCalledWith('development',{includeHistory:true}))
})
test('an uncertain save preserves the selected file and shows recovery guidance',async()=>{
  uploadDevelopmentDocumentAsset.mockRejectedValue(Object.assign(new Error('Network storage error'),{code:'document_save_unconfirmed',retained:true}))
  await openDevelopment();await chooseFile()
  fireEvent.click(screen.getByRole('button',{name:'Upload Document'}))
  await screen.findAllByRole('alert')
  expect(screen.getByText('Selected: certificate.pdf')).toBeTruthy()
  expect(screen.getAllByText(/check the saved record/).length).toBeGreaterThan(0)
  expect(screen.queryByText(/Your file was not attached/)).toBeNull()
})
test('a denied removal keeps the row visible and explains the error',async()=>{
  fetchDevelopmentDocuments.mockResolvedValue([{id:'document',title:'Existing certificate',documentType:'nhbrc',fileUrl:'https://files.test/current.pdf'}])
  deleteDevelopmentDocument.mockRejectedValue(new Error('Removal could not be confirmed. Check your permission.'))
  await openDevelopment()
  await screen.findByText('Existing certificate')
  fireEvent.click(screen.getByRole('button',{name:'Remove'}))
  expect((await screen.findByRole('alert')).textContent).toContain('Removal could not be confirmed')
  expect(screen.getByText('Existing certificate')).toBeTruthy()
})

test('opens with selector metadata, pages it on request and loads only the chosen client',async()=>{
  const row = {unit:{id:'unit',unit_number:'1'},development:{id:'development',name:'Selected Development'},transaction:{id:'transaction'},buyer:{name:'First Buyer'},stage:'Offer'}
  fetchDocumentWorkspacePage.mockResolvedValueOnce({rows:[row],nextCursor:'unit-24'}).mockResolvedValueOnce({rows:[{...row,unit:{id:'unit2',unit_number:'2'},transaction:{id:'transaction2'},buyer:{name:'Second Buyer'}}],nextCursor:null})
  fetchDocumentClientWorkspace.mockResolvedValue({...row,documents:[],requiredChecklist:[],checklistSummary:{}})
  render(<Documents />)
  await screen.findByText('1 unit workspaces loaded. Choose a client to view their documents.')
  expect(fetchDocumentClientWorkspace).not.toHaveBeenCalled()
  expect(fetchDevelopmentDocuments).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Load more clients'}))
  await screen.findByText('2 unit workspaces loaded. Choose a client to view their documents.')
  expect(fetchDocumentWorkspacePage).toHaveBeenLastCalledWith(expect.objectContaining({afterUnitId:'unit-24',organisationId:'organisation'}))
  fireEvent.change(screen.getByLabelText('Select Client / Buyer'),{target:{value:'transaction2'}})
  await waitFor(()=>expect(fetchDocumentClientWorkspace).toHaveBeenCalledTimes(1))
  expect(fetchDocumentClientWorkspace).toHaveBeenCalledWith(expect.objectContaining({transaction:{id:'transaction2'}}),expect.objectContaining({referenceData:expect.anything()}))
  fireEvent.click(screen.getByRole('button',{name:'Company Documents'}))
  expect(fetchDevelopmentDocuments).not.toHaveBeenCalled()
})

test('shows a local retry for a selected client read and keeps the selectors available',async()=>{
  const row={unit:{id:'unit'},development:{id:'development',name:'Selected Development'},transaction:{id:'transaction'},buyer:{name:'First Buyer'},stage:'Offer'}
  fetchDocumentWorkspacePage.mockResolvedValue({rows:[row],nextCursor:null})
  fetchDocumentClientWorkspace.mockRejectedValueOnce(new Error('Client documents offline')).mockResolvedValue({...row,documents:[],requiredChecklist:[],checklistSummary:{}})
  render(<Documents />)
  fireEvent.change(await screen.findByLabelText('Select Client / Buyer'),{target:{value:'transaction'}})
  await screen.findByText('Client documents offline')
  fireEvent.click(screen.getByRole('button',{name:'Retry client documents'}))
  await waitFor(()=>expect(fetchDocumentClientWorkspace).toHaveBeenCalledTimes(2))
  expect(fetchDocumentWorkspacePage).toHaveBeenCalledTimes(1)
})

test('refreshes only the selected client after a confirmed upload',async()=>{
  const row={unit:{id:'unit'},development:{id:'development',name:'Selected Development'},transaction:{id:'transaction'},buyer:{name:'First Buyer'},stage:'Offer'}
  fetchDocumentWorkspacePage.mockResolvedValue({rows:[row],nextCursor:null})
  fetchDocumentClientWorkspace.mockResolvedValue({...row,documents:[],requiredChecklist:[{key:'proof',label:'Proof of payment',complete:false}],checklistSummary:{}})
  uploadDocument.mockResolvedValue({id:'saved',saved:true})
  const view=render(<Documents />)
  fireEvent.change(await screen.findByLabelText('Select Client / Buyer'),{target:{value:'transaction'}})
  await screen.findByText('Proof of payment')
  const file=new File(['%PDF-1.4 synthetic'],'proof.pdf',{type:'application/pdf'})
  fireEvent.change(view.container.querySelector('input[type="file"]'),{target:{files:[file]}})
  await waitFor(()=>expect(uploadDocument).toHaveBeenCalledWith(expect.objectContaining({transactionId:'transaction',file})))
  await waitFor(()=>expect(fetchDocumentClientWorkspace).toHaveBeenCalledTimes(2))
  expect(fetchDocumentWorkspacePage).toHaveBeenCalledTimes(1)
})

test('can retry a failed opening index without loading documents',async()=>{
  fetchDocumentWorkspacePage.mockRejectedValueOnce(new Error('Selector read offline')).mockResolvedValue({rows:[],nextCursor:null})
  render(<Documents />)
  await screen.findByText('Selector read offline')
  fireEvent.click(screen.getByRole('button',{name:'Retry document workspaces'}))
  await waitFor(()=>expect(fetchDocumentWorkspacePage).toHaveBeenCalledTimes(2))
  expect(fetchDocumentClientWorkspace).not.toHaveBeenCalled()
})

test('reads locally stored company files only when Company Documents is opened',async()=>{
  const get=vi.spyOn(Storage.prototype,'getItem')
  render(<Documents />)
  await screen.findByRole('button',{name:'Company Documents'})
  expect(get).not.toHaveBeenCalledWith('itg:developer-company-docs:v1:actor')
  fireEvent.click(screen.getByRole('button',{name:'Company Documents'}))
  await waitFor(()=>expect(get).toHaveBeenCalledWith('itg:developer-company-docs:v1:actor'))
})
