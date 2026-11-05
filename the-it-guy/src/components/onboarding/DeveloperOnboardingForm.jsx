import CompanyOnboardingForm from './CompanyOnboardingForm'
import { WORKSPACE_TYPES } from '../../constants/workspaceTypes'
import {
  DEVELOPER_SIGNUP_STEPS, DEVELOPER_LOGO_VARIANTS,
  createDeveloperSignupDraft, restoreDeveloperSignupDraft,
  validateDeveloperSignupStep, buildDeveloperSignupForm,
} from './developerQuickStart'

const configuration = {
  steps: DEVELOPER_SIGNUP_STEPS,
  logoVariants: DEVELOPER_LOGO_VARIANTS,
  createDraft: createDeveloperSignupDraft,
  restoreDraft: restoreDeveloperSignupDraft,
  validateStep: validateDeveloperSignupStep,
  buildSubmission: buildDeveloperSignupForm,
  workspaceType: WORKSPACE_TYPES.developerCompany,
  className: 'developer-workspace-onboarding',
  title: 'Set up your company workspace',
}

export default function DeveloperOnboardingForm(props) {
  return <CompanyOnboardingForm {...props} configuration={configuration} />
}
