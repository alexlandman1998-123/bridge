// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import HomeSeekersSplitCalculator from '../HomeSeekersSplitCalculator'
import { submitJoinFollowUp, trackJoinEvent } from '../homeSeekersJoinJourney'
vi.mock('../homeSeekersNextStepsModel',async original=>({...await original(),isNextStepsLocalReview:()=>false}))
vi.mock('../homeSeekersJoinJourney',async original=>({...await original(),submitJoinFollowUp:vi.fn(),trackJoinEvent:vi.fn()}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('calls a queued breakdown queued and does not count it as an emailed conversion',async()=>{
 submitJoinFollowUp.mockResolvedValue({accepted:true,deliveryQueued:true,deliveryAccepted:false})
 render(<HomeSeekersSplitCalculator />)
 fireEvent.change(screen.getByLabelText('Email for this breakdown'),{target:{value:'agent@homeseekers.co.za'}})
 fireEvent.click(screen.getByRole('button',{name:'Email me this breakdown'}))
 expect(await screen.findByText(/Your breakdown is queued for agent@homeseekers.co.za/)).toBeTruthy()
 expect(trackJoinEvent).not.toHaveBeenCalledWith('breakdown_emailed',expect.anything(),expect.anything())
})
it('shows sent and records the conversion only after provider acceptance',async()=>{
 submitJoinFollowUp.mockResolvedValue({accepted:true,deliveryAccepted:true})
 render(<HomeSeekersSplitCalculator />)
 fireEvent.change(screen.getByLabelText('Email for this breakdown'),{target:{value:'agent@homeseekers.co.za'}})
 fireEvent.click(screen.getByRole('button',{name:'Email me this breakdown'}))
 expect(await screen.findByText('Breakdown sent to agent@homeseekers.co.za.')).toBeTruthy()
 expect(trackJoinEvent).toHaveBeenCalledWith('breakdown_emailed','calculator',expect.any(String))
})
