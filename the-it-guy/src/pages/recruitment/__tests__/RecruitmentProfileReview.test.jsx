// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RecruitmentProfileReview, { submissionDeclarationText, submissionPrivacyText } from '../RecruitmentProfileReview'
import RecruitmentSignupModal from '../RecruitmentSignupModal'
import { validProfile } from './helpers/recruitmentProfileFixture'
const applicant={emailVerification:'verified',stage:'lead_received',applicationSubmitted:false,contact:{firstName:'Website',lastName:'Applicant',email:'website@example.test',phone:'+27821234567'},profile:{version:'recruitment-profile-v1',country:'ZA',complete:true,page:3,answers:validProfile()},profileRevision:3}
const submitted={...applicant,stage:'application_submitted',applicationSubmitted:true,applicationSubmittedAt:'2026-10-07T10:00:00Z'}
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
function review(props={}) {
  const callbacks={onSubmitted:vi.fn(),onBusy:vi.fn(),onEdit:vi.fn(),onReload:vi.fn(),onClose:vi.fn()}
  render(<RecruitmentProfileReview applicant={applicant} {...callbacks} {...props} />)
  return callbacks
}
function consent() {fireEvent.click(screen.getByLabelText(submissionPrivacyText));fireEvent.click(screen.getByLabelText(submissionDeclarationText))}
it('reviews actual answers including zero and conditional FFC, allows section edits and requires both explicit declarations',async()=>{
  const fetcher=vi.fn(async()=>response({accepted:true,applicant:submitted}));vi.stubGlobal('fetch',fetcher)
  const callbacks=review()
  expect(screen.getByText('0')).toBeTruthy();expect(screen.getByText('Non-principal property practitioner')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Edit Professional & legal details'}))
  expect(callbacks.onEdit).toHaveBeenCalledWith(2)
  fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  expect(fetcher).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('Confirm processing consent')
  fireEvent.click(screen.getByLabelText(submissionPrivacyText));fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText(submissionDeclarationText));fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  await waitFor(()=>expect(callbacks.onSubmitted).toHaveBeenCalledWith(submitted))
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({action:'submit_profile',revision:3,submissionKey:expect.any(String),privacyAccepted:true,declarationAccepted:true})
})
it('retains the exact submission for an uncertain response, blocks editing and safely retries',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new Error('Fixture connection lost')).mockResolvedValueOnce(response({accepted:true,duplicate:true,applicant:submitted}))
  vi.stubGlobal('fetch',fetcher);const callbacks=review();consent()
  fireEvent.click(screen.getByRole('button',{name:'Submit application'}));await screen.findByText('Fixture connection lost')
  expect(callbacks.onSubmitted).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'Edit Personal information'}).disabled).toBe(true)
  expect(screen.getByLabelText(submissionPrivacyText).closest('fieldset').disabled).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'Retry submission'}));await waitFor(()=>expect(callbacks.onSubmitted).toHaveBeenCalledTimes(1))
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body)
})
it('rejects a partial acknowledgement and does not claim application submission',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response({accepted:true,applicant})))
  const callbacks=review();consent();fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  await screen.findByText('Your application could not be submitted. Please retry.')
  expect(callbacks.onSubmitted).not.toHaveBeenCalled()
})
it('catches conflicting revisions and requires reloading and reviewing the latest saved questionnaire',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response({conflict:true,error:'Fixture questionnaire changed'},409)))
  const callbacks=review();consent();fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  await screen.findByText('Fixture questionnaire changed')
  expect(screen.getByRole('button',{name:'Submit application'}).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'Reload saved draft'}));expect(callbacks.onReload).toHaveBeenCalledTimes(1)
})
it('prevents duplicate clicks while submission is in flight',async()=>{
  let resolve
  const fetcher=vi.fn(()=>new Promise(done=>{resolve=done}));vi.stubGlobal('fetch',fetcher)
  const callbacks=review();consent()
  fireEvent.submit(screen.getByRole('form',{name:'Review and submit application'}));fireEvent.submit(screen.getByRole('form',{name:'Review and submit application'}))
  expect(fetcher).toHaveBeenCalledTimes(1)
  resolve(response({accepted:true,applicant:submitted}));await waitFor(()=>expect(callbacks.onSubmitted).toHaveBeenCalledTimes(1))
})
it('simulates final submission without sending answers or claiming a real application',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  const callbacks=review({preview:true});consent();fireEvent.click(screen.getByRole('button',{name:'Preview submission'}))
  await waitFor(()=>expect(callbacks.onSubmitted).toHaveBeenCalledWith(expect.objectContaining({submissionPreview:true,applicationSubmitted:true})))
  expect(fetcher).not.toHaveBeenCalled()
})
it('Home Seekers shows Submit Application before a preview receipt and never sends preview answers',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  const callbacks=review({preview:true,homeSeekers:true,applicant:{...applicant,profile:{...applicant.profile,answers:{...applicant.profile.answers,packagePreference:'decide_later'}}}})
  expect(screen.queryByRole('button',{name:'Preview submission'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Submit Application',exact:true}))
  expect(callbacks.onSubmitted).not.toHaveBeenCalled()
  consent();fireEvent.click(screen.getByRole('button',{name:'Submit Application',exact:true}))
  await waitFor(()=>expect(callbacks.onSubmitted).toHaveBeenCalledWith(expect.objectContaining({submissionPreview:true,applicationSubmitted:true})))
  expect(fetcher).not.toHaveBeenCalled()
})
it('restores submitted applicants at the confirmation screen with no questionnaire or resubmission',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response({branding:{organisationName:'Home Seekers'},applicant:submitted})))
  render(<RecruitmentSignupModal open onClose={()=>{}} />)
  expect(await screen.findByRole('heading',{name:'Application submitted'})).toBeTruthy()
  expect(screen.getByText(/Your application has been received by Home Seekers/)).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Submit application'})).toBeNull()
  expect(screen.queryByRole('form',{name:'Applicant questionnaire form'})).toBeNull()
  expect(screen.getByText('Review').closest('li').getAttribute('aria-current')).toBe('step')
})
