// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import KnowledgeFactoryPackageReportsWorkspace from '../KnowledgeFactoryPackageReportsWorkspace.jsx';
import KnowledgeFactorySellerSource from '../../leads/KnowledgeFactorySellerSource.jsx';
import {buildSellerDocumentRequirementRows} from '../../../services/sellerDocumentRequirementsService.js';
const api=vi.hoisted(()=>({listKnowledgeFactoryCompletedReports:vi.fn(),fileKnowledgeFactoryReportToSellerLead:vi.fn(),convertKnowledgeFactoryReportToProspect:vi.fn(),downloadKnowledgeFactoryCompletedReport:vi.fn()}));
vi.mock('../../../services/propertyIntelligence/knowledgeFactoryReportConversionService',()=>api);
vi.mock('../../../context/WorkspaceContext',()=>({useWorkspace:()=>({currentWorkspace:{organisationId:'org-one'}})}));
vi.mock('../KnowledgeFactoryReportInvoices',()=>({default:()=>null}));
const report={id:'report-one',property_id:123,product_id:'full_canvassing_report',executed_at:'2026-10-19',report_data:{property:{address:'24 Example Lane'}},sellerFiling:{status:'pending'}};
const mount=()=>render(<MemoryRouter><KnowledgeFactoryPackageReportsWorkspace /></MemoryRouter>);
beforeEach(()=>{vi.clearAllMocks();api.listKnowledgeFactoryCompletedReports.mockResolvedValue({items:[report]});});
afterEach(cleanup);
it('links to the seller lead after its report document is filed',async()=>{
 api.listKnowledgeFactoryCompletedReports.mockResolvedValue({items:[{...report,sellerFiling:{status:'filed',lead_id:'lead-one'}}]});mount();
 expect((await screen.findByRole('link',{name:/Open seller lead/})).getAttribute('href')).toBe('/pipeline/leads/lead-one');
 expect(screen.queryByRole('button',{name:'Retry seller filing'})).toBeNull();
});
it('retries filing without another report purchase',async()=>{
 api.fileKnowledgeFactoryReportToSellerLead.mockResolvedValue({sellerFiling:{status:'filed'}});mount();
 fireEvent.click(await screen.findByRole('button',{name:'Retry seller filing'}));
 await vi.waitFor(()=>expect(api.fileKnowledgeFactoryReportToSellerLead).toHaveBeenCalledWith({organisationId:'org-one',reportResultId:'report-one'}));
 expect(api.convertKnowledgeFactoryReportToProspect).not.toHaveBeenCalled();
});
it('keeps test reports separate from real seller leads',async()=>{
 api.listKnowledgeFactoryCompletedReports.mockResolvedValue({items:[{...report,sellerFiling:{status:'test_report'}}]});mount();
 await screen.findByText('Test report — no seller lead created.');expect(screen.queryByRole('button',{name:'Retry seller filing'})).toBeNull();
});
it('shows filing errors while preserving the completed report',async()=>{
 api.fileKnowledgeFactoryReportToSellerLead.mockRejectedValue(new Error('Private document storage is unavailable.'));mount();
 fireEvent.click(await screen.findByRole('button',{name:'Retry seller filing'}));
 await screen.findByText('Private document storage is unavailable.');expect(screen.getByText('24 Example Lane')).toBeTruthy();
});
it('shows all source owners and zero shares without claiming selling consent',()=>{
 render(<KnowledgeFactorySellerSource source={{reportResultId:'report-one',propertyId:123,owners:[{name:'Example A',type:'Company',share:0},{name:'Example B',type:null,share:null}]}} />);
 expect(screen.getByText('Example A')).toBeTruthy();expect(screen.getByText('Example B')).toBeTruthy();expect(screen.getByText('0')).toBeTruthy();expect(screen.getAllByText('Not supplied').length).toBe(2);
 expect(screen.getByText(/does not establish intent or consent to sell/)).toBeTruthy();
});
it('files an additional property document without satisfying a title deed requirement',()=>{
 const rows=buildSellerDocumentRequirementRows({documents:[{id:'doc-one',document_type:'knowledge_factory_property_report',category:'Property Report',document_name:'Knowledge Factory property report.pdf',storage_path:'private-listings/listing-one/knowledge-factory/report-one.pdf',status:'uploaded',visibility:'internal'}]});
 const saved=rows.find(row=>row.id==='doc-one');expect(saved).toBeTruthy();expect(saved.required).toBe(false);expect(saved.key).toBe('knowledge_factory_property_report');expect(saved.status).toBe('uploaded');
});
