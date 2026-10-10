import { useEffect, useState } from 'react'

export default function useRecruitmentApplicantGate(session) {
  const id = session?.user?.id || null
  const [state, setState] = useState({ id: null, required: false, error: false })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!id) return undefined
    let active = true
    function check() {
      import('./recruitmentApplicantGateCheck').then(({ checkCurrentRecruitmentApplicantGate }) => checkCurrentRecruitmentApplicantGate(id)).then(result => {
        if (active) setState({ id, ...result })
      }).catch(() => { if (active) setState({ id, required: false, error: true }) })
    }
    check(); window.addEventListener('focus', check)
    return () => { active = false; window.removeEventListener('focus', check) }
  }, [id, revision])
  return { checking: !!id && state.id !== id, required: !!id && state.id === id && state.required, error: !!id && state.id === id && state.error,
    retry: () => { setState({ id: null, required: false, error: false }); setRevision(value => value + 1) } }
}
