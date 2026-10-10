// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import RecruitmentReviewPanel from '../RecruitmentReviewPanel'
import { recruitmentReviewDraft, recruitmentReviewSummary } from '../recruitmentReviewModel'

afterEach(cleanup)
const file = {path:'org/lead/cv',name:'cv.pdf',type:'CV'}
const lead = {id:'lead',status:'under_review',application_submitted_at:'2026-10-05',review_started_at:'2026-10-05',application_json:{version:'recruitment-application-v1',answers:{practitionerStatus:'candidate',ffcStatus:'pending',activeMandates:'no'}},documents_json:[file]}
const labels = ['PPRA / FFC evidence','Qualifications & PDE','Practical training & CPD','Mandates & agency handover']

function Harness({record = lead, onSave = vi.fn(), onReject}) {
  const [current, setCurrent] = useState(record)
  const [draft, setDraft] = useState(() => recruitmentReviewDraft(record))
  const dirty = JSON.stringify(draft) !== JSON.stringify(recruitmentReviewDraft(current))
  async function save(value) {
    const result = await onSave(value)
    if (result) {setCurrent(result); setDraft(recruitmentReviewDraft(result))}
  }
  return <RecruitmentReviewPanel lead={current} draft={draft} onChange={setDraft} onSave={save} onDownload={vi.fn()} onReject={onReject} dirty={dirty}><section aria-label="Saved review decision">Ready to record approval</section></RecruitmentReviewPanel>
}
function fillFinding(label, result, notes = 'Evidence checked with the applicant.') {
  fireEvent.click(screen.getByRole('button',{name:`${result} ${label}`,exact:true}))
  fireEvent.change(screen.getByRole('textbox',{name:`${label} findings`}),{target:{value:notes}})
}
const saved = (record, draft) => {
  const next = {...record,review_json:draft,review_updated_at:'2026-10-10'}
  return {...next,review_status:recruitmentReviewSummary(next).status}
}

