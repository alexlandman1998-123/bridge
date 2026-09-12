'use client'

import { useState } from 'react'

export function PropertyActions() {
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')

  async function share() {
    const data = { title: document.title, url: window.location.href }
    try {
      if (navigator.share) await navigator.share(data)
      else await navigator.clipboard.writeText(data.url)
      setMessage('Link copied')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setMessage('Unable to share')
    }
    window.setTimeout(() => setMessage(''), 2200)
  }

  return <div className="listing-actions" aria-label="Listing actions">
    <button type="button" onClick={share} aria-label="Share listing"><ShareIcon /><span>Share</span></button>
    <button type="button" onClick={() => setSaved((value) => !value)} aria-pressed={saved} aria-label={saved ? 'Remove saved listing' : 'Save listing'}><HeartIcon filled={saved} /><span>{saved ? 'Saved' : 'Save'}</span></button>
    <span className="listing-action-message" aria-live="polite">{message}</span>
  </div>
}

function ShareIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.5-4.5M8.2 13.2l7.5 4.5" /></svg> }
function HeartIcon({ filled }: { filled: boolean }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}><path d="M20.8 8.8c0 5.6-8.8 10.2-8.8 10.2S3.2 14.4 3.2 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.8 2.8Z" /></svg> }
