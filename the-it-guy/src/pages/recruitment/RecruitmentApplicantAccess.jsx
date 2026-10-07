import { useEffect, useRef, useState } from 'react'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'

export default function RecruitmentApplicantAccess({ mode, email: initialEmail, submissionKey, endpoint, token, onVerified, onBusy, onMode, delivery, parentBusy, preview = false, previewContact }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const working = useRef(false)
  useEffect(() => {
    if (delivery?.requested) { const now = Date.now(); setClock(now); setResendAt(now + 60000) }
  }, [delivery?.requested])
  useEffect(() => { setPassword(''); setCode(''); setMessage(''); setNotice('') }, [mode])
  useEffect(() => {
    if (!resendAt) return undefined
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [resendAt])
  const wait = Math.max(0, Math.ceil((resendAt - clock) / 1000))
  async function request(action) {
    if (working.current || parentBusy) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || (action === 'verify_email' && !/^(?:\d{6}|\d{8})$/.test(code)) || (action === 'sign_in' && !password)) {
      setMessage('Enter a valid email and the required password or verification code.'); return
    }
    working.current = true; setBusy(true); onBusy(true); setMessage(''); setNotice(''); setAttempted(true)
    try {
      if (preview) {
        if (action === 'send_verification') setNotice('Preview — no email was sent. Enter a six- or eight-digit code to explore the next screen.')
        else onVerified({ emailVerification: 'verified', applicationSubmitted: false, contact: { firstName: 'Preview', lastName: 'Applicant', phone: '', ...previewContact, email } })
        return
      }
      const result = await recruitmentSignupRequest(action, { email, password, code, submissionKey: email.trim().toLowerCase() === initialEmail?.trim().toLowerCase() ? submissionKey : undefined }, { endpoint, token })
      if (action === 'send_verification') {
        setNotice('Check your inbox for a verification code. Check your spam folder too.')
        const now = Date.now(); setClock(now); setResendAt(now + 60000)
      } else if (result.applicant?.emailVerification === 'verified') {
        setPassword(''); setCode(''); onVerified(result.applicant)
      } else { setMessage('Your application could not be opened. Please try again.') }
    } catch (error) {
      setPassword(''); setMessage(error.message)
      if (error.verificationRequired) onMode('email')
    } finally { working.current = false; setBusy(false); onBusy(false) }
  }
  return <form aria-label={mode === 'signin' ? 'Sign in to applicant account' : 'Verify applicant email'} onSubmit={(event) => { event.preventDefault(); request(mode === 'signin' ? 'sign_in' : 'verify_email') }} noValidate aria-busy={busy || parentBusy}>
    <h4>{mode === 'signin' ? 'Continue your application' : 'Verify your email'}</h4>
    <p className="recruitment-signup__intro">{mode === 'signin' ? 'Sign in with your existing account. You can also use an email code to return on another device.' : 'Enter the verification code from your email to open your saved recruitment enquiry.'}</p>
    <fieldset disabled={busy || parentBusy}>
      <label>Email address <input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setCode('') }} required /></label>
      {mode === 'signin'
        ? <label>Password <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={72} required /></label>
        : <label>Verification code <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}|[0-9]{8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required /></label>}
      {(message || (!attempted && delivery?.error)) && <p role="alert" className="recruitment-signup__error">{message || delivery?.error}</p>}
      {(notice || (!attempted && delivery?.requested)) && <p role="status">{notice || 'Check your inbox for a verification code. Check your spam folder too.'}</p>}
      <button type="submit" className="recruitment-signup__submit">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in & continue' : 'Verify & continue'}</button>
      <button type="button" className="recruitment-signup__secondary" disabled={!!wait} onClick={() => request('send_verification')}>{wait ? `Request a new code in ${wait}s` : 'Send a new email code'}</button>
      <button type="button" className="recruitment-signup__secondary" onClick={() => onMode(mode === 'signin' ? 'email' : 'signin')}>{mode === 'signin' ? 'Use an email code instead' : 'Sign in with a password'}</button>
    </fieldset>
  </form>
}