it('guides documents through checks to outcome with optional findings and saves only on request', async () => {
  const onSave = vi.fn().mockImplementation(draft => Promise.resolve(saved(lead,draft)))
  render(<Harness onSave={onSave} />)
  expect(screen.getByRole('heading',{name:'Check the documents'})).toBeTruthy()
  expect(within(screen.getByRole('region',{name:'Document review'})).queryByRole('combobox')).toBeNull()
  expect(screen.queryByRole('region',{name:'Review checklist'})).toBeNull()
  expect(within(screen.getByRole('region',{name:'Document review'})).getByText('What did you check? (optional)')).toBeTruthy()
  expect(screen.queryByText('Choose a result for this item.')).toBeNull()
  expect(screen.queryByText('A short finding is required after choosing a result.')).toBeNull()
  expect(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}).getAttribute('aria-describedby')).toBeNull()
  expect(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}).getAttribute('aria-required')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Continue to application checks'}))
  expect(screen.getByRole('alert').textContent).toContain('each file')
  expect(document.activeElement).toBe(screen.getByRole('alert'))
  expect(screen.getByRole('group',{name:'CV (cv.pdf) result'}).getAttribute('aria-invalid')).toBe('true')
  fireEvent.click(screen.getByRole('button',{name:'Approve CV (cv.pdf)',exact:true}))
  fireEvent.click(screen.getByRole('button',{name:'Continue to application checks'}))
  expect(screen.getByRole('heading',{name:'Confirm the application details'})).toBeTruthy()
  expect(within(screen.getByRole('region',{name:'Review checklist'})).queryByRole('combobox')).toBeNull()
  expect(screen.queryByRole('region',{name:'Document review'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Continue to outcome'}))
  expect(screen.getByRole('alert').textContent).toContain('each application check')
  for (const label of labels) fillFinding(label,'Approve','')
  fireEvent.click(screen.getByRole('button',{name:'Continue to outcome'}))
  expect(screen.getByText('The checks are complete')).toBeTruthy()
  expect(screen.queryByRole('region',{name:'Saved review decision'})).toBeNull()
  expect(onSave).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Overall review / interview notes')).toBeNull()
  expect(screen.queryByLabelText('Follow-up date (optional)')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Save review'}))
  await screen.findByRole('region',{name:'Saved review decision'})
  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave.mock.calls[0][0]).toMatchObject({documents:[{path:file.path,status:'reviewed',notes:''}],notes:'',followUpOn:''})
  expect(Object.values(onSave.mock.calls[0][0].checks).every(check => check.notes === '')).toBe(true)
  expect(screen.queryByRole('button',{name:'Save review'})).toBeNull()
  expect(screen.queryByText('No unsaved changes')).toBeNull()
  expect(screen.queryByText('Your saved review is ready for a decision.')).toBeNull()
  expect(screen.queryByRole('button',{name:'Back'})).toBeNull()
  expect(document.querySelector('.recruitment-review__save-bar')).toBeNull()
})

it('keeps edits when going back and allows incomplete work to be saved without allowing approval', async () => {
  const onSave = vi.fn().mockImplementation(draft => Promise.resolve(saved(lead,draft)))
  render(<Harness onSave={onSave} />)
  fireEvent.change(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}),{target:{value:'Waiting for the applicant to clarify work history.'}})
  fireEvent.click(screen.getByRole('button',{name:'Application checks'}))
  fillFinding(labels[0],'Reject','Request the current FFC.')
  fireEvent.click(screen.getByRole('button',{name:'Back'}))
  expect(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}).value).toBe('Waiting for the applicant to clarify work history.')
  fireEvent.click(screen.getByRole('button',{name:'Outcome'}))
  expect(screen.getByText('There is still work to finish')).toBeTruthy()
  expect(within(screen.getByRole('region',{name:'Review outcome'})).getByRole('list').textContent).toContain('CV (cv.pdf)')
  fireEvent.click(screen.getByRole('button',{name:'Application checks'}))
  expect(screen.getByRole('textbox',{name:`${labels[0]} findings`}).value).toBe('Request the current FFC.')
  fireEvent.click(screen.getByRole('button',{name:'Save progress'}))
  await waitFor(() => expect(screen.queryByRole('button',{name:'Save progress'})).toBeNull())
  expect(onSave).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button',{name:'Outcome'}))
  expect(screen.getByText('There is still work to finish')).toBeTruthy()
  expect(screen.queryByRole('region',{name:'Saved review decision'})).toBeNull()
})

it('allows rejected checks to reach outcome and shows the rejection reason without enabling approval', async () => {
  const record = {...lead,documents_json:[]}
  const onSave = vi.fn().mockImplementation(draft => Promise.resolve(saved(record,draft)))
  render(<Harness record={record} onSave={onSave} />)
  for (const label of labels) fillFinding(label,label === labels[0] ? 'Reject' : 'Approve',label === labels[0] ? 'Request the renewed FFC certificate.' : 'Evidence checked with the applicant.')
  fireEvent.click(screen.getByRole('button',{name:'Continue to outcome'}))
  expect(screen.getByText('Some items were rejected')).toBeTruthy()
  expect(within(screen.getByRole('region',{name:'Review outcome'})).getByText('Request the renewed FFC certificate.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Save review'}))
  await waitFor(() => expect(screen.queryByRole('button',{name:'Save review'})).toBeNull())
  expect(screen.queryByRole('region',{name:'Saved review decision'})).toBeNull()
})

