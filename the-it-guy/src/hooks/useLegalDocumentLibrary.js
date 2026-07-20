import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildLegalDocumentLibraryModel } from '../core/documents/legalDocumentLibraryModel.js'
import {
  fetchConditionalMasterMigration,
  fetchConditionalMasterVerification,
  fetchDocumentPacketTemplate,
  listDocumentPacketTemplates,
} from '../lib/documentPacketsApi.js'

function normalizePacketTypes(packetTypes = []) {
  const rows = (Array.isArray(packetTypes) ? packetTypes : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(rows.length ? rows : ['otp', 'mandate'])]
}

function replaceTemplateDetails(templatesByType = {}, details = []) {
  const detailById = new Map(details.filter((template) => template?.id).map((template) => [template.id, template]))
  return Object.fromEntries(Object.entries(templatesByType).map(([packetType, templates]) => [
    packetType,
    (Array.isArray(templates) ? templates : []).map((template) => detailById.get(template?.id) || template),
  ]))
}

export function useLegalDocumentLibrary({
  packetTypes = ['otp', 'mandate'],
  moduleType = 'agency',
  organisationId = null,
  enabled = true,
} = {}) {
  const packetTypesKey = normalizePacketTypes(packetTypes).join('|')
  const stablePacketTypes = useMemo(() => packetTypesKey.split('|').filter(Boolean), [packetTypesKey])
  const requestIdRef = useRef(0)
  const [state, setState] = useState({
    loading: Boolean(enabled),
    error: '',
    templatesByType: {},
    migrationsByType: {},
    verificationsByType: {},
  })

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ loading: false, error: '', templatesByType: {}, migrationsByType: {}, verificationsByType: {} })
      return null
    }
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    try {
      const [templateRows, migrationRows, verificationRows] = await Promise.all([
        Promise.all(stablePacketTypes.map(async (packetType) => [
          packetType,
          await listDocumentPacketTemplates({
            packetType,
            moduleType,
            organisationId,
            includeInactive: true,
          }),
        ])),
        Promise.all(stablePacketTypes.map(async (packetType) => [
          packetType,
          organisationId ? await fetchConditionalMasterMigration({ packetType, organisationId }).catch(() => null) : null,
        ])),
        Promise.all(stablePacketTypes.map(async (packetType) => [
          packetType,
          organisationId ? await fetchConditionalMasterVerification({ packetType, organisationId }).catch(() => null) : null,
        ])),
      ])
      const templatesByType = Object.fromEntries(templateRows.map(([packetType, templates]) => [packetType, templates || []]))
      const migrationsByType = Object.fromEntries(migrationRows)
      const verificationsByType = Object.fromEntries(verificationRows)
      const initialModel = buildLegalDocumentLibraryModel({ templatesByType, migrationsByType, verificationsByType, packetTypes: stablePacketTypes })
      const primaryIds = [...new Set(initialModel.documents.map((document) => document.primaryTemplateId).filter(Boolean))]
      const details = await Promise.all(primaryIds.map((templateId) => (
        fetchDocumentPacketTemplate(templateId, { includeSections: true }).catch(() => null)
      )))
      const hydratedTemplatesByType = replaceTemplateDetails(templatesByType, details)
      if (requestId !== requestIdRef.current) return null
      setState({ loading: false, error: '', templatesByType: hydratedTemplatesByType, migrationsByType, verificationsByType })
      return buildLegalDocumentLibraryModel({ templatesByType: hydratedTemplatesByType, migrationsByType, verificationsByType, packetTypes: stablePacketTypes })
    } catch (error) {
      if (requestId !== requestIdRef.current) return null
      setState((previous) => ({
        ...previous,
        loading: false,
        error: error?.message || 'Unable to load legal documents.',
      }))
      return null
    }
  }, [enabled, moduleType, organisationId, stablePacketTypes])

  useEffect(() => {
    void refresh()
    return () => {
      requestIdRef.current += 1
    }
  }, [refresh])

  const model = useMemo(() => buildLegalDocumentLibraryModel({
    templatesByType: state.templatesByType,
    migrationsByType: state.migrationsByType,
    verificationsByType: state.verificationsByType,
    packetTypes: stablePacketTypes,
  }), [stablePacketTypes, state.migrationsByType, state.templatesByType, state.verificationsByType])

  return {
    ...model,
    loading: state.loading,
    error: state.error,
    templatesByType: state.templatesByType,
    migrationsByType: state.migrationsByType,
    verificationsByType: state.verificationsByType,
    refresh,
  }
}
