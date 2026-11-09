// Extracted without changing validation, persistence order or recovery behaviour.
import { validateDevelopmentStructureNodes } from '../../core/developments/developmentStructureModel.js'
import { createDevelopment, saveDevelopmentDetails } from './detailActions.js'
import { hasDevelopmentFinancialInputs, saveDevelopmentFinancials } from './financialActions.js'
import { isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { updateDevelopmentSettings, saveDevelopmentAttorneyConfig, saveDevelopmentBondConfig } from './configurationActions.js'
import { DEFAULT_DEVELOPMENT_SETTINGS } from './configurationApi.js'
import { saveDevelopmentStructureNodes, saveDevelopmentProductCatalogue, saveDevelopmentUnit } from './stockActions.js'
import { uploadDevelopmentDocumentAsset, saveDevelopmentDocument } from './documentActions.js'

export async function createDevelopmentWorkspace({
  details = {},
  financials = {},
  legal = {},
  developmentSettings = {},
  units = [],
  structureNodes = [],
  productCatalogue = null,
  documents = [],
} = {}) {
  const structureErrors = validateDevelopmentStructureNodes(structureNodes)
  if (structureErrors.length) throw new Error(structureErrors[0])
  const structureIds = new Set(structureNodes.map((node) => node.id))
  if (units.some((unit) => unit.structureNodeId && !structureIds.has(unit.structureNodeId))) {
    throw new Error('A unit references a building or floor that is not included in the stock structure.')
  }
  const warnings = []
  const created = await createDevelopment({
    name: details.name,
    plannedUnits: details.totalUnitsExpected ?? details.plannedUnits ?? units.length,
    profile: {
      organisationId: details.organisationId || details.organisation_id || null,
      code: details.code,
      location: details.location,
      suburb: details.suburb,
      city: details.city,
      province: details.province,
      country: details.country,
      address: details.address,
      description: details.description,
      status: details.status,
      developerCompany: details.developerCompany,
      launchDate: details.launchDate,
      expectedCompletionDate: details.expectedCompletionDate,
      handoverEnabled: details.handoverEnabled,
      snagTrackingEnabled: details.snagTrackingEnabled,
      alterationsEnabled: details.alterationsEnabled,
      onboardingEnabled: details.onboardingEnabled,
      plans: details.plans || [],
      sitePlans: details.sitePlans || [],
      imageLinks: details.imageLinks || [],
      supportingDocuments: details.supportingDocuments || [],
      marketingContent: details.marketingContent,
    },
  })

  const developmentId = created.id

  try {
    const detailsResult = await saveDevelopmentDetails(developmentId, details, {
      allowNoopUpdate: true,
      reportWarnings: true,
    })
    warnings.push(...detailsResult.warnings)
    if (hasDevelopmentFinancialInputs(financials)) {
      try {
        await saveDevelopmentFinancials(developmentId, financials)
      } catch (financialsError) {
        if (!isPermissionDeniedError(financialsError)) {
          throw financialsError
        }
        console.warn(
          '[Developments] Financials were not saved because development_financials RLS blocked the write.',
          financialsError,
        )
        warnings.push({
          code: 'development_financials_rls_blocked',
          message: 'Development financials were not saved because the database policy blocked this write.',
        })
      }
    }
    try {
      await updateDevelopmentSettings(developmentId, {
        ...DEFAULT_DEVELOPMENT_SETTINGS,
        ...(developmentSettings || {}),
      })
    } catch {
      warnings.push({ message: 'The development was created, but developer access or transaction defaults could not be fully saved. Check Sales setup in its workspace.' })
    }

    if (
      normalizeTextValue(legal.attorneyFirmName) ||
      normalizeTextValue(legal.primaryContactName) ||
      normalizeTextValue(legal.primaryContactEmail)
    ) {
      await saveDevelopmentAttorneyConfig(developmentId, {
        attorneyFirmName: legal.attorneyFirmName,
        primaryContactName: legal.primaryContactName,
        primaryContactEmail: legal.primaryContactEmail,
        primaryContactPhone: legal.primaryContactPhone,
        defaultFeeAmount: legal.defaultFeeAmount,
        vatIncluded: legal.vatIncluded !== false,
        disbursementsIncluded: Boolean(legal.disbursementsIncluded),
        overrideAllowed: legal.overrideAllowed !== false,
      })
    }

    if (
      normalizeTextValue(legal.bondOriginatorName) ||
      normalizeTextValue(legal.bondPrimaryContactName) ||
      normalizeTextValue(legal.bondPrimaryContactEmail)
    ) {
      await saveDevelopmentBondConfig(developmentId, {
        bondOriginatorName: legal.bondOriginatorName,
        primaryContactName: legal.bondPrimaryContactName,
        primaryContactEmail: legal.bondPrimaryContactEmail,
        primaryContactPhone: legal.bondPrimaryContactPhone,
        commissionModelType: legal.bondCommissionModelType || 'fixed_fee',
        defaultCommissionAmount: legal.defaultCommissionAmount,
        vatIncluded: legal.bondVatIncluded !== false,
        overrideAllowed: legal.bondOverrideAllowed !== false,
      })
    }

    if (structureNodes.length) {
      const savedNodes = await saveDevelopmentStructureNodes({ developmentId, nodes: structureNodes })
      const savedIds = new Set(savedNodes.map((node) => node.id))
      if (structureNodes.some((node) => !savedIds.has(node.id))) {
        throw new Error('The building and floor structure could not be fully saved. Unit creation was stopped.')
      }
    }

    if (productCatalogue) {
      const uploadedFloorplans = []
      for (const floorplan of productCatalogue.floorplans || []) {
        const { file, ...layout } = floorplan
        if (file) {
          const type = productCatalogue.unitTypes.find((item) => item.id === layout.unitTypeId)
          const asset = await uploadDevelopmentDocumentAsset({
            developmentId, file, documentType: 'floorplan', title: layout.name,
            linkedUnitType: type?.name || '',
          })
          warnings.push(...(asset.persistenceWarnings || []).map((message) => ({ message })))
          uploadedFloorplans.push({ ...layout, documentId: asset.id, fileUrl: asset.fileUrl, thumbnailUrl: file.type?.startsWith('image/') ? asset.fileUrl : '' })
        } else {
          uploadedFloorplans.push(layout)
        }
      }
      // Save layouts first so each generated unit retains its internal storeys
      // independently of the building/floor node that contains it.
      await saveDevelopmentProductCatalogue({ ...productCatalogue, floorplans: uploadedFloorplans, developmentId })
    }

    for (const unit of units) {
      if (!normalizeTextValue(unit?.unitNumber)) {
        continue
      }
      await saveDevelopmentUnit({
        ...unit,
        developmentId,
        requireStructureLink: Boolean(unit.structureNodeId),
      })
    }

    for (const document of documents) {
      if (!normalizeTextValue(document?.title)) {
        continue
      }
      try {
        await saveDevelopmentDocument({
          developmentId,
          ...document,
        })
      } catch (documentError) {
        if (!isPermissionDeniedError(documentError)) {
          throw documentError
        }
        console.warn(
          '[Developments] Development document was not saved because development_documents RLS blocked the write.',
          documentError,
        )
        warnings.push({
          code: 'development_documents_rls_blocked',
          message: 'One or more development documents were not saved because the database policy blocked this write.',
        })
      }
    }

    return {
      ...created,
      warnings,
    }
  } catch (error) {
    throw Object.assign(new Error(`The development was created, but some setup could not be saved: ${error.message || 'Please check its workspace.'}`, { cause: error }), { developmentId })
  }
}
