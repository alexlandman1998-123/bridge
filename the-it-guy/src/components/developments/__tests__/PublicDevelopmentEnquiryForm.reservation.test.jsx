// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PublicDevelopmentEnquiryForm from '../PublicDevelopmentEnquiryForm.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });
it.each([false, true])('retains the selected unit when the message is edited (estate layout: %s)', (estatePresentation) => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(<PublicDevelopmentEnquiryForm estatePresentation={estatePresentation} developmentName="Madison Place" agency="Samlin Construction" enquiry="mailto:sales@example.test" reservationUnit={{ id: 'unit-039', unitNumber: '039' }} />);
  if (estatePresentation) {
    expect(screen.queryByLabelText('I’m interested in')).toBeNull();
    expect(screen.queryByText('Talk to the sales team.')).toBeNull();
  } else expect(screen.getByLabelText('I’m interested in').value).toBe('Reserve a unit');
  expect(screen.getByLabelText('How can we help?').value).toContain('unit 039');
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Buyer' } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'buyer@example.test' } });
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0100000000' } });
  fireEvent.change(screen.getByLabelText('How can we help?'), { target: { value: 'Please contact me.' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send reservation request' }).closest('form'));
  const destination = new URL(open.mock.calls[0][0]);
  expect(destination.searchParams.get('body')).toContain('Unit: 039');
  expect(destination.searchParams.get('body')).toContain('Interest: Reserve a unit');
  expect(screen.getByText(/ready to send/)).toBeTruthy();
});
