import { Fragment } from 'react'
import {
  PROPERTY_DISCLOSURE_ANSWER, PROPERTY_DISCLOSURE_QUESTIONS,
  normalizePropertyDisclosure, shouldPromptPropertyDisclosureComment,
} from '../../lib/propertyDisclosure.js'

const DETAIL_INPUT_CLASS =
  'w-full min-w-0 min-h-[52px] rounded-[16px] border border-[#d7e2ed] bg-white px-4 py-3 text-base font-medium text-[#142334] shadow-[0_8px_18px_rgba(15,23,42,0.035)] outline-none transition duration-150 ease-out placeholder:text-[#93a4b8] focus:border-[var(--seller-brand-action-border)] focus:ring-2 focus:ring-[var(--seller-brand-action-soft)] sm:rounded-[18px]'

function disclosureAnswerClass(isActive) {
  return `inline-flex min-h-[44px] items-center justify-center rounded-[14px] border px-3 text-sm font-semibold transition ${
    isActive
      ? 'border-[var(--seller-brand-action)] bg-[var(--seller-brand-action-softer)] text-[var(--seller-brand-action)] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
      : 'border-[#d8e2ec] bg-white text-[#4f6378]'
  }`
}

function DefaultPane({ children, className = '' }) {
  return <div className={className}>{children}</div>
}

