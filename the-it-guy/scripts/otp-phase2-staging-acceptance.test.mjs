import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./otp-phase2-staging-acceptance.mjs', import.meta.url), 'utf8')
const finaliserSource = readFileSync(new URL('../../supabase/functions/generate-final-signed-document/index.ts', import.meta.url), 'utf8')
const otpFinaliserSource = readFileSync(new URL('../../supabase/functions/generate-final-signed-otp/index.ts', import.meta.url), 'utf8')

assert.match(source, /STAGING_PROJECT_REF/, 'runner must be pinned to staging')
assert.match(source, /--confirm-staging/, 'runner must require an explicit staging confirmation')
assert.match(source, /OTP_PHASE2_STAGING_WRITE/, 'runner must require a dedicated write flag')
assert.match(source, /externalCommunicationAllowed:\s*false/, 'fixture must prohibit external communication')
assert.match(source, /\['cash', 'bond'\]/, 'runner must cover cash and bond OTP scenarios')
assert.match(source, /regeneratePacket/, 'runner must verify regeneration')
assert.match(source, /resolveExternalSignerSession/, 'runner must verify external signer access')
assert.match(source, /final_signed_file_path/, 'runner must verify final signed artifact persistence')
assert.doesNotMatch(source, /send-email|sendEmail|sendSigning/, 'runner must not send signer communications')
assert.match(finaliserSource, /final_signed_source_fallback_used/, 'finaliser must audit DOCX conversion fallback')
assert.match(finaliserSource, /structured_fallback_pdf/, 'finaliser must preserve signed-document finalisation when DOCX conversion is unavailable')
assert.match(finaliserSource, /buildOtpStructuredFinalPdfBytes/, 'OTP finalisation must use a worker-budget-safe PDF builder')
assert.match(source, /generate-final-signed-otp/, 'OTP recovery must use the isolated OTP finaliser')
assert.match(otpFinaliserSource, /final_signed_otp_generated/, 'isolated OTP finaliser must persist an auditable completion event')

console.log('otp phase2 staging acceptance guard tests passed')
