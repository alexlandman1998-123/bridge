import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { checkRecruitmentApplicantGate } from './recruitmentApplicantGateCheck'

export default function useRecruitmentApplicantGate(session) {
  const id = session?.user?.id || null
  const [state, setState] = useState({ id: null, required: false, error: false })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!id) return undefined
    let active = true
    function check() {
      checkRecruitmentApplicantGate(supabase, id, { development: import.meta.env.DEV, listingPreview: import.meta.env.VITE_LOCAL_LISTING_PREVIEW === 'true' }).then(result => {
        if (active) setState({ id, ...result })
      }).catch(() => { if (active) setState({ id, required: false, error: true }) })
    }
    check(); window.addEventListener('focus', check)
    return () => { active = false; window.removeEventListener('focus', check) }
  }, [id, revision])
  return { checking: !!id && state.id !== id, required: !!id && state.id === id && state.required, error: !!id && state.id === id && state.error,
    retry: () => { setState({ id: null, required: false, error: false }); setRevision(value => value + 1) } }
}
