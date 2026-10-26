import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { clearPendingSignupVerification, readPendingSignupVerification, rememberSignupVerification } from '../../lib/signupVerification'

const RESEND_DELAY_MS = 60_000

export default function SignupEmailVerification({ email, client, withTimeout, redirectTo, onVerified, onBack }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resendAt, setResendAt] = useState(() => (readPendingSignupVerification()?.requestedAt || Date.now()) + RESEND_DELAY_MS)
  const [now, setNow] = useState(Date.now())
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000))

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function verify(event) {
    event.preventDefault()
    if (busy || resending || !/^\d{6}$/.test(code)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: verifyError } = await withTimeout(
        client.auth.verifyOtp({ email, token: code, type: 'email' }),
        { label: 'Email verification' },
      )
      if (verifyError) throw verifyError
      if (!data?.session) throw new Error('No verified session returned.')
      const nextPath = readPendingSignupVerification()?.nextPath
      clearPendingSignupVerification()
      onVerified(nextPath)
    } catch (verificationError) {
      setError(verificationError?.status === 429
        ? 'Too many attempts. Please wait a few minutes before trying again.'
        : verificationError?.code === 'otp_expired' || verificationError?.status === 403
          ? 'That code is incorrect or has expired. Check your latest email or request a new code.'
          : 'We couldn’t verify your email. Please try again or request a new code.')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (resending || busy || secondsLeft > 0) return
    setResending(true)
    setError('')
    setNotice('')
    try {
      const { error: resendError } = await withTimeout(
        client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } }),
        { label: 'Verification resend request' },
      )
      if (resendError) throw resendError
      const pending = rememberSignupVerification(email, readPendingSignupVerification()?.nextPath)
      setResendAt(pending.requestedAt + RESEND_DELAY_MS)
      setNow(Date.now())
      setCode('')
      setNotice('A new code is on its way. Use the code in your latest email.')
    } catch (resendError) {
      setError(resendError?.status === 429
        ? 'Please wait a minute before requesting another code.'
        : 'We couldn’t send another code. Please try again shortly.')
    } finally {
      setResending(false)
    }
  }

  return (
    <section className="auth-card auth-card-login auth-code-card">
      <div className="auth-card-head compact">
        <h2>Check your inbox.</h2>
        <p>Enter the six-digit code we sent to <strong className="auth-code-email">{email}</strong></p>
      </div>
      <form className="auth-form" onSubmit={verify}>
        <input
          id="signup-verification-code"
          aria-label="Verification code"
          className="auth-code-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          aria-describedby="signup-code-feedback"
          aria-invalid={Boolean(error)}
          disabled={busy || resending}
          autoFocus
          required
        />
        <div id="signup-code-feedback" aria-live="polite">
          {error && <p className="auth-feedback error" role="alert">{error}</p>}
          {notice && <p className="auth-feedback success">{notice}</p>}
        </div>
        <button className="auth-submit" type="submit" disabled={code.length !== 6 || busy || resending}>
          {busy ? 'Verifying…' : 'Verify email & continue'}{!busy && <ArrowRight size={16} />}
        </button>
      </form>
      <div className="auth-footer auth-code-resend">
        <span>No email? Check your spam folder.</span>
        <button type="button" onClick={() => void resend()} disabled={secondsLeft > 0 || resending || busy}>
          {resending ? 'Sending…' : secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Resend code'}
        </button>
      </div>
      <p className="auth-code-security"><ShieldCheck size={15} aria-hidden="true" /> Your code is private. Never share it with anyone.</p>
      <button type="button" className="auth-code-back" onClick={onBack} disabled={busy || resending}><ArrowLeft size={14} /> Back to sign in</button>
    </section>
  )
}
