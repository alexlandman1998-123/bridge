// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PublicDevelopmentUnitDialog from '../PublicDevelopmentUnitDialog.jsx';
const unit = { id: 'u1', unitNumber: '001', unitType: '3 Bedroom Residence', bedrooms: 3, bathrooms: 2.5, parkingCount: 2, gardenSizeSqm: 45, visitorParkingCount: 0, price: 2750000, status: 'available' };
const props = { unit, media: { galleryImageUrls: ['/one.jpg', '/two.jpg'] }, enquiry: '#enquire', onClose: vi.fn(), onToggleShortlist: vi.fn(), onToggleCompare: vi.fn() };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute('open'); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('opens a modal in the document body, shows recorded facts including zero, and restores scroll on unmount', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const { unmount } = render(<PublicDevelopmentUnitDialog {...props} />);
  expect(screen.getByRole('dialog').parentNode).toBe(document.body);
  expect(document.body.style.overflow).toBe('hidden');
  expect(screen.getByText('45 m²')).toBeTruthy();
  expect(screen.getByText('Visitor parking').nextElementSibling.textContent).toBe('0');
  expect(screen.getByText('Parking bays').nextElementSibling.textContent).toBe('2');
  fireEvent.click(screen.getByRole('button', { name: 'Next residence image' }));
  expect(screen.getByAltText('Residence 001, gallery image 2').getAttribute('src')).toBe('/two.jpg');
  fireEvent.click(screen.getByRole('button', { name: 'Shortlist' }));
  expect(props.onToggleShortlist).toHaveBeenCalledOnce();
  unmount();
  expect(document.body.style.overflow).toBe('');
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
it('labels shared imagery, leaves unknown facts unconfirmed, and supports floor plans and closing', () => {
  render(<PublicDevelopmentUnitDialog {...props} unit={{...unit, gardenSizeSqm: undefined, visitorParkingCount: undefined}} floorPlanFallback={{url:'/plan.jpg',source:'unit_type'}} />);
  expect(screen.getByText('Garden size').nextElementSibling.textContent).toBe('To be confirmed');
  expect(screen.getByText('Visitor parking').nextElementSibling.textContent).toBe('To be confirmed');
  expect(screen.getByText('Development gallery · representative images')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Floor plan', exact:true }));
  expect(screen.getByAltText('Residence 001 floor plan').getAttribute('src')).toBe('/plan.jpg');
  fireEvent.click(screen.getByRole('button', { name: 'Close residence details' }));
  expect(props.onClose).toHaveBeenCalledOnce();
});
it('retains the chosen unit for the enquiry and closes the modal', () => {
  render(<PublicDevelopmentUnitDialog {...props} />);
  fireEvent.click(screen.getByRole('link', {name:'Enquire about residence 001'}));
  expect(JSON.parse(sessionStorage.getItem('arch9:development-enquiry-unit')).id).toBe('u1');
  expect(props.onClose).toHaveBeenCalledOnce();
});

it('simplifies the estate popup and hands the selected unit to the reservation flow', () => {
  const onReserve = vi.fn();
  render(<PublicDevelopmentUnitDialog {...props} estatePresentation onReserve={onReserve} />);
  expect(document.querySelector('.residence-dialog__status')).toBeNull();
  expect(screen.queryByText('Your next address')).toBeNull();
  expect(screen.queryByText('3 Bedroom Residence')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Shortlist' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
  expect(screen.getByText('Parking bays').nextElementSibling.textContent).toBe('2');
  fireEvent.click(screen.getByRole('button', { name: 'Reserve unit 001' }));
  expect(onReserve).toHaveBeenCalledWith(unit);
  expect(props.onClose).toHaveBeenCalledOnce();
});
it.each(['reserved', 'sold', 'unreleased'])('does not offer a reservation for a %s unit', (status) => {
  const onReserve = vi.fn();
  render(<PublicDevelopmentUnitDialog {...props} unit={{ ...unit, status }} estatePresentation onReserve={onReserve} />);
  const action = document.querySelector('.residence-dialog__reserve');
  expect(action.disabled).toBe(true);
  fireEvent.click(action);
  expect(onReserve).not.toHaveBeenCalled();
});
