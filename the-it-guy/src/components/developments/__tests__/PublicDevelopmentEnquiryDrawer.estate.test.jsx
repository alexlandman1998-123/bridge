// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import PublicDevelopmentEnquiryDrawer from '../PublicDevelopmentEnquiryDrawer.jsx';
function Harness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Reserve unit 011</button><PublicDevelopmentEnquiryDrawer open={open} onClose={() => setOpen(false)} developmentName="Madison Place" agency="Samlin Construction" enquiry="#enquire" estatePresentation reservationUnit={{ id: 'u11', unitNumber: '011' }} /></>;
}
afterEach(() => { cleanup(); sessionStorage.clear(); });
it('uses one heading and supports keyboard focus, dismissal and scroll restoration', () => {
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Reserve unit 011' });
  opener.focus();
  fireEvent.click(opener);
  expect(screen.getAllByRole('heading')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Reserve unit 011.' })).toBeTruthy();
  expect(screen.queryByText('Make it home')).toBeNull();
  expect(screen.queryByText('Enquire')).toBeNull();
  expect(document.activeElement).toBe(screen.getByLabelText('Full name'));
  const submit = screen.getByRole('button', { name: 'Send reservation request' });
  submit.focus();
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close enquiry form' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe('');
});
