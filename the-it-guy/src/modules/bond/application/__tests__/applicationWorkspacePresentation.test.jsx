// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BondApplicationTaskWorkspace from '../workspace/BondApplicationTaskWorkspace.jsx'
import BondApplicationStageProgress from '../workspace/BondApplicationStageProgress.jsx'

afterEach(cleanup)
const workspace = {
  progressPercent: 25,
  documentBlockers: [{ key: 'income' }],
  activeSection: { key: 'summary' },
  sectionCards: [
    { key: 'summary', label: 'Application Summary', state: 'needs_input', stateLabel: '1/2 complete' },
    { key: 'documents', label: 'Documents', state: 'ready_to_confirm', stateLabel: 'Ready' },
    { key: 'declarations_consents', label: 'Declarations', state: 'needs_input', stateLabel: 'Needs review' },
  ],
  nextAction: { label: 'Complete missing field', detail: 'Purchase price is required.', disabled: false },
}
it('preserves section navigation and the real next action in a single workspace', () => {
  const onNextAction = vi.fn(), onSectionChange = vi.fn()
  render(<BondApplicationTaskWorkspace workspace={workspace} onNextAction={onNextAction} onSectionChange={onSectionChange} />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Application section' }), { target: { value: 'documents' } })
  expect(onSectionChange).toHaveBeenCalledWith('documents')
  fireEvent.click(screen.getByRole('button', { name: 'Complete missing field' }))
  expect(onNextAction).toHaveBeenCalledOnce()
  expect(screen.getByRole('option', { name: 'Documents · 1 needed' })).toBeTruthy()
  expect(screen.getByRole('list', { name: 'Application stages' }).children[1].textContent).toBe('2Documents')
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
  expect(screen.getByRole('list', { name: 'Application stages' }).children).toHaveLength(4)
})
it('respects blocked next actions', () => {
  const onNextAction = vi.fn()
  render(<BondApplicationTaskWorkspace workspace={{ ...workspace, nextAction: { ...workspace.nextAction, disabled: true } }} onNextAction={onNextAction} onSectionChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Complete missing field' }))
  expect(onNextAction).not.toHaveBeenCalled()
})
it('keeps stage completion independent from the displayed percentage', () => {
  render(<BondApplicationStageProgress activeIndex={2} completed={[0]} percent={100} />)
  const stages = screen.getByRole('list', { name: 'Application stages' }).children
  expect(stages[2].getAttribute('aria-current')).toBe('step')
  expect(stages[3].textContent).toBe('4Submission')
})
