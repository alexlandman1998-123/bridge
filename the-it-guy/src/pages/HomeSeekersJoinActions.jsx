import { useContext } from 'react'
import { JoinJourney } from './homeSeekersJoinContext'
import { homeSeekersPath } from './homeSeekersRoutes'
import { nav } from './homeSeekersJoinCopy'
import { upcomingHomeSeekersSessions } from './homeSeekersBookingLinks'
import { formatNextStepDate } from './homeSeekersNextStepsModel'
import HomeSeekersLoginLink from './HomeSeekersLoginLink'
import HomeSeekersMobileNav from './HomeSeekersMobileNav'

export const founderFirstName = 'Thomas'
export function OwnerPlaceholder({ children }) { return <mark className="hs-join-rebuild__placeholder">{children}</mark> }
export function JoinActions({ section, sticky = false }) {
  const journey = useContext(JoinJourney)
  const session = upcomingHomeSeekersSessions()[0]
  function action(event, type) {
    if (!journey) return
    event.preventDefault()
    journey.open(type, section)
  }
  const label = `Book a call with ${founderFirstName}`
  return <div className={`hs-join-rebuild__actions${sticky ? ' hs-join-rebuild__sticky' : ''}`} data-placement={section}>
    <a className="hs-join__button" href={homeSeekersPath('/join#book-call')} onClick={event => action(event, 'call')}>{sticky ? 'Book a call' : label}</a>
    <a className="hs-join__button hs-join-rebuild__secondary" href={homeSeekersPath('/join#live-session')} onClick={event => action(event, 'session')} title={session ? formatNextStepDate(session.start) : '[NEXT SESSION DATE + TIME]'}>{sticky ? 'Live session' : 'Join the next live session'}</a>
    {!sticky && <a className="hs-join__button hs-join-rebuild__secondary" href={homeSeekersPath('/join#apply')} onClick={event => action(event, 'apply')}>Apply to join</a>}
  </div>
}
export function JoinHeader() {
  return <header className="hs-join__header"><a href={homeSeekersPath('/')} aria-label="Home Seekers home"><img src="/brand/homeseekers/home-seekers-horizontal-black.svg" width="158" height="45" alt="Home Seekers" /></a><nav aria-label="Main navigation">{nav.map(([label,slug])=><a href={homeSeekersPath(`/${slug}`)} key={slug} aria-current={slug === 'join' ? 'page' : undefined}>{label}</a>)}<HomeSeekersLoginLink /></nav><HomeSeekersMobileNav links={nav.map(([label,slug])=>[label,homeSeekersPath(`/${slug}`)])} active="join us" /></header>
}
