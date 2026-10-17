import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { disableRecruitmentMeasurement, enableRecruitmentMeasurement } from './homeSeekersRecruitment'
import { HOME_SEEKERS_MEASUREMENT_CONSENT_EVENT, homeSeekersMeasurementConsent, homeSeekersPixelSurface, pauseHomeSeekersPixel, trackHomeSeekersPage } from './homeSeekersPixel'
import './HomeSeekersMeasurement.css'

export default function HomeSeekersMeasurement() {
  const location = useLocation()
  const [consent, setConsent] = useState(homeSeekersMeasurementConsent)
  const [editing, setEditing] = useState(false)
  const available = homeSeekersPixelSurface()
  useEffect(() => {
    const changed = () => setConsent(homeSeekersMeasurementConsent())
    window.addEventListener(HOME_SEEKERS_MEASUREMENT_CONSENT_EVENT, changed)
    return () => {
      window.removeEventListener(HOME_SEEKERS_MEASUREMENT_CONSENT_EVENT, changed)
      pauseHomeSeekersPixel()
    }
  }, [])
  useEffect(() => {
    if (available && consent === 'granted') {
      enableRecruitmentMeasurement()
      trackHomeSeekersPage(location.pathname)
    }
  }, [available, consent, location.pathname])
  function choose(allowed) {
    if (allowed) enableRecruitmentMeasurement()
    else disableRecruitmentMeasurement()
    setEditing(false)
  }
  if (!available) return null
  return consent === null || editing ? <section className="hs-measurement" aria-label="Optional website measurement">
    <div><strong>Optional website measurement</strong><p>We use Meta to measure visits and application progress. Allow optional advertising and analytics cookies, or continue without them. You can change this choice at any time.</p></div>
    <div className="hs-measurement__actions"><button type="button" onClick={() => choose(false)}>Decline</button><button type="button" onClick={() => choose(true)}>Allow measurement</button></div>
  </section> : <button className="hs-measurement__preferences" type="button" onClick={() => setEditing(true)}>Tracking preferences</button>
}
