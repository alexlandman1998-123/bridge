// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { setHomeSeekersMeasurementConsent } from '../homeSeekersPixel'
import { joinEvents, trackJoinEvent, joinCalculatorContext } from '../homeSeekersJoinJourney'
import { splitCalculatorDefaults } from '../homeSeekersSplitCalculatorModel'
afterEach(()=>{setHomeSeekersMeasurementConsent(false);vi.unstubAllGlobals()})
it('gates all six events on current consent, deduplicates each receipt and omits personal answers',()=>{
  const fbq=vi.fn();vi.stubGlobal('fbq',fbq)
  setHomeSeekersMeasurementConsent(false)
  for(const event of joinEvents) expect(trackJoinEvent(event,'hero',`test-${event}`)).toBe(false)
  expect(fbq).not.toHaveBeenCalled()
  setHomeSeekersMeasurementConsent(true)
  for(const event of joinEvents) {
    expect(trackJoinEvent(event,'calculator',`test-${event}`)).toBe(true)
    expect(trackJoinEvent(event,'calculator',`test-${event}`)).toBe(false)
  }
  expect(fbq).toHaveBeenCalledTimes(6)
  for(const call of fbq.mock.calls) expect(call[3]).toEqual({section:'calculator',page_path:'/join'})
  setHomeSeekersMeasurementConsent(false)
  expect(trackJoinEvent('book_call','founder','different-receipt')).toBe(false)
})
it('recomputes calculator context and rejects invalid numbers',()=>{
  expect(joinCalculatorContext(splitCalculatorDefaults).result.difference).toBe(147000)
  expect(joinCalculatorContext({...splitCalculatorDefaults,sales:''})).toBeNull()
})