it('retains findings after a save failure and prevents repeated saves while a retry is pending', async () => {
  let finishRetry
  const onSave = vi.fn().mockRejectedValueOnce(new Error('Connection lost. Please retry.')).mockImplementationOnce(() => new Promise(resolve => {finishRetry = resolve}))
  render(<Harness onSave={onSave} />)
  fireEvent.change(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}),{target:{value:'Applicant work history noted.'}})
  fireEvent.click(screen.getByRole('button',{name:'Save progress'}))
  expect((await screen.findByRole('alert')).textContent).toBe('Connection lost. Please retry.')
  expect(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}).value).toBe('Applicant work history noted.')
  await waitFor(() => expect(screen.getByRole('button',{name:'Save progress'}).disabled).toBe(false))
  const retry = screen.getByRole('button',{name:'Save progress'})
  fireEvent.click(retry)
  fireEvent.click(retry)
  expect(onSave).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button',{name:'Continue to application checks'}).disabled).toBe(true)
  finishRetry(saved(lead,onSave.mock.calls[1][0]))
  await waitFor(() => expect(screen.queryByRole('button',{name:'Save progress'})).toBeNull())
  expect(screen.queryByRole('region',{name:'Saved review decision'})).toBeNull()
})

it('requires a reason for a rejected file, saves it for that file and keeps the final application decision separate', async () => {
  const record = {...lead,review_json:recruitmentReviewDraft(lead)}
  for (const check of Object.values(record.review_json.checks)) {check.status='verified'; check.notes='Supporting evidence checked.'}
  const onSave = vi.fn().mockImplementation(draft => Promise.resolve(saved(record,draft)))
  const onReject = vi.fn()
  render(<Harness record={record} onSave={onSave} onReject={onReject} />)
  const reject = screen.getByRole('button',{name:'Reject CV (cv.pdf)',exact:true})
  const approve = screen.getByRole('button',{name:'Approve CV (cv.pdf)',exact:true})
  fireEvent.click(reject)
  expect(reject.getAttribute('aria-pressed')).toBe('true')
  expect(approve.getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByText('Reason for rejection')).toBeTruthy()
  expect(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}).getAttribute('aria-required')).toBe('true')
  fireEvent.click(screen.getByRole('button',{name:'Continue to application checks'}))
  expect(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}).getAttribute('aria-invalid')).toBe('true')
  expect(onSave).not.toHaveBeenCalled()
  expect(onReject).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}),{target:{value:'The file is unreadable. Request a new copy.'}})
  fireEvent.click(screen.getByRole('button',{name:'Continue to application checks'}))
  fireEvent.click(screen.getByRole('button',{name:'Continue to outcome'}))
  expect(screen.getByText('Some items were rejected')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Save review'}))
  await waitFor(() => expect(screen.queryByRole('button',{name:'Save review'})).toBeNull())
  expect(onSave.mock.calls[0][0].documents).toEqual([{path:file.path,status:'needs_information',notes:'The file is unreadable. Request a new copy.'}])
  expect(screen.queryByRole('region',{name:'Saved review decision'})).toBeNull()
  expect(onReject).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Documents',exact:true}))
  fireEvent.click(screen.getByRole('button',{name:'Approve CV (cv.pdf)',exact:true}))
  expect(screen.getByRole('button',{name:'Approve CV (cv.pdf)',exact:true}).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button',{name:'Reject CV (cv.pdf)',exact:true}).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}).value).toBe('The file is unreadable. Request a new copy.')
})

it('preserves a saved Not applicable finding until the reviewer deliberately chooses a new result', async () => {
  const record = {...lead,review_json:recruitmentReviewDraft(lead)}
  record.review_json.documents[0] = {path:file.path,status:'not_applicable',notes:'A CV does not apply to this applicant.'}
  const onSave = vi.fn()
  render(<Harness record={record} onSave={onSave} />)
  fireEvent.click(screen.getByRole('button',{name:'Documents',exact:true}))
  expect(screen.getByText('Saved result: Not applicable.')).toBeTruthy()
  expect(screen.getByRole('button',{name:'Approve CV (cv.pdf)',exact:true}).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button',{name:'Reject CV (cv.pdf)',exact:true}).getAttribute('aria-pressed')).toBe('false')
  fireEvent.change(screen.getByRole('textbox',{name:'CV (cv.pdf) findings'}),{target:{value:'A CV does not apply; interview experience recorded.'}})
  fireEvent.click(screen.getByRole('button',{name:'Save progress'}))
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
  expect(onSave.mock.calls[0][0].documents[0].status).toBe('not_applicable')
})
