// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const api = vi.hoisted(() => ({ getRecruitmentJoiningOptions: vi.fn(), getRecruitmentJoiningConnections: vi.fn() }))
vi.mock('../../../services/recruitmentService', () => api)
import RecruitmentJoiningDetails from '../RecruitmentJoiningDetails'
import { emptyJoiningPlan } from '../recruitmentJoiningModel'
afterEach(() => { cleanup(); vi.resetAllMocks() })
const lead = { id: 'lead', version: 1, joining_json: emptyJoiningPlan('branch') }
const branchId = '11111111-1111-4111-8111-111111111111'

it('loads organisation choices, preserves the origin, and shows application and workspace invitations separately', async () => {
  api.getRecruitmentJoiningOptions.mockResolvedValue({ branches: [{id:branchId,name:'Head Office'}], commissionStructures: [] })
  api.getRecruitmentJoiningConnections.mockResolvedValue({ applications:[{id:'application',expiresAt:'2099-10-15'}],workspace:[{id:'access',status:'pending',expiresAt:'2099-10-15'}] })
  const onChange = vi.fn()
  render(<RecruitmentJoiningDetails lead={lead} draft={lead} organisationId="agency" onChange={onChange} />)
  await screen.findByRole('option',{name:'Head Office'})
  fireEvent.change(screen.getByLabelText('Intended branch'),{target:{value:branchId}})
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({branchId,origin:{entryPoint:'branch'}}))
  fireEvent.click(screen.getByLabelText('Rentals'))
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({businessWorkspaces:['rentals']}))
  expect(screen.getByText('Application invitation · Available')).toBeTruthy()
  expect(screen.getByText('Workspace invitation · pending')).toBeTruthy()
})

it('locks planned choices after access is prepared and retains missing saved options', async () => {
  api.getRecruitmentJoiningOptions.mockResolvedValue({ branches: [],commissionStructures:[] })
  api.getRecruitmentJoiningConnections.mockResolvedValue({applications:[],workspace:[]})
  const saved = {...lead,activation_json:{inviteId:'invite'},joining_json:{...lead.joining_json,branchId}}
  render(<RecruitmentJoiningDetails lead={saved} draft={saved} organisationId="agency" onChange={vi.fn()} />)
  await screen.findByText('No invitations linked yet.')
  expect(screen.getByLabelText('Intended branch').value).toBe(branchId)
  expect(screen.getByRole('option',{name:'Saved choice — unavailable'})).toBeTruthy()
  expect(screen.getByLabelText('Intended role').closest('fieldset').disabled).toBe(true)
})

it('reports lookup failures and does not replace saved choices with empty results', async () => {
  api.getRecruitmentJoiningOptions.mockRejectedValue(new Error('Joining setup is pending.'))
  api.getRecruitmentJoiningConnections.mockResolvedValue({applications:[],workspace:[]})
  const onChange = vi.fn()
  render(<RecruitmentJoiningDetails lead={lead} draft={lead} organisationId="agency" onChange={onChange} />)
  expect((await screen.findByRole('alert')).textContent).toContain('Joining setup is pending.')
  expect(screen.getByLabelText('Intended branch').disabled).toBe(true)
  expect(onChange).not.toHaveBeenCalled()
})
