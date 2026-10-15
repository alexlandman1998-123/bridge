import { updateLandlordPeople, LANDLORD_SIGNATORY_PERSON_FIELDS } from '../services/rentals/rentalLandlordSignatories.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { landlordWorkspace, normalizeLandlordProfile } from '../services/rentals/rentalLandlordWorkspaceModel'
import { rentalLandlordDiscovery } from '../services/rentals/rentalLandlordOnboardingModel.js'
import { requestRentalLandlordOnboarding } from '../services/rentals/rentalLandlordOnboardingService.js'
import { saveRentalLandlordProfile } from '../services/rentals/rentalLandlordWorkspaceService'
import { emitAgencyCrmUpdated } from '../lib/agencyCrmUpdateBus'
import { landlordProfileDraftKey, mergeLandlordProfileDraft, profileSignature, readLandlordProfileDraft, removeLandlordProfileDraft, writeLandlordProfileDraft } from '../services/rentals/rentalLandlordProfileDraft.js'

const discoveryFor = lead => rentalLandlordDiscovery(lead.raw?.rawEnquiryPayload || lead.raw?.raw_enquiry_payload || {})
const comparable = profile => {
  try { return profileSignature(normalizeLandlordProfile(profile)) } catch { return profileSignature(profile) }
}
export default function useRentalLandlordProfileAutosave({ lead, context, onReload, delay = 800 }) {
  const key = landlordProfileDraftKey(context, lead.id)
  const [state, setState] = useState(() => {
    const discovery = discoveryFor(lead), saved = landlordWorkspace(lead).profile
    const recovery = readLandlordProfileDraft(key)
    const merged = recovery ? mergeLandlordProfileDraft(landlordWorkspace({ ...lead, raw: { rawEnquiryPayload: { landlordProfile: recovery.discovery.profile } } }).profile, recovery.profile, saved) : { profile: saved, conflicts: {} }
    return { ...merged, discovery, saved, saving: false, status: recovery ? 'pending' : 'saved', error: '', notice: recovery ? 'Recovered your unsaved profile draft.' : '' }
  })
  const editor = useRef(state), pending = useRef(null), alive = useRef(true), timer = useRef(null)
  const current = useRef({ lead, context, onReload, key })
  current.current = { lead, context, onReload, key }
  const publish = useCallback(patch => {
    editor.current = { ...editor.current, ...patch }
    if (alive.current) setState(editor.current)
  }, [])
  const dirty = comparable(state.profile) !== comparable(state.saved)
  const cache = useCallback(() => {
    const value = editor.current
    if (comparable(value.profile) !== comparable(value.saved)) {
      if (!writeLandlordProfileDraft(current.current.key, value.profile, value.discovery)) publish({ notice: 'Draft recovery is unavailable in this tab. Keep it open until the save completes.' })
    }
    else removeLandlordProfileDraft(current.current.key)
  }, [publish])
  const acceptRemote = useCallback((discovery, saved) => {
    const value = editor.current
    if (profileSignature(discovery) === profileSignature(value.discovery)) return
    const merged = mergeLandlordProfileDraft(value.saved, value.profile, saved)
    publish({ ...merged, saved, discovery, status: Object.keys(merged.conflicts).length ? 'conflict' : comparable(merged.profile) === comparable(saved) ? 'saved' : 'pending', error: '', notice: '' })
    cache()
  }, [cache, publish])
  useEffect(() => { acceptRemote(discoveryFor(lead), landlordWorkspace(lead).profile) }, [lead, acceptRemote])

  const saveNow = useCallback(async () => {
    clearTimeout(timer.current)
    if (pending.current) return pending.current
    const operation = current.current
    const work = async () => {
      while (alive.current && current.current.key === operation.key) {
        const value = editor.current
        if (Object.keys(value.conflicts).length) return false
        if (comparable(value.profile) === comparable(value.saved)) { publish({ status: 'saved', error: '' }); cache(); return true }
        if (globalThis.navigator?.onLine === false) { publish({ status: 'offline', error: '' }); cache(); return false }
        let captured
        try { captured = normalizeLandlordProfile(value.profile) } catch (cause) { publish({ status: 'incomplete', error: cause.message }); cache(); return false }
        const sentDraft = value.profile, sentDiscovery = value.discovery
        publish({ status: 'saving', saving: true, error: '', notice: '' })
        try {
          const result = await saveRentalLandlordProfile(operation.lead.id, captured, { ...current.current.context, expectedDiscovery: sentDiscovery })
          if (!alive.current || current.current.key !== operation.key) {
            removeLandlordProfileDraft(operation.key, sentDraft)
            return true
          }
          const onboarding = result?.onboarding
          if (!onboarding?.data?.profile || comparable(onboarding.data.profile) !== comparable(captured)) throw new Error('The saved profile could not be verified. Your draft is retained; retry to check it.')
          const saved = landlordWorkspace({ ...operation.lead, raw: {rawEnquiryPayload: {landlordProfile:onboarding.data.profile}} }).profile
          // Keep typing after the request started, including edits to the same field.
          const latest = editor.current.profile
          publish({ saved, discovery: onboarding.data, profile: latest === sentDraft ? saved : latest, status: 'pending', error: '' })
          cache()
          emitAgencyCrmUpdated({ organisationId: operation.context.organisationId })
          try { await current.current.onReload?.() } catch { publish({ notice: 'Profile saved. The workspace refresh needs a retry.' }) }
        } catch (cause) {
          if (!alive.current || current.current.key !== operation.key) return false
          if (/changed|conflict|could not be verified|readback|confirmed/i.test(cause.message || '')) {
            try {
              const result = await requestRentalLandlordOnboarding(operation.lead.id)
              if (!alive.current || current.current.key !== operation.key) return false
              if (result.onboarding?.data) {
                const remote = result.onboarding.data
                const saved = landlordWorkspace({ ...operation.lead, raw: {rawEnquiryPayload: {landlordProfile:remote.profile}} }).profile
                acceptRemote(remote, saved)
                // A lost acknowledgement of this exact write is already committed.
                if (comparable(saved) === comparable(captured) && result.onboarding.consistency?.synced) continue
                if (profileSignature(remote) !== profileSignature(sentDiscovery) && !Object.keys(editor.current.conflicts).length && /changed|conflict/i.test(cause.message || '')) continue
              }
            } catch { /* retain the original error and draft */ }
          }
          publish({ status: Object.keys(editor.current.conflicts).length ? 'conflict' : 'error', error: cause.message || 'Unable to save. Your draft is retained.' })
          cache()
          return false
        }
      }
      return false
    }
    pending.current = work().finally(() => {
      pending.current = null
      if (alive.current && current.current.key === operation.key) publish({ saving: false })
    })
    return pending.current
  }, [acceptRemote, cache, publish])
  const updateProfile = useCallback((field, value) => {
    const patch = typeof field === 'string' ? { [field]: value } : field
    const profile = { ...editor.current.profile, ...patch }, conflicts = { ...editor.current.conflicts }
    for (const [key, answer] of Object.entries(patch)) if (profileSignature(answer) === profileSignature(editor.current.saved[key])) delete conflicts[key]
    publish({ profile, conflicts, status: Object.keys(conflicts).length ? 'conflict' : comparable(profile) === comparable(editor.current.saved) ? 'saved' : 'pending', error: '', notice: '' })
    cache()
  }, [cache, publish])
  const resetProfile = useCallback(() => {
    if (pending.current) return
    publish({ profile: editor.current.saved, conflicts: {}, status: 'saved', error: '', notice: '' })
    removeLandlordProfileDraft(current.current.key)
  }, [publish])
  const resolveConflict = useCallback((field, useSaved) => {
    const value = editor.current, conflicts = { ...value.conflicts }
    delete conflicts[field]
    let profile = useSaved ? { ...value.profile, [field]: value.saved[field] } : value.profile
    // Signing identity/contact values follow the person chosen in this review.
    // Keep independent authority-reference conflicts for a separate decision.
    if (profile.primarySignatoryId && (field === 'people' || field === 'primarySignatoryId' && !conflicts.people)) {
      profile = updateLandlordPeople(profile, profile.people || [])
      for (const key of [...Object.keys(LANDLORD_SIGNATORY_PERSON_FIELDS), 'authorisedSignatoryCapacity']) delete conflicts[key]
      if (!profile.primarySignatoryId) delete conflicts.primarySignatoryId
    }
    publish({ profile, conflicts, status: Object.keys(conflicts).length ? 'conflict' : comparable(profile) === comparable(value.saved) ? 'saved' : 'pending', error: '' })
    cache()
  }, [cache, publish])
  useEffect(() => {
    if (!dirty || !['pending', 'saving'].includes(state.status) || Object.keys(state.conflicts).length) return
    timer.current = setTimeout(() => { void saveNow() }, delay)
    return () => clearTimeout(timer.current)
  }, [dirty, state.profile, state.status, state.conflicts, delay, saveNow])
  useEffect(() => {
    alive.current = true
    const beforeUnload = event => { if (comparable(editor.current.profile) !== comparable(editor.current.saved) || pending.current) { event.preventDefault(); event.returnValue = '' } }
    const online = () => { if (editor.current.status === 'offline' || editor.current.status === 'error') void saveNow() }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('online', online)
    return () => { alive.current = false; clearTimeout(timer.current); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('online', online) }
  }, [saveNow])
  return { ...state, dirty, updateProfile, resetProfile, saveNow, resolveConflict }
}