export default function PropertyDisclosureQuestionnaire({
  disclosure = {}, onAnswerChange, onNoteChange, onDisclosureChange,
  PaneComponent = DefaultPane, disabled = false,
}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  const answerOptions = [
    { key: PROPERTY_DISCLOSURE_ANSWER.yes, label: 'Yes' },
    { key: PROPERTY_DISCLOSURE_ANSWER.no, label: 'No' },
    { key: PROPERTY_DISCLOSURE_ANSWER.unsure, label: 'Unsure' },
  ]
  const disclosureQuestionGroups = []
  for (let index = 0; index < PROPERTY_DISCLOSURE_QUESTIONS.length; index += 4) {
    disclosureQuestionGroups.push(PROPERTY_DISCLOSURE_QUESTIONS.slice(index, index + 4))
  }
  const commentsPaneIndex = disclosureQuestionGroups.length + 1
  return <fieldset disabled={disabled} className="min-w-0 space-y-3">
  <div className="space-y-3 sm:hidden">
    {disclosureQuestionGroups.map((questions, groupIndex) => {
      const firstQuestion = questions[0]
      const lastQuestion = questions[questions.length - 1]
      const answeredInGroup = questions.filter((question) => normalized.responses?.[question.key]?.answer).length
      return (
        <PaneComponent key={`${firstQuestion?.key || groupIndex}-group`} paneIndex={groupIndex + 1} className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dbe6f2] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#4f6378]">
            <span>Questions {firstQuestion?.number}-{lastQuestion?.number}</span>
            <span>{answeredInGroup} / {questions.length} answered</span>
          </div>
          {questions.map((question) => {
            const response = normalized.responses?.[question.key] || {}
            const showIssueComment = shouldPromptPropertyDisclosureComment(question, response.answer) || Boolean(response.note)
            return (
              <article key={question.key} className="rounded-[18px] border border-[#dfe8f2] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--seller-brand-action-soft)] text-sm font-semibold text-[var(--seller-brand-action)]">
                    {question.number}
                  </span>
                  <p className="min-w-0 text-sm font-semibold leading-6 text-[#172334]">{question.text}</p>
                </div>
                {question.extraLabel ? (
                  <label className="mt-3 grid gap-1.5 text-xs font-semibold text-[#4f6378]">
                    {question.extraLabel}
                    <input
                      className="min-h-11 rounded-[12px] border border-[#d7e2ed] bg-white px-3 text-sm text-[#142334] outline-none focus:border-[#35546c]/40 focus:ring-2 focus:ring-[#35546c]/10"
                      value={normalized.remoteControlsQuantity}
                      onChange={(event) => onDisclosureChange('remoteControlsQuantity', event.target.value)}
                      placeholder="e.g. 2 gate remotes, 1 garage remote"
                    />
                  </label>
                ) : null}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {answerOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-label={`Question ${question.number}: ${option.label}`}
                      aria-pressed={response.answer === option.key}
                      onClick={() => onAnswerChange(question.key, option.key)}
                      className={disclosureAnswerClass(response.answer === option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {showIssueComment ? (
                  <label className="mt-3 grid gap-1.5 text-xs font-semibold text-[#7c3f13]">
                    Describe the issue or uncertainty
                    <textarea
                      className={`${DETAIL_INPUT_CLASS} min-h-[96px] resize-y border-[#edc68c] bg-[#fffaf2]`}
                      value={response.note || ''}
                      onChange={(event) => onNoteChange(question.key, event.target.value)}
                      placeholder="What is broken, not working, damaged, missing, or uncertain?"
                    />
                  </label>
                ) : null}
              </article>
            )
          })}
        </PaneComponent>
      )
    })}
  </div>
  <div className="hidden overflow-hidden rounded-[18px] border border-[#1f2937] bg-white sm:block">
    <table className="w-full table-fixed border-collapse text-left text-sm text-[#172334]">
      <thead>
        <tr className="bg-[#d9dde2]">
          <th className="border-b border-r border-[#1f2937] px-3 py-2 font-semibold">Question</th>
          {answerOptions.map((option) => (
            <th
              key={option.key}
              className={`${option.key === PROPERTY_DISCLOSURE_ANSWER.unsure ? 'w-[88px]' : 'w-[72px]'} whitespace-nowrap border-b border-r border-[#1f2937] px-1 py-2 text-center text-xs font-semibold last:border-r-0`}
            >
              {option.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {PROPERTY_DISCLOSURE_QUESTIONS.map((question) => {
          const response = normalized.responses?.[question.key] || {}
          const showIssueComment = shouldPromptPropertyDisclosureComment(question, response.answer) || Boolean(response.note)
          return (
            <Fragment key={question.key}>
              <tr>
                <td className="border-r border-t border-[#1f2937] px-3 py-2 align-top leading-6">
                  <span className="font-semibold">{question.number}.</span> {question.text}
                  {question.extraLabel ? (
                    <label className="mt-2 grid max-w-[320px] gap-1 text-xs font-semibold text-[#4f6378]">
                      {question.extraLabel}
                      <input
                        className="min-h-10 rounded-[10px] border border-[#d7e2ed] bg-white px-3 text-sm text-[#142334] outline-none focus:border-[#35546c]/40 focus:ring-2 focus:ring-[#35546c]/10"
                        value={normalized.remoteControlsQuantity}
                        onChange={(event) => onDisclosureChange('remoteControlsQuantity', event.target.value)}
                        placeholder="e.g. 2 gate remotes, 1 garage remote"
                      />
                    </label>
                  ) : null}
                </td>
                {answerOptions.map((option) => (
                  <td key={option.key} className="border-r border-t border-[#1f2937] px-2 py-2 text-center align-middle last:border-r-0">
                    <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#cbd7e4] bg-white">
                      <input
                        type="radio"
                        aria-label={`Question ${question.number}: ${option.label}`}
                        className="h-4 w-4 accent-[#172334]"
                        name={`disclosure-${question.key}`}
                        checked={response.answer === option.key}
                        onChange={() => onAnswerChange(question.key, option.key)}
                      />
                      <span className="sr-only">{option.label}</span>
                    </label>
                  </td>
                ))}
              </tr>
              {showIssueComment ? (
                <tr>
                  <td colSpan={4} className="border-t border-[#1f2937] bg-[#fffaf2] px-3 py-3">
                    <label className="grid gap-1.5 text-xs font-semibold text-[#7c3f13]">
                      Describe the issue or uncertainty for question {question.number}
                      <textarea
                        className={`${DETAIL_INPUT_CLASS} min-h-[88px] resize-y border-[#edc68c] bg-white`}
                        value={response.note || ''}
                        onChange={(event) => onNoteChange(question.key, event.target.value)}
                        placeholder="What is broken, not working, damaged, missing, or uncertain?"
                      />
                    </label>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  </div>
  <PaneComponent paneIndex={commentsPaneIndex}>
    <label className="mt-4 grid gap-2 text-sm font-medium text-[#2a4057]">
      21. Comments or explanation for any of the above
      <textarea
        className={`${DETAIL_INPUT_CLASS} min-h-[150px] resize-y`}
        value={normalized.comments}
        onChange={(event) => onDisclosureChange({ comments: event.target.value, otherDisclosure: event.target.value })}
        placeholder="Explain any yes or unsure answers, or add any other relevant disclosure."
      />
    </label>
  </PaneComponent>
  </fieldset>
}
