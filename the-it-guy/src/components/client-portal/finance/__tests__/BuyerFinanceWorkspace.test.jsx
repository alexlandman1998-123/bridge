// @vitest-environment jsdom
import React from 'react'
import { Blob as NodeBlob } from 'node:buffer'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BuyerFinanceWorkspace from '../BuyerFinanceWorkspace'
const model = { source: 'production', mode:'bond', isBondFinance:true, stages:[], manager:{name:'Consultant'}, bankApplications:[{id:'bank',bankName:'Nedbank',status:'submitted'}], offers:[{id:'quote',bankName:'Nedbank',amountLabel:'R 2 000 000',quoteDocument:{id:'document'}}] }
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
it('places optional content after lenders for bond buyers and omits it for cash buyers', () => {
  const view = render(<BuyerFinanceWorkspace model={model} afterLenders={<h2>Demo bond protection</h2>} />)
  const bank = screen.getByRole('button', { name: 'View Nedbank application' })
  const protection = screen.getByRole('heading', { name: 'Demo bond protection' })
  expect(bank.compareDocumentPosition(protection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  view.rerender(<BuyerFinanceWorkspace model={{ ...model, mode: 'cash', isBondFinance: false, isCashFinance: true }} afterLenders={<h2>Demo bond protection</h2>} />)
  expect(screen.getByRole('heading', { name: 'Proof of funds' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Demo bond protection' })).toBeNull()
})
it('resolves ID-only PDFs on click and displays access failures in the popup', async()=>{
  const popup={opener:{},location:{replace:vi.fn()},close:vi.fn()}
  vi.spyOn(window,'open').mockReturnValue(popup)
  const resolveQuote=vi.fn().mockResolvedValueOnce({url:'https://example.test/new-signed-url'}).mockRejectedValueOnce(new Error('Quote was withdrawn'))
  render(<BuyerFinanceWorkspace model={model} resolveQuote={resolveQuote}/> )
  fireEvent.click(screen.getByRole('button',{name:'View Nedbank application'}))
  expect(screen.getByRole('button',{name:'Download PDF'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'View PDF'}))
  await waitFor(()=>expect(popup.location.replace).toHaveBeenCalledWith('https://example.test/new-signed-url'))
  await waitFor(()=>expect(screen.getByRole('button',{name:'View PDF'}).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button',{name:'View PDF'}))
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Quote was withdrawn'))
  expect(popup.close).toHaveBeenCalledTimes(1)
  expect(resolveQuote).toHaveBeenCalledTimes(2)
})
it('downloads a PDF for an ID-only quote and closes the popup when its lender is removed', async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>new NodeBlob(['%PDF-1.4\nquote'])}))
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:test')})
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  const resolveQuote=vi.fn().mockResolvedValue({url:'https://example.test/quote',name:'Current bank quote.pdf'})
  const view=render(<BuyerFinanceWorkspace model={model} resolveQuote={resolveQuote}/> )
  fireEvent.click(screen.getByRole('button',{name:'View Nedbank application'}))
  fireEvent.click(screen.getByRole('button',{name:'Download PDF'}))
  await waitFor(()=>{ if (screen.queryByRole('alert')) throw Error(screen.getByRole('alert').textContent); expect(click).toHaveBeenCalledOnce() })
  expect(resolveQuote).toHaveBeenCalledWith(model.offers[0])
  view.rerender(<BuyerFinanceWorkspace model={{...model,bankApplications:[],offers:[]}} resolveQuote={resolveQuote}/> )
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
})
