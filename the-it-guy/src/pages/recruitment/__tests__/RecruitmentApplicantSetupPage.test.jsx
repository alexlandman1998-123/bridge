// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RecruitmentApplicantSetupPage from '../RecruitmentApplicantSetupPage'
import { recruitmentSignupRequest } from '../../../services/recruitmentSignupService'

vi.mock('../../../services/recruitmentSignupService', () => ({ recruitmentSignupRequest: vi.fn() }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ session: null, authLoading: false, logout: vi.fn() }) }))
const applicant = { emailVerification: 'verified', applicationSubmitted: true, stage: 'application_submitted', documents: [], documentsEditable: true,
  contact: { firstName: 'Sam', lastName: 'Applicant', email: 'sam@agency.test' },
  submittedApplication: { answers: { firstName: 'Sam', lastName: 'Applicant', email: 'sam@agency.test', currentEmployer: 'Submitted Agency' } },
  profile: { answers: { currentEmployer: 'Different draft' } } }
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
function open(path = '/applicant/my-profile') { render(<MemoryRouter initialEntries={[path]}><RecruitmentApplicantSetupPage /></MemoryRouter>) }
it('exposes one navigation item and the exact submitted answers, picture and document uploads', async () => {
  recruitmentSignupRequest.mockResolvedValue({ applicant })
  open('/applicant/listings')
  await screen.findByRole('heading', { name: 'Your submitted application' })
  const links = within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link')
  expect(links).toHaveLength(1); expect(links[0].textContent).toBe('My Profile'); expect(links[0].getAttribute('href')).toBe('/applicant/my-profile')
  expect(screen.getByText('Submitted Agency')).toBeTruthy(); expect(screen.queryByText('Different draft')).toBeNull()
  expect(screen.getByLabelText('Upload profile picture')).toBeTruthy()
  for (const type of ['CV', 'Identity document', 'Qualifications', 'Registration evidence']) expect(screen.getByLabelText(`Upload ${type}`).disabled).toBe(false)
  expect(screen.queryByText('Dashboard')).toBeNull()
})
it('opens password login with email-code recovery when no applicant session is available and does not fabricate an account', async () => {
  recruitmentSignupRequest.mockResolvedValue({ applicant: null })
  open()
  await screen.findByRole('form', { name: 'Sign in to applicant account' })
  expect(screen.getByLabelText('Password').type).toBe('password')
  expect(screen.getByRole('button', { name: 'Use an email code instead' })).toBeTruthy()
  expect(screen.queryByRole('navigation')).toBeNull()
  expect(screen.queryByLabelText('Upload CV')).toBeNull()
  expect(recruitmentSignupRequest).toHaveBeenCalledWith('resume', {}, expect.objectContaining({ endpoint: '/api/recruitment/applicant-profile' }))
})
it('requests a login code before presenting code entry, then opens only the saved applicant setup', async () => {
  recruitmentSignupRequest.mockImplementation(async action => action === 'resume' ? { applicant: null } : action === 'send_verification' ? { verificationRequested: true } : { applicant })
  open(); fireEvent.click(await screen.findByRole('button', { name: 'Use an email code instead' })); await screen.findByRole('button', { name: 'Send login code' })
  expect(screen.queryByLabelText('Verification code')).toBeNull()
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'sam@agency.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send login code' }))
  const input = await screen.findByLabelText('Verification code')
  fireEvent.change(input, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in', exact: true }))
  await screen.findByRole('heading', { name: 'Your submitted application' })
  expect(recruitmentSignupRequest.mock.calls.map(([action]) => action)).toEqual(['resume', 'send_verification', 'verify_email'])
})
it('logs in with the application email and password and opens only the submitted profile', async () => {
  recruitmentSignupRequest.mockImplementation(async action => action === 'resume' ? { applicant: null } : { applicant })
  open(); await screen.findByRole('form', { name: 'Sign in to applicant account' })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'sam@agency.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'FixturePass123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in', exact: true }))
  await screen.findByRole('heading', { name: 'Your submitted application' })
  expect(recruitmentSignupRequest.mock.calls.map(([action]) => action)).toEqual(['resume', 'sign_in'])
  expect(recruitmentSignupRequest).toHaveBeenCalledWith('sign_in', expect.objectContaining({ email: 'sam@agency.test', password: 'FixturePass123' }), expect.objectContaining({ endpoint: '/api/recruitment/applicant-profile' }))
  expect(screen.queryByText('Dashboard')).toBeNull()
})
it('uploads supporting FICA evidence through the existing protected document pack', async () => {
  recruitmentSignupRequest.mockImplementation(async action => action === 'prepare_document' ? { uploadUrl: 'https://storage.test/fica' } : action === 'commit_document' ? { saved: true, applicant: { ...applicant, documents: [{ type: 'Other', name: 'proof-of-address.pdf', path: 'own/fica' }] } } : { applicant })
  const put = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', put)
  open(); const input = await screen.findByLabelText('Upload supporting FICA documents / proof of address')
  expect(screen.getByText('Upload your FFC certificate here.')).toBeTruthy()
  fireEvent.change(input, { target: { files: [new File(['fixture'], 'proof-of-address.pdf', { type: 'application/pdf' })] } })
  await screen.findByText('FICA document uploaded.')
  expect(put).toHaveBeenCalledTimes(1)
  expect(recruitmentSignupRequest).toHaveBeenCalledWith('prepare_document', expect.objectContaining({ document: { name: 'proof-of-address.pdf', size: 7, mimeType: 'application/pdf', type: 'Other' } }), expect.objectContaining({ endpoint: '/api/recruitment/applicant-profile' }))
  expect(screen.getAllByRole('button', { name: 'Download proof-of-address.pdf' })).toHaveLength(1)
})
it('preserves the saved photo upload request on a failed confirmation and retries without uploading twice', async () => {
  let failures = 0
  recruitmentSignupRequest.mockImplementation(async action => {
    if (action === 'resume') return { applicant }
    if (action === 'prepare_photo') return { uploadUrl: 'https://storage.test/photo' }
    if (action === 'commit_photo' && failures++ === 0) throw new Error('Confirmation interrupted')
    return { saved: true, applicant: { ...applicant, photo: { name: 'sam.png', url: 'https://storage.test/saved' } } }
  })
  const put = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', put)
  open(); const input = await screen.findByLabelText('Upload profile picture')
  fireEvent.change(input, { target: { files: [new File(['image'], 'sam.png', { type: 'image/png' })] } })
  await screen.findByText('Confirmation interrupted')
  fireEvent.click(screen.getByRole('button', { name: 'Retry profile picture upload' }))
  await screen.findByText('Profile picture saved.')
  expect(put).toHaveBeenCalledTimes(1)
  const ids = recruitmentSignupRequest.mock.calls.filter(([action]) => action === 'prepare_photo').map(([, body]) => body.requestId)
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1])
  expect(screen.getByRole('img', { name: 'Your profile' }).getAttribute('src')).toBe('https://storage.test/saved')
})
it('keeps the photo and document pack locked after approval and rejects a non-image locally', async () => {
  recruitmentSignupRequest.mockResolvedValue({ applicant })
  open(); const input = await screen.findByLabelText('Upload profile picture')
  fireEvent.change(input, { target: { files: [new File(['pdf'], 'profile.pdf', { type: 'application/pdf' })] } })
  await screen.findByText('Choose a JPG or PNG up to 2 MB.')
  expect(recruitmentSignupRequest).toHaveBeenCalledTimes(1)
  cleanup(); recruitmentSignupRequest.mockResolvedValue({ applicant: { ...applicant, documentsEditable: false } }); open()
  await waitFor(() => expect(screen.getByLabelText('Upload CV').disabled).toBe(true))
  expect(screen.getByLabelText('Upload profile picture').disabled).toBe(true)
})
it('brands the login and browser metadata as Home Seekers and restores platform metadata when the screen closes', async () => {
  const originalTitle=document.title
  document.title='Platform title'
  const icon=document.createElement('link');icon.rel='icon';icon.href='/platform.svg';icon.type='image/svg+xml';document.head.appendChild(icon)
  const manifest=document.createElement('link');manifest.rel='manifest';manifest.href='/platform.webmanifest';document.head.appendChild(manifest)
  recruitmentSignupRequest.mockResolvedValue({applicant:null})
  open();await screen.findByRole('form',{name:'Sign in to applicant account'})
  expect(screen.getAllByRole('img',{name:'Home Seekers'}).length).toBeGreaterThan(0)
  expect(screen.queryByText(/Arch9/i)).toBeNull()
  expect(screen.queryByRole('link',{name:/agency workspace/i})).toBeNull()
  expect(document.title).toBe('My Profile | Home Seekers')
  expect(icon.getAttribute('href')).toBe('/brand/homeseekers/applicant-icon.svg')
  expect(manifest.getAttribute('href')).toBe('/brand/homeseekers/applicant.webmanifest')
  cleanup()
  expect(document.title).toBe('Platform title')
  expect(icon.getAttribute('href')).toBe('/platform.svg')
  expect(manifest.getAttribute('href')).toBe('/platform.webmanifest')
  icon.remove();manifest.remove();document.title=originalTitle
})
it('shows file receipts and recorded exceptions without treating a filename or partial uploads as a completed pack', async () => {
  recruitmentSignupRequest.mockResolvedValue({applicant:{...applicant,documents:[{type:'CV',name:'not-uploaded.pdf'},{type:'Identity document',name:'id.pdf',path:'own/id'}],documentWaivers:{Qualifications:'Qualification not applicable to this applicant'},documentsComplete:false}})
  open();await screen.findByRole('heading',{name:'Your documents'})
  expect(within(screen.getByRole('region',{name:'CV'})).getByText('To add')).toBeTruthy()
  expect(within(screen.getByRole('region',{name:'Identity document'})).getByText('Uploaded')).toBeTruthy()
  expect(within(screen.getByRole('region',{name:'Qualifications'})).getByText('Exception noted')).toBeTruthy()
  expect(screen.getByText('1 document uploaded')).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Download not-uploaded.pdf'})).toBeNull()
  expect(screen.queryByText('Your document pack is ready for the recruitment team to review.')).toBeNull()
})
it('keeps an unfinished application at its saved stage without claiming submission or offering uploads', async () => {
  recruitmentSignupRequest.mockResolvedValue({applicant:{...applicant,applicationSubmitted:false,stage:'lead_received'}})
  open();await screen.findByRole('heading',{name:'Complete your application first'})
  expect(screen.queryByText('Application submitted')).toBeNull()
  expect(screen.queryByLabelText('Upload CV')).toBeNull()
  expect(screen.getByRole('link',{name:'Continue your application'}).getAttribute('href')).toBe('https://homeseeker.co.za/join')
})
