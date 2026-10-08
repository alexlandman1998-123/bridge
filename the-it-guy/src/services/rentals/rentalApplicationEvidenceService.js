import { supabase } from '../../lib/supabaseClient.js'
import { uploadRentalApplicationFile } from './rentalApplicationFileUpload.js'
export async function uploadRentalApplicationEvidence(application, file, slot) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error('Sign in to upload application evidence.')
  const result = await uploadRentalApplicationFile(file, slot, application.version, async (body) => {
    const response = await fetch('/api/rentals/application-documents', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ ...body, applicationId: application.id }) })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Unable to upload application evidence.')
    return payload
  }, { monitorSurface: 'rentalAgent' })
  return { ...result, application: { ...application, ...result.application } }
}
