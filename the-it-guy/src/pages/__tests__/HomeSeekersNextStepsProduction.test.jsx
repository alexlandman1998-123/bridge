// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import HomeSeekersNextSteps from '../HomeSeekersNextSteps'
import { homeSeekersInformationSessionUrl, upcomingHomeSeekersSessions } from '../homeSeekersBookingLinks'
afterEach(()=>{cleanup();vi.useRealTimers()})
it('shows the verified Demio date with South African timezone and expires it safely',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-24T10:00:00Z'))
  render(<HomeSeekersNextSteps />)
  expect(screen.getByRole('heading',{name:/Friday,? 30 Oct.*12:00 SAST/})).toBeTruthy()
  expect(homeSeekersInformationSessionUrl).toBe('https://my.demio.com/ref/ZvxISM3Y0S1q0ClZ')
  expect(upcomingHomeSeekersSessions(new Date('2026-10-30T10:01:00Z'))).toEqual([])
})
it('uses an explicit placeholder when no future session is published',()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-01T10:00:00Z'))
  render(<HomeSeekersNextSteps />)
  expect(screen.getByText('[NEXT SESSION DATE + TIME]')).toBeTruthy()
  fireEvent.click(screen.getByRole('link',{name:'Join the next live session'}))
  expect(screen.getByTitle('Home Seekers live session registration').src).toBe(homeSeekersInformationSessionUrl)
})
