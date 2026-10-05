// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecruitmentApplicationForm } from '../RecruitmentApplicationPage'
import { applicationVersion } from '../recruitmentApplicationModel'
afterEach(cleanup)
const brand = { organisationName: 'Acme Estate', primaryColour: '#563377', logoLightUrl: 'https://example.test/logo.png', logoDarkUrl: 'https://example.test/logo-white.png' }
const fill = (label, value) => {
  for (let attempt = 0; attempt < 10 && !screen.queryByLabelText(label, { exact: true }); attempt++) fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
}
function goToReview() {
  fill('Full name','Sam Applicant'); fill('Email address','sam@example.test'); fill('Mobile number','0821234567'); fill('Areas you work in / want to cover','Pretoria')
  fireEvent.click(screen.getByRole('button',{name:'Continue'}))
  fill('Years in real estate','0'); fill('Average deals per month','0'); fill('Do you have active mandates?','no'); fill('What are you looking for in your next agency?','Training and support')
  fireEvent.click(screen.getByRole('button',{name:'Continue'}))
  fill('Your practitioner status','new_entrant'); fill('Real estate qualification route','none'); fill('Qualification progress','not_started'); fill('Professional Designation Examination (PDE)','not_started'); fill('Practical / workplace training','not_started'); fill('Continuing Professional Development (CPD)','not_applicable')
  fireEvent.click(screen.getByRole('button',{name:'Continue'}))
  for (let attempt = 0; attempt < 30 && !screen.queryAllByRole('checkbox').length; attempt++) fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}
it('uses organisation branding and blocks incomplete steps', () => {
  render(<RecruitmentApplicationForm branding={brand} />)
  expect(screen.getByRole('img', { name: 'Acme Estate' }).getAttribute('src')).toBe(brand.logoDarkUrl)
  expect(document.querySelector('.join-brand').textContent).toBe('')
  expect(document.querySelector('.recruitment-application').style.getPropertyValue('--join-brand')).toBe('#563377')
  fireEvent.click(screen.getByRole('button',{name:'Continue'}))
  expect(screen.getByRole('alert').textContent).toContain('highlighted')
  expect(screen.getByLabelText('Full name').getAttribute('aria-invalid')).toBe('true')
})
it('allows exploring all local preview steps without sending an application', () => {
  const submit = vi.fn()
  render(<RecruitmentApplicationForm branding={brand} preview onSubmit={submit} />)
  expect(screen.getByRole('status').textContent).toContain('Applications cannot be submitted')
  goToReview()
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
  expect(screen.getByRole('button', { name: 'Preview only' }).disabled).toBe(true)
  fireEvent.submit(document.querySelector('form'))
  expect(submit).not.toHaveBeenCalled()
  expect(screen.queryByText('Thank you for introducing yourself.')).toBeNull()
})
it('preserves answers across steps and requires both declarations before submission', async () => {
  const submit = vi.fn().mockResolvedValue({ accepted: true })
  render(<RecruitmentApplicationForm branding={brand} onSubmit={submit} />)
  goToReview()
  expect(screen.getByText(/Your answers are ready/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  expect(submit).not.toHaveBeenCalled()
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  expect(await screen.findByText('Thank you for introducing yourself.')).toBeTruthy()
  expect(submit.mock.calls[0][0]).toMatchObject({ action: 'submit', answers: { name: 'Sam Applicant', email: 'sam@example.test', practitionerStatus:'new_entrant', ffcStatus:'not_held', privacyAccepted:true, declarationAccepted:true } })
  expect(applicationVersion).toBe('recruitment-application-v1')
})
it('keeps the same submission key on a retry and never reports a failed submission as received', async () => {
  const submit = vi.fn().mockRejectedValueOnce(new Error('Connection failed')).mockResolvedValueOnce({accepted:true,duplicate:true})
  render(<RecruitmentApplicationForm branding={brand} onSubmit={submit} />)
  goToReview(); for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  expect(await screen.findByRole('alert')).toBeTruthy()
  await waitFor(() => expect(screen.getByRole('button',{name:'Submit application'}).disabled).toBe(false))
  expect(screen.queryByText('Thank you for introducing yourself.')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
  expect(await screen.findByText('Thank you for introducing yourself.')).toBeTruthy()
  expect(submit.mock.calls[0][0].submissionKey).toBe(submit.mock.calls[1][0].submissionKey)
})
