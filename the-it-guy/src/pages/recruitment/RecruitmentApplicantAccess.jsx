import { useEffect, useId, useRef, useState } from 'react'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'

export default function RecruitmentApplicantAccess({ mode, email: initialEmail, submissionKey, endpoint, token, onVerified, onBusy, onMode, delivery, parentBusy, codeOnly = false, emailLocked = false, preview = false, previewContact, setup = false, onDifferentEmail }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const [invalidField, setInvalidField] = useState('')
  const [codeRequested, setCodeRequested] = useState(false)
  const errorId = useId()
  const emailInput = useRef(null), credentialInput = useRef(null)
  const working = useRef(false)
  useEffect(() => {
    if (delivery?.requested || delivery?.resendAfterSeconds) {
      const now = Date.now(); setClock(now); setResendAt((delivery.requestedAt || now) + (delivery.resendAfterSeconds || 60) * 1000)
    }
  }, [delivery?.requested, delivery?.requestedAt, delivery?.resendAfterSeconds])
  useEffect(() => { setPassword(''); setCode(''); setMessage(''); setNotice(''); setInvalidField('') }, [mode])
  useEffect(() => {
    if (!resendAt) return undefined
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [resendAt])
  const wait = Math.max(0, Math.ceil((resendAt - clock) / 1000))
  async function request(action) {
    if (working.current || parentBusy) return
    const invalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'email'
      : action === 'verify_email' && !/^(?:\d{6}|\d{8})$/.test(code) ? 'code'
      : action === 'sign_in' && !password ? 'password' : ''
    if (invalid) {
      setInvalidField(invalid); setAttempted(true)
      setMessage(invalid === 'email' ? 'Enter a valid email address.' : invalid === 'code' ? 'Enter the six- or eight-digit code from your email.' : 'Enter your password.')
      const input = invalid === 'email' ? emailInput : credentialInput
      input.current?.focus()
      return
    }
    working.current = true; setBusy(true); onBusy(true); setMessage(''); setNotice(''); setInvalidField(''); setAttempted(true)
    try {
      if (preview) {
        if (action === 'send_verification') setNotice('Preview. No email was sent. Enter a six- or eight-digit code to explore the next screen.')
        else onVerified({ emailVerification: 'verified', applicationSubmitted: false, contact: { firstName: 'Preview', lastName: 'Applicant', phone: '', ...previewContact, email } })
        return
      }
      const result = await recruitmentSignupRequest(action, { email, password, code, submissionKey: email.trim().toLowerCase() === initialEmail?.trim().toLowerCase() ? submissionKey : undefined }, { endpoint, token })
      if (action === 'send_verification') {
        setCodeRequested(true)
        setCode(''); setNotice('Check your inbox for a verification code. Check your spam folder too.')
        const now = Date.now(); setClock(now); setResendAt(now + (result.resendAfterSeconds || 60) * 1000)
      } else if (result.applicant?.emailVerification === 'verified') {
        setPassword(''); setCode(''); onVerified(result.applicant)
      } else { setMessage('Your application could not be opened. Please try again.') }
    } catch (error) {
      setPassword(''); setMessage(error.message)
      if (error.retryAfterSeconds) { const now = Date.now(); setClock(now); setResendAt(now + error.retryAfterSeconds * 1000) }
      if (error.verificationRequired) onMode('email')
    } finally { working.current = false; setBusy(false); onBusy(false) }
  }
  return <form aria-label={mode === 'signin' ? 'Sign in to applicant account' : 'Verify applicant email'} onSubmit={(event) => { event.preventDefault(); request(mode === 'signin' ? 'sign_in' : setup && !codeRequested ? 'send_verification' : 'verify_email') }} noValidate aria-busy={busy || parentBusy}>
    <h4>{setup ? 'Log in to My Profile' : mode === 'signin' ? 'Continue your application' : 'Verify your email'}</h4>
    <p className="recruitment-signup__intro">{setup ? mode === 'signin' ? 'Log in with your application email address and the password you set when applying.' : 'Enter your application email address and request a login code. Enter the code here to open your agent setup.' : mode === 'signin' ? 'Sign in with your existing account. You can also use an email code to return on another device.' : 'Enter the verification code from your email to open your saved recruitment enquiry.'}</p>
    {codeOnly && setup && codeRequested && <p className="recruitment-signup__note">Stay in this form. Your email contains a code, with no activation link. Codes are single use and expire; use the latest email, or request another code here.</p>}
    <fieldset disabled={busy || parentBusy}>
      <label>Email address <input ref={emailInput} type="email" autoComplete="email" maxLength={254} value={email} readOnly={emailLocked} aria-invalid={invalidField === 'email'} aria-describedby={invalidField === 'email' ? errorId : undefined} onChange={(event) => { setEmail(event.target.value); setCode(''); setCodeRequested(false); setInvalidField(''); setMessage('') }} required /></label>
      {mode === 'signin'
        ? <label>Password <input ref={credentialInput} type="password" autoComplete="current-password" value={password} aria-invalid={invalidField === 'password'} aria-describedby={invalidField === 'password' ? errorId : undefined} onChange={(event) => { setPassword(event.target.value); setInvalidField(''); setMessage('') }} maxLength={72} required /></label>
        : (!setup || codeRequested) && <label>Verification code <input ref={credentialInput} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}|[0-9]{8}" maxLength={8} value={code} aria-invalid={invalidField === 'code'} aria-describedby={invalidField === 'code' ? errorId : undefined} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 8)); setInvalidField(''); setMessage('') }} onPaste={(event) => { event.preventDefault(); setCode(event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8)); setInvalidField(''); setMessage('') }} required /></label>}
      {(message || (!attempted && delivery?.error)) && <p id={errorId} role="alert" className="recruitment-signup__error">{message || delivery?.error}</p>}
      {(notice || (!attempted && delivery?.requested)) && <p role="status">{notice || 'Check your inbox for a verification code. Check your spam folder too.'}</p>}
      <button type="submit" disabled={setup && mode !== 'signin' && !codeRequested && !!wait} className="recruitment-signup__submit">{busy ? 'Please wait…' : mode === 'signin' ? setup ? 'Log in' : 'Sign in & continue' : setup ? codeRequested ? 'Log in' : wait ? `Request a new code in ${wait}s` : 'Send login code' : 'Verify & continue'}</button>
      {(!setup || (mode !== 'signin' && codeRequested)) && <div className={onDifferentEmail ? 'recruitment-signup__email-actions' : undefined}>
        <button type="button" className="recruitment-signup__secondary" disabled={!!wait} onClick={() => request('send_verification')}>{wait ? `Request a new code in ${wait}s` : setup ? 'Send login code' : 'Send a new email code'}</button>
        {onDifferentEmail && <button type="button" className="recruitment-signup__secondary" disabled={busy || parentBusy} onClick={onDifferentEmail}>Use a different email</button>}
      </div>}
      {setup && mode !== 'signin' && !codeRequested && <button type="button" className="recruitment-signup__secondary" onClick={() => setCodeRequested(true)}>I already have a login code</button>}
      {(!codeOnly || setup) && <button type="button" className="recruitment-signup__secondary" onClick={() => onMode(mode === 'signin' ? 'email' : 'signin')}>{mode === 'signin' ? 'Use an email code instead' : 'Sign in with a password'}</button>}
    </fieldset>
  </form>
}
