import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, ShieldCheck, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getHomeSeekersFicTrainingResult,
  listHomeSeekersAgents,
  listHomeSeekersFicTrainingResults,
  saveHomeSeekersFicTrainingResult,
} from '../../services/homeSeekersFicTrainingService'

const QUESTIONS = [
  { id: 'risk-based-approach', prompt: 'What is a risk-based approach in a RMCP?', choices: ['Applying the same checks to all clients', 'Tailoring due diligence based on risk level', 'Ignoring low-risk clients completely'], answer: 1 },
  { id: 'customer-due-diligence', prompt: 'What is CDD (Customer Due Diligence)?', choices: ['Identifying and verifying clients', 'Marketing to potential buyers', 'Collecting rental payments'], answer: 0 },
  { id: 'non-compliance', prompt: 'What are the consequences for a property practitioner not adhering to the FIC Act?', choices: ['Fines, imprisonment, and reputational damage', 'Only a warning letter', 'No consequences at all'], answer: 0 },
  { id: 'terrorist-financing', prompt: 'What does the abbreviation TF stand for?', choices: ['Terrorist Financing', 'Trade Facilitation', 'Tax Filing'], answer: 0 },
  { id: 'proliferation-financing', prompt: 'What is Proliferation Financing (PF)?', choices: ['Funding the spread of weapons of mass destruction', 'Financing property developments', 'Supporting agricultural exports'], answer: 0 },
  { id: 'verify-information', prompt: 'What is the first step if doubt arises about previously obtained information from a seller?', choices: ['Re-verify the client’s information', 'Ignore the doubt and proceed', 'Ask another practitioner to decide'], answer: 0 },
]

function formatCompletion(value) {
  if (!value) return 'Not completed'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Completed' : `Completed ${date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function Dialog({ children, title, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#101828]/55 p-4" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[22px] border border-white/15 bg-white p-5 shadow-2xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </section>
    </div>
  )
}

