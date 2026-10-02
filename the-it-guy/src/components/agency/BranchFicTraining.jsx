import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import UiButton from '../ui/Button'
import Field from '../ui/Field'
import {
  FIC_COURSE_VERSION,
  FIC_GUIDANCE_URL,
  FIC_LESSONS,
  acknowledgeFicPolicy,
  assignFicTraining,
  ficMemberStatus,
  ficTrainingCsv,
  loadBranchFicTraining,
  openFicPolicy,
  publishFicPolicy,
  saveFicLesson,
  submitFicAssessment,
} from '../../services/branchFicTrainingService'

function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <UiButton
      variant={variant}
      className={`${variant === 'primary' ? 'bg-[#087b55] hover:bg-[#066847]' : ''} ${className}`}
      {...props}
    />
  )
}

const PANEL =
  'min-w-0 rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.025)] sm:p-6'
const date = (value) =>
  value
    ? new Intl.DateTimeFormat('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Johannesburg',
      }).format(new Date(value))
    : '—'
function Badge({ children, complete }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${complete ? 'bg-[#eaf7f0] text-[#087b55]' : 'bg-[#f1f5f9] text-[#60758b]'}`}
    >
      {children}
    </span>
  )
}

export default function BranchFicTraining({
  branch,
  userId,
  canManage,
  canPublish,
}) {
  const [section, setSection] = useState('learning')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [lessonIndex, setLessonIndex] = useState(0)
  const [assessment, setAssessment] = useState(false)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [due, setDue] = useState('')
  const [policyRead, setPolicyRead] = useState(false)
  const [policyForm, setPolicyForm] = useState({
    title: 'Risk Management and Compliance Programme',
    version: '',
    owner: '',
  })
  const [file, setFile] = useState(null)
  const policyFileInput = useRef(null)
  const [approved, setApproved] = useState(false)
  const [documentLink, setDocumentLink] = useState('')
  const org = branch.organisationId
  const reload = useCallback(async () => {
    const value = await loadBranchFicTraining(org, branch.id)
    setData(value)
    return value
  }, [org, branch.id])
  useEffect(() => {
    let alive = true
    loadBranchFicTraining(org, branch.id)
      .then((value) => {
        if (alive) setData(value)
      })
      .catch((e) => {
        if (alive) setError(e.message || 'Unable to load training records.')
      })
    return () => {
      alive = false
    }
  }, [org, branch.id])
  const policy = data?.policies.find((row) => row.is_current)
  useEffect(() => {
    setPolicyRead(false)
    setDocumentLink('')
  }, [policy?.id])
  async function act(operation, message = '') {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
      await reload()
      setNotice(message)
    } catch (e) {
      setError(e.message || 'The change could not be saved. Please retry.')
    } finally {
      setBusy(false)
    }
  }
  async function viewPolicy(item) {
    const popup = window.open('about:blank', '_blank')
    if (popup) popup.opener = null
    try {
      const url = await openFicPolicy(item)
      if (popup) popup.location.replace(url)
      else setDocumentLink(url)
    } catch (e) {
      popup?.close()
      setError(e.message || 'Unable to open the RMCP.')
    }
  }
  if (!data)
    return (
      <section className={PANEL}>
        <h2 className="text-xl font-semibold text-[#142132]">
          FIC Training & Compliance
        </h2>
        {error ? (
          <>
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
            <p className="mt-2 text-sm text-[#60758b]">
              Training records must be available before progress can be
              recorded.
            </p>
            <Button
              className="mt-4"
              onClick={() => void act(async () => {})}
              disabled={busy}
            >
              Retry
            </Button>
          </>
        ) : (
          <p
            role="status"
            className="mt-4 flex items-center gap-2 text-sm text-[#60758b]"
          >
            <Loader2 size={16} className="animate-spin" />
            Loading training records…
          </p>
        )}
      </section>
    )
  const mine = ficMemberStatus(data, userId, policy?.id)
  const members = [
    ...new Map(
      branch.members
        .filter(
          (row) =>
            ['active', 'accepted'].includes(
              String(row.membership_status || row.status || '')
                .trim()
                .toLowerCase(),
            ) && row.user_id,
        )
        .map((row) => [row.user_id, row]),
    ).values(),
  ]
  const passedCount = members.filter(
    (row) => ficMemberStatus(data, row.user_id, policy?.id).passed,
  ).length
  const acknowledgedCount = policy
    ? members.filter(
        (row) => ficMemberStatus(data, row.user_id, policy.id).acknowledgement,
      ).length
    : null
  const lesson = FIC_LESSONS[lessonIndex]
  function exportRecords() {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', ficTrainingCsv(branch, data)], {
        type: 'text/csv;charset=utf-8',
      }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `branch-fic-training-${FIC_COURSE_VERSION}.csv`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="space-y-4">
      <header className={PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#087b55]">
              Learning & accountability
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-[#142132]">
              FIC Training & Compliance
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60758b]">
              Build practical knowledge, record training, and acknowledge your
              organisation’s approved RMCP.
            </p>
          </div>
          <span className="rounded-xl bg-[#edf8f2] p-3 text-[#087b55]">
            <GraduationCap size={25} />
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#edf2f7] pt-4 text-sm text-[#60758b]">
          <span>
            <strong className="text-[#142132]">{mine.lessons.length}/6</strong>{' '}
            lessons completed
          </span>
          <span>
            Assessment{' '}
            <strong className="text-[#142132]">
              {mine.passed ? 'Passed' : 'Pending'}
            </strong>
          </span>
          <span>
            RMCP{' '}
            <strong className="text-[#142132]">
              {mine.acknowledgement
                ? 'Acknowledged'
                : policy
                  ? 'Awaiting acknowledgement'
                  : 'Not published'}
            </strong>
          </span>
        </div>
      </header>
      <nav
        className="flex flex-wrap gap-1 rounded-xl border border-[#e2e8f0] bg-white p-1.5"
        aria-label="FIC module sections"
      >
        {[
          { key: 'learning', label: 'My Training', icon: BookOpen },
          ...(canManage
            ? [{ key: 'team', label: 'Team Training', icon: Users }]
            : []),
          { key: 'policies', label: 'Policies & Evidence', icon: FileText },
        ].map((item) => (
          <button
            type="button"
            key={item.key}
            aria-current={section === item.key ? 'page' : undefined}
            onClick={() => setSection(item.key)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${section === item.key ? 'bg-[#eaf7f0] text-[#087b55]' : 'text-[#60758b] hover:bg-[#f8fafc]'}`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-[#eaf7f0] p-3 text-sm text-[#087b55]"
        >
          {notice}
        </p>
      ) : null}
      {section === 'learning' ? (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.8fr)]">
            <aside className={PANEL}>
              <h3 className="font-semibold text-[#142132]">FIC foundation</h3>
              <p className="mt-1 text-xs text-[#60758b]">
                Version {FIC_COURSE_VERSION} · 6 short lessons
              </p>
              <div className="mt-4 space-y-1">
                {FIC_LESSONS.map((item, index) => (
                  <button
                    type="button"
                    key={item.title}
                    onClick={() => {
                      setLessonIndex(index)
                      setAssessment(false)
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm ${!assessment && lessonIndex === index ? 'bg-[#eaf7f0] text-[#087b55]' : 'text-[#405870] hover:bg-[#f8fafc]'}`}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs">
                      {mine.lessons.includes(index) ? (
                        <Check size={13} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                className="mt-5 w-full"
                disabled={mine.lessons.length !== 6 || busy}
                onClick={() => {
                  setAssessment(true)
                  setResult(null)
                  setAnswers({})
                }}
              >
                Take assessment
              </Button>
              <p className="mt-2 text-xs leading-5 text-[#60758b]">
                Complete all lessons first. Pass with at least 5 of 6 correct
                answers.
              </p>
            </aside>
            <article className={PANEL}>
              {assessment ? (
                <>
                  <h3 className="text-xl font-semibold text-[#142132]">
                    Foundation assessment
                  </h3>
                  <p className="mt-1 text-sm text-[#60758b]">
                    Choose one answer per question. Your result is recorded
                    against this course version.
                  </p>
                  {result ? (
                    <div
                      className="mt-5 rounded-xl bg-[#f8fafc] p-5"
                      role="status"
                    >
                      <Badge complete={result.passed}>
                        {result.passed ? 'Passed' : 'Review and retry'}
                      </Badge>
                      <p className="mt-3 text-3xl font-semibold text-[#142132]">
                        {result.score} / {result.total_questions}
                      </p>
                      <p className="mt-2 text-sm text-[#60758b]">
                        {result.passed
                          ? 'Your dated training result has been saved. Check your current RMCP acknowledgement next.'
                          : 'Review the lessons and try again. Every submitted attempt is retained.'}
                      </p>
                      <Button
                        variant="secondary"
                        className="mt-4"
                        onClick={() => {
                          setResult(null)
                          setAnswers({})
                        }}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        void act(async () => {
                          const value = await submitFicAssessment(
                            org,
                            branch.id,
                            FIC_LESSONS.map((_, index) =>
                              Number(answers[index]),
                            ),
                          )
                          setResult(value)
                        }, 'Assessment result saved.')
                      }}
                    >
                      <fieldset disabled={busy} className="mt-5 space-y-6">
                        {FIC_LESSONS.map((item, index) => (
                          <fieldset key={item.title}>
                            <legend className="mb-3 text-sm font-semibold leading-6 text-[#142132]">
                              {index + 1}. {item.question}
                            </legend>
                            <div className="space-y-2">
                              {item.choices.map((choice, value) => (
                                <label
                                  key={choice}
                                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-5 ${answers[index] === value ? 'border-[#087b55] bg-[#f1faf5] text-[#142132]' : 'border-[#e2e8f0] text-[#60758b]'}`}
                                >
                                  <input
                                    type="radio"
                                    name={`question-${index}`}
                                    value={value}
                                    checked={answers[index] === value}
                                    onChange={() =>
                                      setAnswers((previous) => ({
                                        ...previous,
                                        [index]: value,
                                      }))
                                    }
                                    required
                                    className="mt-0.5 accent-[#087b55]"
                                  />
                                  {choice}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ))}
                      </fieldset>
                      <Button
                        type="submit"
                        className="mt-6"
                        disabled={busy || Object.keys(answers).length !== 6}
                      >
                        {busy ? 'Saving…' : 'Submit assessment'}
                      </Button>
                    </form>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge complete={mine.lessons.includes(lessonIndex)}>
                      {mine.lessons.includes(lessonIndex)
                        ? 'Completed'
                        : `Lesson ${lessonIndex + 1} of 6`}
                    </Badge>
                    <span className="text-xs text-[#60758b]">
                      About {lesson.minutes} minutes
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-[#142132]">
                    {lesson.title}
                  </h3>
                  <div className="mt-5 space-y-4 text-sm leading-7 text-[#52657a]">
                    {lesson.body.map((text) => (
                      <p key={text}>{text}</p>
                    ))}
                  </div>
                  <div className="mt-6 rounded-xl border border-[#dcece3] bg-[#f4faf6] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#087b55]">
                      In practice
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#405870]">
                      {lesson.scenario}
                    </p>
                  </div>
                  <a
                    href={FIC_GUIDANCE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-block text-sm font-medium text-[#087b55] underline"
                  >
                    Read the FIC’s official guidance
                  </a>
                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#edf2f7] pt-5">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await saveFicLesson(org, branch.id, lessonIndex)
                          if (lessonIndex < 5) setLessonIndex(lessonIndex + 1)
                        }, 'Lesson progress saved.')
                      }
                    >
                      <CheckCircle2 size={16} />
                      {mine.lessons.includes(lessonIndex)
                        ? 'Continue'
                        : 'Mark complete & continue'}
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                </>
              )}
            </article>
          </div>
          {mine.attempts.length ? (
            <section className={PANEL}>
              <h3 className="font-semibold text-[#142132]">
                Your assessment history
              </h3>
              <ul className="mt-3 divide-y divide-[#edf2f7]">
                {mine.attempts.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <span className="text-[#60758b]">
                      {date(item.completed_at)} · Version {item.course_version}
                    </span>
                    <span className="font-medium text-[#142132]">
                      {item.score}/{item.total_questions} ·{' '}
                      {item.passed ? 'Passed' : 'Needs retry'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      {section === 'team' && canManage ? (
        <section className={PANEL}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[#142132]">
                Branch training register
              </h3>
              <p className="mt-1 text-sm text-[#60758b]">
                {passedCount} of {members.length} passed ·{' '}
                {acknowledgedCount === null
                  ? 'RMCP not published'
                  : `${acknowledgedCount} acknowledged the current RMCP`}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={!members.length}
              onClick={exportRecords}
            >
              <Download size={16} />
              Export records
            </Button>
          </div>
          <form
            className="mt-5 flex flex-wrap items-end gap-3 rounded-xl bg-[#f8fafc] p-4"
            onSubmit={(event) => {
              event.preventDefault()
              void act(async () => {
                await assignFicTraining(org, branch.id, due)
              }, 'Training assigned to active branch staff.')
            }}
          >
            <label className="grid gap-1.5 text-xs font-medium text-[#60758b]">
              Target completion date (optional)
              <Field
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
                disabled={busy}
              />
            </label>
            <Button type="submit" disabled={busy || !members.length}>
              Assign foundation course
            </Button>
            <p className="w-full text-xs text-[#60758b]">
              Existing progress and assessment history are preserved.
            </p>
          </form>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="border-b border-[#e2e8f0] text-xs text-[#718198]">
                <tr>
                  {[
                    'Team member',
                    'Training',
                    'Lessons',
                    'Latest score',
                    'Due',
                    'RMCP',
                  ].map((label) => (
                    <th key={label} className="px-3 py-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const status = ficMemberStatus(
                    data,
                    member.user_id,
                    policy?.id,
                  )
                  return (
                    <tr
                      key={member.user_id}
                      className="border-b border-[#edf2f7] last:border-0"
                    >
                      <td className="px-3 py-4 font-medium text-[#142132]">
                        {[member.first_name, member.last_name]
                          .filter(Boolean)
                          .join(' ') ||
                          member.email ||
                          'Team member'}
                      </td>
                      <td className="px-3 py-4">
                        <Badge complete={Boolean(status.passed)}>
                          {status.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-4 text-[#60758b]">
                        {status.lessons.length}/6
                      </td>
                      <td className="px-3 py-4 text-[#60758b]">
                        {status.attempts[0]
                          ? `${status.attempts[0].score}/6`
                          : '—'}
                      </td>
                      <td className="px-3 py-4 text-[#60758b]">
                        {date(status.progress?.due_on)}
                      </td>
                      <td className="px-3 py-4 text-[#60758b]">
                        {status.acknowledgement
                          ? 'Acknowledged'
                          : policy
                            ? 'Pending'
                            : 'Not published'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!members.length ? (
            <p className="py-6 text-center text-sm text-[#60758b]">
              No active branch staff to assign yet.
            </p>
          ) : null}
        </section>
      ) : null}
      {section === 'policies' ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className={PANEL}>
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-[#087b55]" size={23} />
              <h3 className="text-xl font-semibold text-[#142132]">
                Current RMCP
              </h3>
            </div>
            {policy ? (
              <>
                <p className="mt-5 font-semibold text-[#142132]">
                  {policy.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#60758b]">
                  Version {policy.version} · Published{' '}
                  {date(policy.published_at)}
                  <br />
                  Responsible person: {policy.responsible_person}
                </p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => void viewPolicy(policy)}
                >
                  <FileText size={16} />
                  Read RMCP
                </Button>
                {mine.acknowledgement ? (
                  <p className="mt-5 flex items-center gap-2 text-sm text-[#087b55]">
                    <CheckCircle2 size={16} />
                    Acknowledged {date(mine.acknowledgement.acknowledged_at)}
                  </p>
                ) : (
                  <div className="mt-5 border-t border-[#edf2f7] pt-5">
                    <label className="flex items-start gap-3 text-sm leading-6 text-[#60758b]">
                      <input
                        type="checkbox"
                        checked={policyRead}
                        onChange={(event) =>
                          setPolicyRead(event.target.checked)
                        }
                        className="mt-1 accent-[#087b55]"
                      />
                      I have read this RMCP version and understand the
                      procedures and who to contact with questions.
                    </label>
                    <Button
                      className="mt-4"
                      disabled={!policyRead || busy}
                      onClick={() =>
                        void act(
                          () => acknowledgeFicPolicy(org, branch.id, policy.id),
                          'RMCP acknowledgement recorded.',
                        )
                      }
                    >
                      Acknowledge version {policy.version}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-5 rounded-xl bg-[#f8fafc] p-4 text-sm leading-6 text-[#60758b]">
                No approved RMCP has been published. An organisation owner or
                principal can publish the reviewed policy here.
              </p>
            )}
            {documentLink ? (
              <a
                href={documentLink}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block text-sm text-[#087b55] underline"
              >
                Open policy document
              </a>
            ) : null}
            {data.policies.length > 1 ? (
              <div className="mt-6 border-t border-[#edf2f7] pt-4">
                <h4 className="text-sm font-semibold text-[#142132]">
                  Previous versions
                </h4>
                {data.policies
                  .filter((item) => !item.is_current)
                  .map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => void viewPolicy(item)}
                      className="mt-2 block text-sm text-[#60758b] underline"
                    >
                      Version {item.version} · {date(item.published_at)}
                    </button>
                  ))}
              </div>
            ) : null}
          </section>
          {canPublish ? (
            <section className={PANEL}>
              <h3 className="text-xl font-semibold text-[#142132]">
                Publish an approved RMCP
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#60758b]">
                One organisation policy is shared across its branches.
                Publishing a new version preserves earlier documents and
                acknowledgements.
              </p>
              <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void act(async () => {
                    await publishFicPolicy(org, { ...policyForm, file })
                    setFile(null)
                    if (policyFileInput.current)
                      policyFileInput.current.value = ''
                    setApproved(false)
                    setPolicyForm((previous) => ({ ...previous, version: '' }))
                  }, 'The new RMCP version is now available for acknowledgement.')
                }}
              >
                <fieldset disabled={busy} className="space-y-4">
                  {[
                    { key: 'title', label: 'Document title' },
                    { key: 'version', label: 'Version reference' },
                    { key: 'owner', label: 'Responsible compliance person' },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="grid gap-1.5 text-sm text-[#60758b]"
                    >
                      {item.label}
                      <Field
                        value={policyForm[item.key]}
                        onChange={(event) =>
                          setPolicyForm((previous) => ({
                            ...previous,
                            [item.key]: event.target.value,
                          }))
                        }
                        required
                        maxLength={200}
                      />
                    </label>
                  ))}
                  <label className="grid gap-2 text-sm text-[#60758b]">
                    Approved RMCP document
                    <input
                      type="file"
                      ref={policyFileInput}
                      accept="application/pdf"
                      onChange={(event) =>
                        setFile(event.target.files?.[0] || null)
                      }
                      required
                      className="max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#eef5f1] file:px-3 file:py-2 file:text-[#087b55]"
                    />
                    <span className="text-xs">
                      PDF up to 10 MB. Access is restricted to your
                      organisation.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm leading-6 text-[#60758b]">
                    <input
                      type="checkbox"
                      checked={approved}
                      onChange={(event) => setApproved(event.target.checked)}
                      required
                      className="mt-1 accent-[#087b55]"
                    />
                    This is the organisation’s reviewed and approved RMCP,
                    authorised for publication to staff.
                  </label>
                </fieldset>
                <Button type="submit" disabled={busy || !file || !approved}>
                  {busy ? 'Publishing…' : 'Publish policy version'}
                </Button>
              </form>
            </section>
          ) : (
            <section className={PANEL}>
              <h3 className="font-semibold text-[#142132]">
                Evidence that stays current
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#60758b]">
                Your training attempts retain their dates and course versions.
                RMCP acknowledgement refers to a specific published document. A
                new policy version requires a new acknowledgement.
              </p>
            </section>
          )}
        </div>
      ) : null}
      <p className="px-1 text-xs leading-6 text-[#718198]">
        Training completion and RMCP acknowledgement are evidence of learning.
        They do not certify regulatory compliance or replace your organisation’s
        approved procedures.
      </p>
    </section>
  )
}
