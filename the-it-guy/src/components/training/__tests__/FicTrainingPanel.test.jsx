// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ getFicTrainingResult: vi.fn(), listFicTrainingAgents: vi.fn(), listFicTrainingResults: vi.fn(), saveFicTrainingResult: vi.fn() }))
vi.mock('../../../services/ficTrainingService', () => api)
import FicTrainingPanel from '../FicTrainingPanel'
beforeEach(() => {
  api.getFicTrainingResult.mockResolvedValue(null)
  api.listFicTrainingAgents.mockResolvedValue([{ userId:'agent-2',name:'Other agency agent',email:'agent@example.test' }])
  api.listFicTrainingResults.mockResolvedValue([{userId:'agent-2',score:5,totalQuestions:6}])
  api.saveFicTrainingResult.mockResolvedValue({score:6,totalQuestions:6,completedAt:'2026-10-02'})
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('loads and saves the same module for a non-HomeSeekers agency', async () => {
  render(<FicTrainingPanel organisationId="agency-2" userId="agent-2" />)
  await screen.findByRole('button',{name:'Start training'})
  expect(api.getFicTrainingResult).toHaveBeenCalledWith({organisationId:'agency-2',userId:'agent-2'})
  fireEvent.click(screen.getByRole('button',{name:'Start training'}))
  for (const answer of ['Tailoring due diligence based on risk level','Identifying and verifying clients','Fines, imprisonment, and reputational damage','Terrorist Financing','Funding the spread of weapons of mass destruction','Re-verify the client’s information']) {
    fireEvent.click(screen.getByRole('button',{name:new RegExp(answer)}))
    fireEvent.click(screen.getByRole('button',{name: answer.startsWith('Re-verify') ? 'Submit training' : 'Next'}))
  }
  await screen.findByText('Your FIC result is recorded')
  expect(api.saveFicTrainingResult).toHaveBeenCalledWith(expect.objectContaining({organisationId:'agency-2',userId:'agent-2',score:6,totalQuestions:6}))
  expect(document.body.textContent).not.toContain('Home Seekers')
})
it('scopes principal team progress to the current agency and keeps quiz preview read-only', async () => {
  render(<FicTrainingPanel organisationId="agency-2" userId="principal-2" isPrincipal />)
  fireEvent.click(screen.getByRole('button',{name:'View team progress'}))
  await screen.findByText('Other agency agent')
  expect(api.listFicTrainingAgents).toHaveBeenCalledWith({organisationId:'agency-2'})
  expect(api.listFicTrainingResults).toHaveBeenCalledWith({organisationId:'agency-2'})
  fireEvent.click(screen.getByRole('button',{name:'Close'}))
  fireEvent.click(screen.getByRole('button',{name:'Try quiz'}))
  expect(screen.getByRole('dialog',{name:'FIC quiz preview'})).toBeTruthy()
  expect(api.saveFicTrainingResult).not.toHaveBeenCalled()
})
