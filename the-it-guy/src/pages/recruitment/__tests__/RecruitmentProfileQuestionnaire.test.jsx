// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { act,cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react'
import RecruitmentProfileQuestionnaire from '../RecruitmentProfileQuestionnaire'
import RecruitmentContactReceipt from '../RecruitmentContactReceipt'
import { validProfile } from './helpers/recruitmentProfileFixture'
const applicant={emailVerification:'verified',stage:'lead_received',applicationSubmitted:false,contact:{firstName:'Website',lastName:'Applicant',email:'website@example.test',phone:'+27821234567'}}
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body})
let requests
beforeEach(()=>{
  requests=[]
  vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{
    const body=JSON.parse(options.body);requests.push(body)
    return response({saved:true,applicant:{...applicant,profile:{version:'recruitment-profile-v1',country:'ZA',answers:body.answers,page:body.intent==='continue'?Math.min(body.page+1,3):body.page,complete:body.intent==='complete'},profileRevision:body.revision+1}})
  }))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
const fill=(label,value)=>fireEvent.change(screen.getByLabelText(label),{target:{value}})
const next=()=>fireEvent.click(screen.getByRole('button',{name:'Save & continue'}))
it('walks through all personal and professional questions, saves each part and opens review without submitting automatically',async()=>{
  render(<RecruitmentProfileQuestionnaire applicant={applicant} onSaved={()=>{}} onBusy={()=>{}} onClose={()=>{}} />)
  expect(screen.getByLabelText(/^First name/).value).toBe('Website')
  fill(/^Date of birth/,'1990-06-15');fill('Middle name','Middle');fill('Preferred name','Alex');next()
  await screen.findByRole('heading',{name:'Contact information',level:4})
  expect(screen.getByLabelText(/^Email address/).readOnly).toBe(true)
  expect(screen.getByLabelText(/^Mobile country code/).value).toBe('+27')
  fill('WhatsApp country code','+44');fill('WhatsApp number','7700123456');next()
  await screen.findByRole('heading',{name:'Professional & legal details',level:4})
  fill(/^Years of experience/,'5');fill(/^License status/,'valid')
  fill(/^FFC number/,'FFC-FIXTURE-123');fill(/^FFC practitioner type/,'non_principal')
  fill(/^Properties listed/,'0');fill(/^Properties sold/,'999')
  fireEvent.click(within(screen.getByRole('group',{name:/South African citizen/})).getByLabelText('Yes'))
  fireEvent.click(within(screen.getByRole('group',{name:/sequestration or administration/})).getByLabelText('No'));next()
  await screen.findByRole('heading',{name:'Employment, address & start date',level:4})
  for(const [label,value] of [[/^Current brokerage/,'Fixture brokerage'],[/^How did you find/,'referral'],[/^Street address/,'123 Fixture Road'],[/^City \/ town/,'Pretoria'],[/^Province/,'Gauteng'],[/^Postal code/,'0001'],[/^Expected start date/,'2099-01-01']])fill(label,value)
  fireEvent.click(screen.getByRole('button',{name:'Save & review'}))
  await screen.findByRole('heading',{name:'Review your application'})
  expect(requests).toHaveLength(4);expect(requests.map(row=>row.revision)).toEqual([0,1,2,3])
  expect(requests.at(-1)).toMatchObject({action:'save_profile',page:3,intent:'complete',answers:{propertiesListed:'0',propertiesSold:'999',whatsappCountryCode:'+44',preferredName:'Alex'}})
  expect(screen.getByRole('button',{name:'Submit application'})).toBeTruthy()
  expect(requests.every(row=>row.action==='save_profile')).toBe(true)
})
it('blocks invalid age and reveals FFC requirements only for a valid licence',async()=>{
  const saved={...applicant,profile:{answers:validProfile(),page:2},profileRevision:3}
  render(<RecruitmentProfileQuestionnaire applicant={saved} onSaved={()=>{}} onBusy={()=>{}} onClose={()=>{}} />)
  expect(screen.getByLabelText(/^FFC number/)).toBeTruthy()
  fill(/^License status/,'pending');expect(screen.queryByLabelText(/^FFC number/)).toBeNull()
  next();await screen.findByRole('heading',{name:'Employment, address & start date',level:4})
  expect(requests[0].answers.ffcNumber).toBe('');expect(requests[0].answers.ffcType).toBe('')
  fireEvent.click(screen.getByRole('button',{name:'Back'}));fireEvent.click(screen.getByRole('button',{name:'Back'}));fireEvent.click(screen.getByRole('button',{name:'Back'}))
  fill(/^Date of birth/,'2099-01-01');next()
  expect(await screen.findByText('You must be at least 18 years old to apply.')).toBeTruthy()
  expect(requests).toHaveLength(1)
})
it('saves incomplete answers on close and restores them in a new questionnaire',async()=>{
  const close=vi.fn(),saved=vi.fn(),closeRequestRef={current:null}
  const view=render(<RecruitmentProfileQuestionnaire applicant={applicant} closeRequestRef={closeRequestRef} onSaved={saved} onBusy={()=>{}} onClose={close} />)
  fill('Preferred name','Saved nickname')
  await act(async()=>closeRequestRef.current())
  expect(close).toHaveBeenCalledTimes(1)
  expect(requests[0]).toMatchObject({intent:'save',page:0,answers:{preferredName:'Saved nickname',dateOfBirth:''}})
  const updated=saved.mock.calls[0][0]
  view.unmount();render(<RecruitmentProfileQuestionnaire applicant={updated} onSaved={()=>{}} onBusy={()=>{}} onClose={()=>{}} />)
  expect(screen.getByLabelText('Preferred name').value).toBe('Saved nickname')
})
it('does not close or claim a save when persistence fails and retries the same revision and answers',async()=>{
  fetch.mockImplementationOnce(async(_url,options)=>{requests.push(JSON.parse(options.body));throw new Error('Fixture connection lost')})
  const close=vi.fn();render(<RecruitmentProfileQuestionnaire applicant={applicant} onSaved={()=>{}} onBusy={()=>{}} onClose={close} />)
  fill('Preferred name','Keep my draft');fireEvent.click(screen.getByRole('button',{name:'Save & close'}))
  await screen.findByText('Fixture connection lost');expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Save & close'}))
  await waitFor(()=>expect(close).toHaveBeenCalledTimes(1))
  expect(requests[1]).toEqual(requests[0])
})
it('keeps a conflict visible and reloads the newer draft before permitting another save',async()=>{
  fetch.mockImplementationOnce(async()=>response({conflict:true,error:'Fixture draft changed'},409)).mockImplementationOnce(async(_url,options)=>{
    requests.push(JSON.parse(options.body));return response({applicant:{...applicant,profile:{answers:{...validProfile(),preferredName:'Other device'},page:0},profileRevision:7}})
  })
  render(<RecruitmentProfileQuestionnaire applicant={applicant} onSaved={()=>{}} onBusy={()=>{}} onClose={()=>{}} />)
  fill('Preferred name','Unsaved local name');fireEvent.click(screen.getByRole('button',{name:'Save & close'}))
  await screen.findByText('Fixture draft changed')
  expect(screen.getByRole('button',{name:'Save & continue'}).closest('fieldset').disabled).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'Reload saved draft'}))
  await screen.findByText('Saved progress reloaded.')
  expect(screen.getByLabelText('Preferred name').value).toBe('Other device')
  fireEvent.click(screen.getByRole('button',{name:'Save & close'}))
  await waitFor(()=>expect(requests.at(-1).revision).toBe(7))
})
it('allows exploring all questionnaire stages in preview without a remote save or a submitted claim',async()=>{
  const saved={...applicant,profile:{answers:validProfile(),page:3}}
  render(<RecruitmentProfileQuestionnaire applicant={saved} preview onSaved={()=>{}} onBusy={()=>{}} onClose={()=>{}} />)
  fireEvent.click(screen.getByRole('button',{name:'Save & review'}))
  await screen.findByRole('heading',{name:'Review your application'})
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'Preview submission'})).toBeTruthy()
})
it('shows CRM questionnaire progress and self-declared answers without treating it as an application submission',()=>{
  render(<RecruitmentContactReceipt lead={{contact_capture_json:{version:'recruitment-contact-v1',firstName:'Website',lastName:'Applicant'},email_verification_status:'verified',applicant_draft_json:{version:'recruitment-profile-v1',complete:true,answers:validProfile()}}} />)
  expect(screen.getByText('Questionnaire saved — not submitted')).toBeTruthy()
  expect(screen.getByText('Draft answers supplied by the applicant. The full application has not been submitted.')).toBeTruthy()
  expect(screen.getByText('0')).toBeTruthy();expect(screen.queryByText('Application submitted')).toBeNull()
})
it('reloads a newer reviewed draft after a submission conflict and clears both declarations',async()=>{
  const saved={...applicant,profile:{version:'recruitment-profile-v1',country:'ZA',answers:validProfile(),page:3,complete:true},profileRevision:3}
  fetch.mockImplementationOnce(async()=>response({conflict:true,error:'Draft changed before submission'},409)).mockImplementationOnce(async()=>response({applicant:{...saved,profileRevision:4,profile:{...saved.profile,answers:{...validProfile(),preferredName:'Other device'}}}}))
  render(<RecruitmentProfileQuestionnaire applicant={saved} onSaved={()=>{}} onBusy={()=>{}} onClose={()=>{}} />)
  for(const checkbox of screen.getAllByRole('checkbox'))fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  await screen.findByText('Draft changed before submission')
  fireEvent.click(screen.getByRole('button',{name:'Reload saved draft'}));await screen.findByText('Other device')
  expect(screen.getAllByRole('checkbox').every(input=>!input.checked)).toBe(true)
  expect(screen.getByRole('button',{name:'Submit application'}).disabled).toBe(false)
})
it('saves an edited review section and returns directly to review with declarations unchecked',async()=>{
  const saved={...applicant,profile:{version:'recruitment-profile-v1',country:'ZA',answers:validProfile(),page:3,complete:true},profileRevision:3}
  render(<RecruitmentProfileQuestionnaire applicant={saved} onSaved={()=>{}} onBusy={()=>{}} onClose={()=>{}} />)
  for(const checkbox of screen.getAllByRole('checkbox'))fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button',{name:'Edit Professional & legal details'}))
  fill(/^Properties sold/,'0');fireEvent.click(screen.getByRole('button',{name:'Save & review'}))
  await screen.findByRole('heading',{name:'Review your application'})
  expect(requests[0]).toMatchObject({action:'save_profile',revision:3,page:2,intent:'complete',answers:{propertiesSold:'0'}})
  expect(screen.getAllByRole('checkbox').every(input=>!input.checked)).toBe(true)
})
