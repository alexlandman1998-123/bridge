// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {webcrypto} from 'node:crypto';
import {Blob} from 'node:buffer';
import LegalMatterDetail from '../LegalMatterDetail';
import LegalMatterDocuments from '../LegalMatterDocuments';
import {LegalWorkspaceContext} from '../LegalWorkspaceContext';
import {createLegalMatterService} from '../legalMatterService';
import {fileDigest} from '../legalDocumentService';
import LegalPdfPreview from '../LegalPdfPreview';
const pdfMock=vi.hoisted(()=>({getDocument:vi.fn()}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{},getDocument:pdfMock.getDocument}));
const firm='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003',versionId='00000000-0000-4000-8000-000000000004';
function fixture(){
 const drafts=new Map(),matter={id,reference:'LEG-2026-00000001',title:'Will',discipline:'wills_estates',status:'draft',revision:1,responsible_user_id:user,restricted:true,conflict_decision:'pending',engagement_decision:'pending',conflict_note:'',engagement_note:''};
 const data={tasks_enabled:true,documents_enabled:true,work:{revision:0,dates:{},template_version:null},tasks:[],documents:[],pending_uploads:[]};
 const service={matter:vi.fn(async()=>({matter,team:[{user_id:user}],parties:[],activity:[],can_edit:true,can_review:true})),directory:vi.fn(async()=>[{user_id:user,name:'Alex Attorney',can_edit:true}]),work:vi.fn(async()=>structuredClone(data)),workCommand:vi.fn(async({action,payload})=>{
 if(action==='start_wills'){data.work.template_version='wills_manual_v1';data.tasks=[{id:'task',title:'Record instructions',owner_id:user,status:'pending',note:'',due_on:null}];}
 if(action==='save_dates')data.work.dates=payload.dates;
 if(action==='save_task')data.tasks=[{...payload,id:'task'}];
 data.work.revision++;return {work:data.work};})};
 const legal={service,firmId:firm,userId:user,context:{capabilities:{can_edit:true,can_review:true},grants:[]},recall:k=>drafts.get(k),remember:(k,v)=>drafts.set(k,v),forget:k=>drafts.delete(k),clearDrafts:()=>drafts.clear(),revoke:vi.fn(),confirmLeave:vi.fn(()=>true)};
 return {legal,matter,data};
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('manual work UI',()=>{
 it('starts the checklist, records dates and saves a task with its loaded revision',async()=>{
 const {legal}=fixture();render(<MemoryRouter initialEntries={['/legal/matters/'+id+'?tab=Work']}><LegalWorkspaceContext.Provider value={legal}><LegalMatterDetail matterId={id}/></LegalWorkspaceContext.Provider></MemoryRouter>);
 fireEvent.click(await screen.findByText('Start wills checklist'));await screen.findByText('Record instructions');
 fireEvent.change(screen.getByLabelText('Instructions'),{target:{value:'2026-10-11'}});fireEvent.click(screen.getByText('Save Dates'));
 await waitFor(()=>expect(legal.service.workCommand).toHaveBeenCalledWith(expect.objectContaining({action:'save_dates',payload:{matter_id:id,expected_revision:1,dates:{instructions_on:'2026-10-11'}}})));
 await screen.findByText('Record instructions');fireEvent.click(screen.getByText('Edit'));fireEvent.change(screen.getByLabelText('Task status'),{target:{value:'complete'}});fireEvent.change(screen.getByLabelText('Completion / reopen note'),{target:{value:'Instructions reviewed'}});fireEvent.click(screen.getByText('Save Task'));
 await waitFor(()=>expect(legal.service.workCommand).toHaveBeenCalledWith(expect.objectContaining({action:'save_task',payload:expect.objectContaining({expected_revision:2,status:'complete',note:'Instructions reviewed'})})));
 });
 it('keeps the original work revision after a newer read and returns the stale-save error',async()=>{
 const {legal}=fixture();legal.remember('work:'+id,{revision:0,form:{title:'My task',owner_id:user,due_on:'',status:'pending',note:''}});legal.service.work.mockResolvedValue({tasks_enabled:true,documents_enabled:true,work:{revision:5,dates:{}},tasks:[],documents:[],pending_uploads:[]});legal.service.workCommand.mockRejectedValue({code:'40001',message:'Stale'});
 render(<MemoryRouter initialEntries={['/legal/matters/'+id+'?tab=Work']}><LegalWorkspaceContext.Provider value={legal}><LegalMatterDetail matterId={id}/></LegalWorkspaceContext.Provider></MemoryRouter>);await screen.findByLabelText('Task');fireEvent.click(screen.getByText('Add Task'));await screen.findByRole('alert');expect(legal.service.workCommand.mock.calls[0][0].payload.expected_revision).toBe(0);expect(screen.getByLabelText('Task').value).toBe('My task');
 });
});
describe('private file recovery',()=>{
 it('recovers an uncertain upload by checking the same path and hash; commits once and never overwrites',async()=>{
 vi.stubGlobal('crypto',webcrypto);const blob=new Blob(['original']);const file={name:'will.pdf',type:'application/pdf',size:blob.size,arrayBuffer:()=>blob.arrayBuffer()};
 const version={id:versionId,path:firm+'/'+id+'/'+versionId,byte_size:blob.size,sha256:await fileDigest(blob),mime_type:'application/pdf',filename:'will.pdf'};
 const storage={upload:vi.fn().mockResolvedValue({error:{message:'Response lost'}}),download:vi.fn().mockResolvedValue({data:blob})};
 const client={rpc:vi.fn(async(name)=>({data:name==='arch9_legal_work_read'?{documents:[],pending_uploads:[version]}:{version}})),storage:{from:vi.fn(()=>storage)}};const service=createLegalMatterService(client);
 await service.finishDocument({firmId:firm,matterId:id,version,file});expect(storage.upload).toHaveBeenCalledWith(version.path,file,expect.objectContaining({upsert:false}));expect(client.rpc).toHaveBeenLastCalledWith('arch9_legal_work_command',expect.objectContaining({p_request_id:versionId,p_action:'commit_document',p_payload:{matter_id:id,version_id:versionId}}));
 // Wrong matter/version pairing is rejected before Storage can return bytes.
 client.rpc.mockResolvedValue({data:{documents:[],pending_uploads:[]}});storage.download.mockClear();await expect(service.downloadVersion(firm,id,versionId)).rejects.toMatchObject({code:'42501'});expect(storage.download).not.toHaveBeenCalled();
 });
 it('denies a corrupt or different original file and does not commit',async()=>{
 vi.stubGlobal('crypto',webcrypto);const blob=new Blob(['wrong']),version={id:versionId,path:'path',byte_size:5,sha256:'a'.repeat(64),mime_type:'application/pdf'};const client={rpc:vi.fn(async()=>({data:{documents:[],pending_uploads:[version]}})),storage:{from:()=>({download:async()=>({data:blob})})}};
 await expect(createLegalMatterService(client).finishDocument({firmId:firm,matterId:id,version})).rejects.toThrow('File verification failed');expect(client.rpc).toHaveBeenCalledTimes(1);
 });
 it('retries the identical reservation after a lost response and keeps editing locked',async()=>{
 vi.stubGlobal('crypto',webcrypto);const {legal,matter,data}=fixture(),blob=new Blob(['pdf']);const file={name:'will.pdf',type:'application/pdf',size:blob.size,arrayBuffer:()=>blob.arrayBuffer()};
 legal.service.reserveDocument=vi.fn().mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue({version:{id:versionId}});legal.service.finishDocument=vi.fn().mockResolvedValue({version:{id:versionId}});
 render(<LegalMatterDocuments legal={legal} matter={matter} data={data} canEdit onSaved={()=>{}}/>);fireEvent.change(screen.getByLabelText('File'),{target:{files:[file]}});fireEvent.click(screen.getByText('Upload'));await screen.findByText('Retry Upload');expect(screen.getByLabelText('Document title').closest('fieldset').disabled).toBe(true);expect(legal.recall('pending-save')).toBeTruthy();
 fireEvent.click(screen.getByText('Retry Upload'));await waitFor(()=>expect(legal.service.finishDocument).toHaveBeenCalled());expect(legal.service.reserveDocument.mock.calls[0][0]).toEqual(legal.service.reserveDocument.mock.calls[1][0]);expect(legal.recall('pending-save')).toBeUndefined();
 });
 it('renders only saved versions and DOCX downloads; revokes previews on denied access',async()=>{
 const {legal,matter,data}=fixture();data.documents=[{id:'doc',title:'Will document',current_version:2,versions:[{id:'v2',version_no:2,filename:'will.docx',mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',committed_at:'2026-10-11T10:00:00Z'},{id:'v1',version_no:1,filename:'will.pdf',mime_type:'application/pdf',committed_at:'2026-10-11T09:00:00Z'}]}];legal.service.downloadVersion=vi.fn().mockRejectedValue({code:'42501',message:'Revoked'});
 render(<LegalMatterDocuments legal={legal} matter={matter} data={data} canEdit onSaved={()=>{}}/>);expect(screen.getAllByText('Preview')).toHaveLength(1);expect(screen.getAllByText('Download')).toHaveLength(2);fireEvent.click(screen.getByText('Preview'));await screen.findByRole('alert');expect(legal.revoke).toHaveBeenCalled();expect(screen.queryByTitle('Document preview')).toBeNull();
 });
});

describe('PDF rendering and committed-response recovery',()=>{
 it('renders verified bytes, supports pages and destroys the viewer when it is closed',async()=>{
  const paint=vi.fn(()=>({promise:Promise.resolve(),cancel:vi.fn()})),getPage=vi.fn(async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),render:paint})),destroy=vi.fn(async()=>{});
  pdfMock.getDocument.mockReturnValue({promise:Promise.resolve({numPages:2,getPage}),destroy});
  vi.stubGlobal('ResizeObserver',class {constructor(callback){this.callback=callback;}observe(){this.callback([{contentRect:{width:340}}]);}disconnect(){}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({});
  const {unmount}=renderViewer();
  await waitFor(()=>expect(screen.getByRole('img',{name:'PDF page 1'}).dataset.rendered).toBe('true'));
  expect(pdfMock.getDocument.mock.calls[0][0].isEvalSupported).toBe(false);
  fireEvent.click(screen.getByText('Next page'));await waitFor(()=>expect(screen.getByRole('img',{name:'PDF page 2'}).dataset.rendered).toBe('true'));
  expect(getPage).toHaveBeenCalledWith(2);unmount();expect(destroy).toHaveBeenCalled();
  function renderViewer(){return render(<LegalPdfPreview blob={new Blob(['pdf'])}/>);}
 });
 it('recovers an already committed version instead of cancelling it after a lost response',async()=>{
  const version={id:versionId};const client={rpc:vi.fn(async(name)=>({data:name==='arch9_legal_work_read'?{documents:[{versions:[version]}],pending_uploads:[]}:{version}}))};
  await createLegalMatterService(client).cancelDocument({firmId:firm,matterId:id,version,requestId:crypto.randomUUID()});
  expect(client.rpc).toHaveBeenLastCalledWith('arch9_legal_work_command',expect.objectContaining({p_request_id:versionId,p_action:'commit_document'}));
 });
});
