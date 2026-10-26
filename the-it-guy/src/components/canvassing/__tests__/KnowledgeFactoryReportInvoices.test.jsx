// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import KnowledgeFactoryReportInvoices from '../KnowledgeFactoryReportInvoices';
import { reportInvoiceCsv } from '../../../services/propertyIntelligence/knowledgeFactoryReportInvoiceExport';
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({data:{session:{access_token:'synthetic-session'}}})) } } }));
const invoice={id:'invoice-1',invoice_month:'2026-10-01',status:'draft',totalCents:500,knowledge_factory_report_invoice_lines:[{product_name:'Basic owner report',amount_cents:500,created_at:'2026-10-18'}]};
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn());});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('monthly report invoices',()=>{
 it('shows the exact monthly total and exports the confirmed report price',async()=>{
  fetch.mockResolvedValue(new Response(JSON.stringify({invoices:[invoice]})));
  render(<KnowledgeFactoryReportInvoices organisationId="org-1" />);
  expect(await screen.findByText(/Draft invoice/)).toBeTruthy();expect(screen.getByText(/R\s*5[.,]00/)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Export charges',hidden:true})).toBeTruthy();
  expect(reportInvoiceCsv(invoice)).toContain('"5.00"');expect(reportInvoiceCsv(invoice)).toContain('"Basic owner report"');
 });
 it('does not expose agency invoices to a member without billing access',async()=>{
  fetch.mockResolvedValue(new Response('{}',{status:403}));render(<KnowledgeFactoryReportInvoices organisationId="org-1" />);
  await vi.waitFor(()=>expect(screen.queryByText('Monthly property report invoices')).toBeNull());
 });
 it('clears the previous agency invoice while loading a new agency',async()=>{
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({invoices:[invoice]}))).mockResolvedValueOnce(new Response(JSON.stringify({invoices:[]})));
  const {rerender}=render(<KnowledgeFactoryReportInvoices organisationId="org-1" />);await screen.findByText(/Draft invoice/);
  rerender(<KnowledgeFactoryReportInvoices organisationId="org-2" />);await screen.findByText('No property report charges yet.');expect(screen.queryByText(/Draft invoice/)).toBeNull();
 });
 it('quotes CSV cells and prevents spreadsheet formula execution',()=>{
  const csv=reportInvoiceCsv({...invoice,knowledge_factory_report_invoice_lines:[{product_name:'=TEST("x")',amount_cents:500}]});
  expect(csv).toContain('"\'=TEST(""x"")"');
 });
});
