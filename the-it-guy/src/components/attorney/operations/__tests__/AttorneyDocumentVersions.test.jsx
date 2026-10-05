// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AttorneyDocumentVersions from '../AttorneyDocumentVersions.jsx'

afterEach(cleanup)
const lanes = [{ laneKey:'transfer',label:'Transfer Attorney' },{ laneKey:'bond',label:'Bond Attorney' }]
const requirements = [{canonicalRequirementInstanceId:'seller-1',documentType:'seller_resolution',displayName:'Seller resolution',requiredParty:'Nomsa',linkedDocument:{id:'signed'}}]
const signed = {id:'signed',transaction_id:'matter',name:'resolution.pdf',file_path:'signed-file',lane_key:'transfer',attorney_version_kind:'signed',
  attorney_version_root_id:'root',attorney_version_number:3,attorney_target_requirement_id:'seller-1',attorney_version_document_type:'seller_resolution',review_status:'approved',visibility_scope:'client',client_recipient_role:'seller'}
const draft = {...signed,id:'draft',name:'revision.docx',attorney_version_number:4,attorney_version_kind:'draft',visibility_scope:'internal',review_status:null,notes:'Updated seller authority'}

it('starts an internal draft and chooses the exact intended requirement without showing client sharing controls', () => {
  render(<AttorneyDocumentVersions requirements={requirements} editableLanes={lanes} onSave={vi.fn()} />)
  fireEvent.click(screen.getByRole('button',{name:'Upload draft'}))
  fireEvent.change(screen.getByLabelText('Intended checklist requirement'),{target:{value:'seller-1'}})
  expect(screen.getByLabelText('Document type').value).toBe('seller_resolution')
  expect(screen.getByLabelText('Document type').readOnly).toBe(true)
  expect(screen.queryByLabelText('Visibility')).toBeNull()
  expect(screen.getByText(/unsigned copy stays internal/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Version type'),{target:{value:'signed'}})
  fireEvent.change(screen.getByLabelText('Visibility'),{target:{value:'client'}})
  fireEvent.change(screen.getByLabelText('Client recipient'),{target:{value:'seller'}})
  expect(screen.getByText(/fresh review/)).toBeTruthy()
})
it('shows retained approved evidence alongside the latest draft and opens the selected historic file', () => {
  const onOpen=vi.fn()
  render(<AttorneyDocumentVersions documents={[draft,signed]} requirements={requirements} editableLanes={lanes} onSave={vi.fn()} onOpen={onOpen} />)
  expect(screen.getByText(/Latest revision/)).toBeTruthy()
  expect(screen.getByText(/Current checklist evidence · approved/)).toBeTruthy()
  expect(screen.getByText('Updated seller authority')).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button',{name:'Open version',hidden:true})[1])
  expect(onOpen).toHaveBeenCalledWith({document:signed})
})
it('locks predecessor identity and preserves the selected file and notes across an unconfirmed save', async () => {
  const onSave=vi.fn().mockRejectedValueOnce(new Error('Save could not be confirmed')).mockResolvedValue({id:'saved'})
  render(<AttorneyDocumentVersions documents={[draft,signed]} requirements={requirements} editableLanes={lanes} onSave={onSave} />)
  fireEvent.click(screen.getByRole('button',{name:'Upload next version'}))
  expect(screen.getByLabelText('Attorney workflow').disabled).toBe(true)
  expect(screen.getByLabelText('Intended checklist requirement').disabled).toBe(true)
  const file=new File(['draft contents'],'revision.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
  fireEvent.change(screen.getByLabelText('File'),{target:{files:[file]}})
  fireEvent.change(screen.getByLabelText('Revision notes'),{target:{value:'Missing signature added'}})
  fireEvent.submit(screen.getByLabelText('File').closest('form'))
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Save could not be confirmed'))
  expect(screen.getByLabelText('Revision notes').value).toBe('Missing signature added')
  fireEvent.submit(screen.getByLabelText('File').closest('form'))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(onSave.mock.calls[0][0].file).toBe(file)
  expect(onSave.mock.calls[1][0].attorneyPreviousVersionId).toBe('draft')
  expect(onSave.mock.calls[1][0].canonicalRequirementInstanceId).toBe('seller-1')
})
it('disables file, identity and close controls until the version save returns', async () => {
  let resolve
  render(<AttorneyDocumentVersions editableLanes={lanes} onSave={()=>new Promise(done=>{resolve=done})} />)
  fireEvent.click(screen.getByRole('button',{name:'Upload draft'}))
  fireEvent.change(screen.getByLabelText('File'),{target:{files:[new File(['x'],'draft.pdf',{type:'application/pdf'})]}})
  fireEvent.change(screen.getByLabelText('Document type'),{target:{value:'power of attorney'}})
  fireEvent.submit(screen.getByLabelText('File').closest('form'))
  expect(screen.getByLabelText('File').closest('fieldset').disabled).toBe(true)
  expect(screen.getByRole('button',{name:'Cancel'}).disabled).toBe(true)
  fireEvent.keyDown(document,{key:'Escape'})
  expect(screen.getByRole('dialog')).toBeTruthy()
  resolve({id:'saved'})
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
})
it('keeps read-only and other-lane users from creating revisions, and a failed file open retains history', async () => {
  render(<AttorneyDocumentVersions documents={[draft,signed]} requirements={requirements} editableLanes={[lanes[1]]} onOpen={()=>Promise.reject(new Error('File unavailable'))} />)
  expect(screen.queryByRole('button',{name:'Upload next version'})).toBeNull()
  expect(screen.queryByRole('button',{name:'Upload draft'})).toBeNull()
  fireEvent.click(screen.getAllByRole('button',{name:'Open version',hidden:true})[0])
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('File unavailable'))
  expect(screen.getByText(/Current checklist evidence · approved/)).toBeTruthy()
})
