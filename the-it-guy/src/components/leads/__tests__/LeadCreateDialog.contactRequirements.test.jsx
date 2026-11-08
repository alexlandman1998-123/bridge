// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import LeadCreateDialog from '../LeadCreateDialog.jsx'

vi.mock('../../AgentAssignmentSelect', () => ({ default: () => null }))
vi.mock('../../location/AddressAutocomplete', () => ({ default: () => null }))
afterEach(cleanup)

function setup() {
  const onSave = vi.fn()
  render(<LeadCreateDialog open category="buyer" onClose={() => {}} onSave={onSave} />)
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Example' } })
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Buyer' } })
  return { onSave, form: screen.getByLabelText('First name').form }
}

it.each([
  ['Email', 'buyer@example.test', 'Mobile'],
  ['Mobile', '0821234567', 'Email'],
])('captures a buyer with %s as the available contact method', (field, value, optional) => {
  const { onSave, form } = setup()
  fireEvent.change(screen.getByLabelText(field), { target: { value } })
  expect(form.checkValidity()).toBe(true)
  expect(screen.getByLabelText(optional).required).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Create Lead' }))
  expect(onSave).toHaveBeenCalledOnce()
})

it('still requires a contact method and validates any email that is entered', () => {
  const { onSave, form } = setup()
  expect(form.checkValidity()).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Create Lead' }))
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '0821234567' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid email' } })
  expect(form.checkValidity()).toBe(false)
})
