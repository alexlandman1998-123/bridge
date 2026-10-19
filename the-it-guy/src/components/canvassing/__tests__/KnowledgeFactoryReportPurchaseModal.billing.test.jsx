// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import KnowledgeFactoryReportPurchaseModal from '../KnowledgeFactoryReportPurchaseModal';
import { listKnowledgeFactoryPurchasableProducts, quoteKnowledgeFactoryReportPurchase, confirmKnowledgeFactoryReportPurchase, executeKnowledgeFactoryReportPurchase } from '../../../services/propertyIntelligence/knowledgeFactoryReportPurchaseService';
vi.mock('../../ui/Modal',()=>({default:({children})=><div>{children}</div>}));
vi.mock('../../../services/propertyIntelligence/knowledgeFactoryReportPurchaseService',()=>({listKnowledgeFactoryPurchasableProducts:vi.fn(),quoteKnowledgeFactoryReportPurchase:vi.fn(),confirmKnowledgeFactoryReportPurchase:vi.fn(),executeKnowledgeFactoryReportPurchase:vi.fn()}));
import { listKnowledgeFactorySellerLeadOptions } from '../../../services/propertyIntelligence/knowledgeFactoryReportConversionService';
vi.mock('../../../services/propertyIntelligence/knowledgeFactoryReportConversionService',()=>({listKnowledgeFactorySellerLeadOptions:vi.fn()}));
const intent={id:'intent',supplier_environment:'live',product_name:'Basic owner report',customer_price_cents:500,quoted_supplier_credits:11159,status:'quoted',quote_expires_at:'2099-01-01'};
beforeEach(()=>{
 vi.clearAllMocks();listKnowledgeFactorySellerLeadOptions.mockResolvedValue({items:[{leadId:'existing-lead',name:'Existing Seller',address:'24 Existing Lane'}],linkedLeadId:null});listKnowledgeFactoryPurchasableProducts.mockResolvedValue({products:[{productId:'basic_owner_lookup',name:'Basic owner report',customerPriceCents:500,fields:[]}],supplierEnvironment:'live'});
 quoteKnowledgeFactoryReportPurchase.mockResolvedValue({intent});confirmKnowledgeFactoryReportPurchase.mockResolvedValue({intent:{...intent,status:'confirmed_pending_execution'}});
});
afterEach(cleanup);
async function confirm(){render(<KnowledgeFactoryReportPurchaseModal property={{propertyId:383723}} organisationId="org-1" onClose={()=>{}}/>);
 const estimate=await screen.findByRole('button',{name:'Get estimate for R5.00'});await waitFor(()=>expect(estimate.disabled).toBe(false));fireEvent.click(estimate);
 await screen.findByText(/successfully saved report will be added to your agency/);
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirm report at R5.00'}));
 return screen.findByRole('button',{name:'Run report and add to monthly invoice'});
}
it('clearly confirms monthly invoice charging for a live report',async()=>{
 executeKnowledgeFactoryReportPurchase.mockResolvedValue({report:{creditsConsumed:11159,data:{property:{address:'1 Test Road'},owners:[]}}});
 fireEvent.click(await confirm());expect(await screen.findByText(/saved securely and added to your agency’s monthly invoice/)).toBeTruthy();expect(executeKnowledgeFactoryReportPurchase).toHaveBeenCalledTimes(1);
});
it('does not offer a second supplier execution after an uncertain response',async()=>{
 executeKnowledgeFactoryReportPurchase.mockRejectedValue(new Error('Supplier response needs review.'));
 fireEvent.click(await confirm());await screen.findByText('Supplier response needs review.');expect(screen.queryByRole('button',{name:'Run report and add to monthly invoice'})).toBeNull();expect(executeKnowledgeFactoryReportPurchase).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('button',{name:'Get a new estimate'})).toBeNull();
 expect(screen.getByText(/Check Completed reports before requesting another report/)).toBeTruthy();
});

it('carries the chosen existing seller lead and opaque boundary proof into the quote',async()=>{
 render(<KnowledgeFactoryReportPurchaseModal property={{propertyId:383723,boundaryReceipt:'signed-outline'}} organisationId="org-1"/>);
 const option=await screen.findByRole('option',{name:'Existing Seller — 24 Existing Lane'});
 fireEvent.change(screen.getByLabelText('Save to seller lead'),{target:{value:option.value}});
 fireEvent.click(screen.getByRole('button',{name:'Get estimate for R5.00'}));
 await screen.findByText(/successfully saved report will be added/);
 expect(quoteKnowledgeFactoryReportPurchase).toHaveBeenCalledWith(expect.objectContaining({sellerLeadId:'existing-lead',boundaryReceipt:'signed-outline'}));
});

it('keeps estimate blocked when seller lookup fails and offers recovery',async()=>{
 listKnowledgeFactorySellerLeadOptions.mockRejectedValueOnce(new Error('Offline'));
 render(<KnowledgeFactoryReportPurchaseModal property={{propertyId:383723}} organisationId="org-1"/>);
 await screen.findByText(/Existing seller leads could not be loaded/);
 expect(screen.getByRole('button',{name:'Get estimate for R5.00'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Retry seller lead lookup'}));
 await screen.findByRole('option',{name:'Existing Seller — 24 Existing Lane'});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Get estimate for R5.00'}).disabled).toBe(false));
});
it('reuses an existing property link without offering another seller choice',async()=>{
 listKnowledgeFactorySellerLeadOptions.mockResolvedValue({linkedLeadId:'already-linked',items:[]});
 render(<KnowledgeFactoryReportPurchaseModal property={{propertyId:383723}} organisationId="org-1"/>);
 await screen.findByText(/This property already has a linked seller lead/);
 expect(screen.queryByRole('combobox')).toBeNull();
});
it('shows an unavailable outline before confirming the Full report purchase',async()=>{
 listKnowledgeFactoryPurchasableProducts.mockResolvedValue({products:[{productId:'full_canvassing_report',name:'Full report',customerPriceCents:2500,fields:[]}],supplierEnvironment:'live'});
 quoteKnowledgeFactoryReportPurchase.mockResolvedValue({intent:{...intent,product_name:'Full report',customer_price_cents:2500},boundary:{status:'unavailable',reason:'The selected outline came from a different supplier environment.'}});
 render(<KnowledgeFactoryReportPurchaseModal property={{propertyId:383723}} organisationId="org-1"/>);
 const estimate=await screen.findByRole('button',{name:'Get estimate for R25.00'});await waitFor(()=>expect(estimate.disabled).toBe(false));fireEvent.click(estimate);
 await screen.findByText(/A verified property outline is unavailable for this report.*different supplier environment/);
 expect(confirmKnowledgeFactoryReportPurchase).not.toHaveBeenCalled();
});
