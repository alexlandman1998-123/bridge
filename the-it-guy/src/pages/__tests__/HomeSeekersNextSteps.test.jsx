// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import HomeSeekersNextSteps from '../HomeSeekersNextSteps'
import { JoinJourney } from '../homeSeekersJoinContext'
import { splitCalculatorDefaults } from '../homeSeekersSplitCalculatorModel'
import { joinCalculatorContext } from '../homeSeekersJoinJourney'
afterEach(() => {cleanup();vi.restoreAllMocks()})
it('keeps the 30-minute call first and the application last', () => {
  const {container}=render(<HomeSeekersNextSteps />)
  expect([...container.querySelectorAll('.hs-join-rebuild__next-cards>article')].map(node=>node.id)).toEqual(['book-call','live-session','apply'])
  expect(screen.getByText('30 minutes, no obligation.')).toBeTruthy()
  expect(container.textContent).not.toMatch(/qualifying agents only|only show the calendar if you qualify/i)
  const form=screen.getByRole('form',{name:'Founder call booking details'})
  expect([...form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]),select')].map(node=>node.name)).toEqual(['name','mobile','email','sales','model'])
})
it('does not gate a call for an agent with under five sales', () => {
  render(<HomeSeekersNextSteps />)
  for(const [label,value] of [['Name','Test Agent'],['Mobile number','0821234567'],['Email','agent@example.test'],['Registered sales in the last 12 months','under 5'],['Current model','70/30']]) fireEvent.change(screen.getByLabelText(label),{target:{value}})
  fireEvent.click(screen.getByLabelText('I agree to be contacted about this enquiry.'))
  fireEvent.submit(screen.getByRole('form',{name:'Founder call booking details'}))
  expect(screen.getByTitle('Book a 30-minute founder call').getAttribute('src')).toContain('thomas-homeseekers/30min')
  expect(screen.queryByText(/you’re under it at the moment/)).toBeNull()
})
it('prefills the booking questions from actual calculator inputs', () => {
  const calculator=joinCalculatorContext({...splitCalculatorDefaults,sales:'4',model:'80/20'})
  const {container}=render(<HomeSeekersNextSteps calculator={calculator} />)
  expect(screen.getByLabelText('Current model').value).toBe('80/20')
  expect(screen.getByLabelText('Registered sales in the last 12 months').value).toBe('under 5')
  expect(JSON.parse(container.querySelector('[name=calculator]').value).result.difference).toBe(calculator.result.difference)
})
it('loads registration inside the page only on request, and opens the existing application', () => {
  const open=vi.fn()
  render(<JoinJourney.Provider value={{open}}><HomeSeekersNextSteps /></JoinJourney.Provider>)
  expect(screen.queryByTitle('Home Seekers live session registration')).toBeNull()
  fireEvent.click(screen.getByRole('link',{name:'Join the next live session'}))
  expect(screen.getByTitle('Home Seekers live session registration').src).toBe('https://my.demio.com/ref/ZvxISM3Y0S1q0ClZ')
  expect(screen.queryByText(/DEMIO EMBED OR LINK/)).toBeNull()
  fireEvent.click(screen.getByRole('link',{name:'Apply to join'}))
  expect(open).toHaveBeenCalledWith('apply','next steps')
})
