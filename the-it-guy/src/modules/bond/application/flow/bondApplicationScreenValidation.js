import { BOND_APPLICATION_FLOW_CONTRACT } from './bondApplicationFlowContract.js'
import { resolveBondApplicationFlow } from './resolveBondApplicationFlow.js'
import {
  getBondApplicationPathValue,
  isBondApplicationValuePresent,
} from './bondApplicationRuleEvaluator.js'

function issue(path, code, message, questionKey = null) {
  return { path, code, message, questionKey }
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

function validateScalarQuestion(question, state) {
  const value = getBondApplicationPathValue(state, question.path)
  const issues = []
  if (question.required && !isBondApplicationValuePresent(value)) {
    issues.push(issue(question.path, 'required', `Enter ${String(question.label || 'this information').toLowerCase()}.`, question.key))
    return issues
  }
  if (!isBondApplicationValuePresent(value)) return issues

  if (question.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
    issues.push(issue(question.path, 'email', 'Enter a valid email address.', question.key))
  }
  if (['currency', 'decimal', 'integer', 'percentage'].includes(question.type)) {
    const number = parseNumber(value)
    if (number === null) {
      issues.push(issue(question.path, 'number', `Enter a valid ${question.type === 'currency' ? 'amount' : 'number'}.`, question.key))
    }
    if (number !== null && question.validation?.min !== undefined && number < question.validation.min) {
      issues.push(issue(question.path, 'min', `${question.label} cannot be less than ${question.validation.min}.`, question.key))
    }
    if (number !== null && question.validation?.max !== undefined && number > question.validation.max) {
      issues.push(issue(question.path, 'max', `${question.label} cannot be more than ${question.validation.max}.`, question.key))
    }
  }
  if (question.type === 'date' && Number.isNaN(Date.parse(String(value)))) {
    issues.push(issue(question.path, 'date', 'Enter a valid date.', question.key))
  }
  if (question.validation?.afterOrEqualPath) {
    const start = getBondApplicationPathValue(state, question.validation.afterOrEqualPath)
    if (isBondApplicationValuePresent(start) && Date.parse(String(value)) < Date.parse(String(start))) {
      issues.push(issue(question.path, 'date_order', `${question.label} cannot be before the start date.`, question.key))
    }
  }
  return issues
}

function validateRepeatableQuestion(question, state, contract) {
  const records = getBondApplicationPathValue(state, question.path)
  const issues = []
  if (question.required && (!Array.isArray(records) || records.length === 0)) {
    issues.push(issue(question.path, 'required', `Add at least one ${String(question.label || 'record').toLowerCase()}.`, question.key))
    return issues
  }
  if (!Array.isArray(records)) return issues
  const group = contract.repeatableGroups[question.groupKey]
  const requiredFields = (group?.itemFields || []).filter((field) => field.requiredWhen === true)
  records.forEach((record, index) => {
    requiredFields.forEach((field) => {
      const value = getBondApplicationPathValue(record, field.path)
      if (!isBondApplicationValuePresent(value)) {
        issues.push(issue(`${question.path}.${index}.${field.path}`, 'required', `Enter ${String(field.label || 'this information').toLowerCase()}.`, question.key))
      }
    })
  })
  return issues
}

export function validateBondApplicationScreen({
  contract = BOND_APPLICATION_FLOW_CONTRACT,
  applicationState = {},
  screenKey = '',
} = {}) {
  const flow = resolveBondApplicationFlow({ contract, applicationState, currentScreenKey: screenKey })
  const screen = flow.currentScreen
  const issues = screen.questions.flatMap((question) => (
    question.type === 'repeatable_group'
      ? validateRepeatableQuestion(question, applicationState, contract)
      : validateScalarQuestion(question, applicationState)
  ))
  return {
    valid: issues.length === 0,
    issues,
    screenKey: screen.key,
  }
}

export function validateBondApplicationSteps({
  contract = BOND_APPLICATION_FLOW_CONTRACT,
  applicationState = {},
  throughStepOrder = 6,
} = {}) {
  const flow = resolveBondApplicationFlow({ contract, applicationState })
  const issues = flow.screens
    .filter((screen) => {
      const step = contract.steps.find((item) => item.key === screen.stepKey)
      return step && step.order <= throughStepOrder && !screen.transitionOnly
    })
    .flatMap((screen) => validateBondApplicationScreen({ contract, applicationState, screenKey: screen.key }).issues)
  return {
    valid: issues.length === 0,
    issues,
  }
}