function TrainingQuiz({ organisationId, userId, onCompleted, onClose }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const question = QUESTIONS[step]
  const selected = answers[question?.id]
  const isLast = step === QUESTIONS.length - 1

  const submit = async () => {
    const score = QUESTIONS.reduce((total, item) => total + (answers[item.id] === item.answer ? 1 : 0), 0)
    setSaving(true)
    setError('')
    try {
      const saved = await saveHomeSeekersFicTrainingResult({ organisationId, userId, score, totalQuestions: QUESTIONS.length, answers })
      setResult(saved)
      onCompleted(saved)
    } catch (saveError) {
      setError(saveError?.message || 'We could not save your training result. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return <>
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ecfdf3] text-[#16894f]"><CheckCircle2 size={22} /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#16894f]">Training completed</p><h2 className="mt-1 text-xl font-semibold text-[#101828]">Your FIC result is recorded</h2></div></div>
      <div className="mt-6 rounded-2xl bg-[#f7f9fc] p-5"><p className="text-sm font-medium text-[#667085]">Score</p><p className="mt-1 text-4xl font-semibold text-[#101828]">{result.score} <span className="text-xl text-[#7b8ca2]">/ {result.totalQuestions}</span></p></div>
      <button type="button" onClick={onClose} className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#101828] px-4 text-sm font-semibold text-white">Done</button>
    </>
  }

  return <>
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#16894f]">Home Seekers · FIC training</p><h2 className="mt-1 text-xl font-semibold text-[#101828]">Question {step + 1} of {QUESTIONS.length}</h2></div><button type="button" onClick={onClose} className="text-sm font-semibold text-[#667085]">Close</button></div>
    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#e8eef5]"><div className="h-full rounded-full bg-[#16894f] transition-all" style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} /></div>
    <p className="mt-7 text-lg font-semibold leading-7 text-[#172a3d]">{question.prompt}</p>
    <div className="mt-5 grid gap-2.5">{question.choices.map((choice, index) => <button key={choice} type="button" onClick={() => setAnswers((current) => ({ ...current, [question.id]: index }))} className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${selected === index ? 'border-[#16894f] bg-[#ecfdf3] text-[#125f39]' : 'border-[#dbe4ee] bg-white text-[#344054] hover:border-[#9bb6a7]'}`}><span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs">{String.fromCharCode(65 + index)}</span>{choice}</button>)}</div>
    {error ? <p className="mt-4 rounded-xl border border-[#f5c2c7] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
    <div className="mt-7 flex items-center justify-between gap-3"><button type="button" disabled={step === 0 || saving} onClick={() => setStep((current) => current - 1)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dbe4ee] px-4 text-sm font-semibold text-[#344054] disabled:opacity-45"><ChevronLeft size={16} />Back</button><button type="button" disabled={selected === undefined || saving} onClick={() => { if (isLast) void submit(); else setStep((current) => current + 1) }} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#16894f] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{saving ? <Loader2 size={16} className="animate-spin" /> : null}{isLast ? 'Submit training' : 'Next'}{!isLast ? <ChevronRight size={16} /> : null}</button></div>
  </>
}

function QuizReview({ onClose }) {
  return <>
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#16894f]">Home Seekers · FIC training</p><h2 className="mt-1 text-xl font-semibold text-[#101828]">Quiz reference</h2><p className="mt-1 text-sm text-[#667085]">The six questions and their correct answers.</p></div><button type="button" onClick={onClose} className="text-sm font-semibold text-[#667085]">Close</button></div>
    <div className="mt-6 grid gap-3">{QUESTIONS.map((question, index) => <article key={question.id} className="rounded-xl border border-[#e1e8f0] bg-[#fbfdff] p-4"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#718198]">Question {index + 1}</p><h3 className="mt-1 text-sm font-semibold leading-6 text-[#172a3d]">{question.prompt}</h3><p className="mt-3 rounded-lg bg-[#ecfdf3] px-3 py-2 text-sm font-semibold text-[#16894f]">Correct answer: {question.choices[question.answer]}</p></article>)}</div>
  </>
}

export default function HomeSeekersFicTrainingPanel({ organisationId, userId, isPrincipal = false }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [team, setTeam] = useState([])
  const [teamLoading, setTeamLoading] = useState(false)
  const completedCount = useMemo(() => team.filter((member) => member.result).length, [team])

  const loadOwnResult = useCallback(async () => {
    if (!organisationId || !userId || isPrincipal) { setLoading(false); return }
    setLoading(true)
    try { setResult(await getHomeSeekersFicTrainingResult({ organisationId, userId })); setError('') } catch (loadError) { setError(loadError?.message || 'Training progress could not be loaded.') } finally { setLoading(false) }
  }, [isPrincipal, organisationId, userId])
  useEffect(() => { void loadOwnResult() }, [loadOwnResult])

  const openPrincipalView = async () => {
    setOpen(true); setTeamLoading(true); setError('')
    try {
      const [members, results] = await Promise.all([listHomeSeekersAgents({ organisationId }), listHomeSeekersFicTrainingResults({ organisationId })])
      const byUserId = new Map(results.map((entry) => [entry.userId, entry]))
      setTeam(members.map((member) => ({ ...member, result: byUserId.get(member.userId) || null })))
    } catch (loadError) { setError(loadError?.message || 'Training results could not be loaded.') } finally { setTeamLoading(false) }
  }

  const completed = Boolean(result?.completedAt)
  return <section className="flex min-h-full flex-col justify-between rounded-[16px] bg-[#101828] p-4 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-[13px] bg-white/10 text-[#b7f7d0]"><ShieldCheck size={19} /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] !text-slate-300">Compliance</p><h3 className="mt-1 text-base font-semibold !text-white">{isPrincipal ? 'FIC training progress' : 'Complete your training'}</h3><p className="mt-1 text-[0.82rem] leading-5 !text-slate-300">{isPrincipal ? 'See who has completed the Home Seekers FIC module and their score.' : completed ? `${formatCompletion(result.completedAt)} · ${result.score}/${result.totalQuestions}` : 'Complete the Home Seekers FIC module.'}</p></div></div>
    <div className="mt-4 flex flex-wrap gap-2">{loading ? <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/60"><Loader2 size={14} className="animate-spin" />Loading training</span> : <><button type="button" onClick={() => { if (isPrincipal) void openPrincipalView(); else setOpen(true) }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-semibold text-[#101828]">{isPrincipal ? <Users size={16} /> : <ClipboardCheck size={16} />}{isPrincipal ? 'View team progress' : completed ? 'Review training' : 'Start training'}</button>{isPrincipal ? <button type="button" onClick={() => setQuizOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/25 bg-transparent px-3.5 text-sm font-semibold !text-white hover:bg-white/10"><ClipboardCheck size={16} />View quiz</button> : null}</>}</div>
    {error && !open ? <p className="mt-3 text-xs leading-5 text-[#fecaca]">{error}</p> : null}
    {open && !isPrincipal ? <Dialog title="Home Seekers FIC training" onClose={() => setOpen(false)}><TrainingQuiz organisationId={organisationId} userId={userId} onCompleted={setResult} onClose={() => setOpen(false)} /></Dialog> : null}
    {open && isPrincipal ? <Dialog title="Home Seekers FIC training progress" onClose={() => setOpen(false)}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#16894f]">Home Seekers · FIC training</p><h2 className="mt-1 text-xl font-semibold text-[#101828]">Team completion</h2><p className="mt-1 text-sm text-[#667085]">{teamLoading ? 'Loading team results…' : `${completedCount} of ${team.length} active team members completed.`}</p></div><button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-[#667085]">Close</button></div>{error ? <p className="mt-5 rounded-xl border border-[#f5c2c7] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}{teamLoading ? <div className="mt-6 flex items-center gap-2 text-sm text-[#667085]"><Loader2 size={16} className="animate-spin" />Loading training records</div> : <div className="mt-6 overflow-hidden rounded-xl border border-[#e1e8f0]"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-[#e7edf4] bg-[#f8fafc] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#708198]"><span>Agent</span><span>Status</span><span>Score</span></div>{team.map((member) => <div key={member.userId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[#eef2f6] px-4 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#172a3d]">{member.name}</p><p className="truncate text-xs text-[#718198]">{member.email || member.role}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${member.result ? 'bg-[#ecfdf3] text-[#16894f]' : 'bg-[#f2f4f7] text-[#667085]'}`}>{member.result ? 'Completed' : 'Not started'}</span><span className="text-sm font-semibold text-[#344054]">{member.result ? `${member.result.score}/${member.result.totalQuestions}` : '—'}</span></div>)}{!team.length ? <p className="px-4 py-6 text-sm text-[#667085]">No active agents were found.</p> : null}</div>}</Dialog> : null}
    {quizOpen && isPrincipal ? <Dialog title="Home Seekers FIC quiz" onClose={() => setQuizOpen(false)}><QuizReview onClose={() => setQuizOpen(false)} /></Dialog> : null}
  </section>
}
