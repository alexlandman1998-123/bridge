import CompanyOnboardingForm from './CompanyOnboardingForm'
import { WORKSPACE_TYPES } from '../../constants/workspaceTypes'
import {
  BOND_SIGNUP_STEPS, BOND_LOGO_VARIANTS, BOND_BUSINESS_TYPES,
  createBondSignupDraft, restoreBondSignupDraft,
  validateBondSignupStep, buildBondSignupForm,
} from './bondQuickStart'

const configuration = {
  steps: BOND_SIGNUP_STEPS,
  logoVariants: BOND_LOGO_VARIANTS,
  businessTypes: BOND_BUSINESS_TYPES,
  createDraft: createBondSignupDraft,
  restoreDraft: restoreBondSignupDraft,
  validateStep: validateBondSignupStep,
  buildSubmission: buildBondSignupForm,
  workspaceType: WORKSPACE_TYPES.bondOriginator,
  className: 'bond-workspace-onboarding',
  title: 'Set up your bond originator workspace',
}

export default function BondOnboardingForm(props) {
  return <CompanyOnboardingForm {...props} configuration={configuration} />
}
