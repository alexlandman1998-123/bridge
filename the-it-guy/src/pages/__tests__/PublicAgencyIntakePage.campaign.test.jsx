// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
const runtime=vi.hoisted(()=>({resolve:vi.fn(),submit:vi.fn()}))
vi.mock('../../components/location/AddressInput',()=>({default:({onAddressSelect,...props})=>{
  void onAddressSelect
  return <input {...props}/>
}}))
vi.mock('../../services/agencyPublicIntakeService',()=>({
  AGENCY_PUBLIC_INTAKE_PRIVACY_VERSION:'privacy-v1',
  getOrCreateAgencyIntakeIdempotencyKey:()=> 'campaign-form-request-0001',
  rotateAgencyIntakeIdempotencyKey:()=> 'campaign-form-request-0002',
  readAgencyIntakeAttribution:(params)=>({sourceChannel:'website',campaignCode:'',utm:{},selectedListings:[],context:{campaignResponseToken:params.get('campaignResponse')}}),
  resolveAgencyPublicIntake:runtime.resolve,
  resolveAgencyPublicListings:async()=>[],
  submitAgencyPublicIntake:runtime.submit,
}))
import PublicAgencyIntakePage from '../PublicAgencyIntakePage'
const consent='I would also like to receive future property marketing emails from this agency. I can unsubscribe at any time.'
beforeEach(()=>{
  cleanup();vi.clearAllMocks();window.scrollTo=vi.fn()
  runtime.resolve.mockResolvedValue({slug:'agency',agency:{name:'Oak Agency'},card:{enabled:false},intake:{enabledIntents:['sell'],privacyPolicyVersion:'privacy-v1',consentCopy:'I consent to the agency using my details to respond to this enquiry.'},config:{buyer:{},seller:{},listingMatch:{}},campaignResponse:{purpose:'valuation',marketingConsentOptional:true,marketingConsentCopy:consent,marketingConsentVersion:'campaign-email-marketing-v1'}})
  runtime.submit.mockResolvedValue({accepted:true,duplicate:false,lead:{followUpPrepared:true}})
})
async function mount(){
  render(<MemoryRouter initialEntries={['/intake/agency?intent=sell&campaignResponse=00000000-0000-4000-8000-000000000001']}><Routes><Route path="/intake/:agencySlug" element={<PublicAgencyIntakePage/>}/></Routes></MemoryRouter>)
  const name=await screen.findByLabelText(/Full name/)
  fireEvent.change(name,{target:{value:'Avery Seller'}})
  fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'avery@example.test'}})
  return {privacy:screen.getByRole('checkbox',{name:/I consent to the agency/}),marketing:screen.getByRole('checkbox',{name:/Optional future marketing emails/})}
}
it('submits a campaign enquiry with privacy permission while optional marketing remains unchecked',async()=>{
  const {privacy,marketing}=await mount()
  expect(marketing.checked).toBe(false)
  fireEvent.click(privacy)
  fireEvent.click(screen.getByRole('button',{name:'Send enquiry'}))
  await waitFor(()=>expect(runtime.submit).toHaveBeenCalledTimes(1))
  const call=runtime.submit.mock.calls[0][0]
  expect(call.payload.privacyConsent).toBe(true)
  expect(call.payload.emailMarketingConsent).toBe(false)
  expect(call.payload.context.campaignResponseToken).toBe('00000000-0000-4000-8000-000000000001')
})
it('does not let marketing opt-in substitute for enquiry privacy consent and records the separate version only after review',async()=>{
  const {privacy,marketing}=await mount()
  fireEvent.click(marketing)
  expect(privacy.checked).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'Send enquiry'}))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('privacy consent'))
  expect(runtime.submit).not.toHaveBeenCalled()
  fireEvent.click(privacy)
  fireEvent.click(screen.getByRole('button',{name:'Send enquiry'}))
  await waitFor(()=>expect(runtime.submit).toHaveBeenCalledTimes(1))
  expect(runtime.submit.mock.calls[0][0].payload).toMatchObject({emailMarketingConsent:true,marketingConsentVersion:'campaign-email-marketing-v1',privacyConsent:true})
})
