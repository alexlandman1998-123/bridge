// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import useListingCaptureSession from '../useListingCaptureSession'

function Capture() {
  const id = useListingCaptureSession()
  const navigate = useNavigate()
  return <><output data-testid="session">{id}</output>
    <button onClick={() => navigate('/listings/new')}>New</button>
    <button onClick={() => navigate('/listings/new?step=property', { replace: true })}>Clean URL</button>
  </>
}
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })

it('gives explicit New clicks separate recovery identities, even on the same route', () => {
  window.history.replaceState(null, '', '/listings/new')
  render(<BrowserRouter><Capture /></BrowserRouter>)
  const first = screen.getByTestId('session').textContent
  fireEvent.click(screen.getByText('New'))
  expect(screen.getByTestId('session').textContent).not.toBe(first)
})

it('retains recovery on refresh and replace-only URL cleanup', () => {
  window.history.replaceState({ unrelated: 'keep' }, '', '/listings/new')
  const view = render(<BrowserRouter><Capture /></BrowserRouter>)
  const first = screen.getByTestId('session').textContent
  expect(window.history.state.unrelated).toBe('keep')
  fireEvent.click(screen.getByText('Clean URL'))
  expect(screen.getByTestId('session').textContent).toBe(first)
  view.unmount()
  render(<BrowserRouter><Capture /></BrowserRouter>)
  expect(screen.getByTestId('session').textContent).toBe(first)
})

it('does not reuse an old entry for a fresh direct visit', () => {
  window.history.replaceState(null, '', '/listings/new')
  const view = render(<BrowserRouter><Capture /></BrowserRouter>)
  const first = screen.getByTestId('session').textContent
  view.unmount()
  window.history.replaceState(null, '', '/listings/new')
  render(<BrowserRouter><Capture /></BrowserRouter>)
  expect(screen.getByTestId('session').textContent).not.toBe(first)
})
