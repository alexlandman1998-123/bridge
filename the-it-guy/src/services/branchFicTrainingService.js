import { supabase } from '../lib/supabaseClient'
export const FIC_COURSE_VERSION = '2026.10'
export const FIC_LESSONS = [
  {
    title: 'Risk and your RMCP',
    minutes: 4,
    body: [
      'Property transactions can be used to disguise criminal proceeds. Assess the client, transaction, geography and delivery channel together, using your organisation’s approved Risk Management and Compliance Programme (RMCP).',
      'Higher risk calls for the additional checks and approvals specified in the RMCP. A low-risk rating does not remove the need to identify and verify the client. Keep the reasoning and supporting evidence.',
    ],
    scenario:
      'A buyer uses an unfamiliar offshore company and asks to skip verification because the sale is urgent. Pause and apply the RMCP’s risk assessment and escalation procedure.',
    question: 'How should you respond to a higher-risk property transaction?',
    choices: [
      'Use the same checks for everyone',
      'Apply the additional checks and approvals in the RMCP',
      'Skip checks when payment is guaranteed',
    ],
  },
  {
    title: 'Identify and verify clients',
    minutes: 4,
    body: [
      'Identify your client and verify identity using reliable evidence under your RMCP. Understand why the relationship or transaction is being established and verify a representative’s authority to act.',
      'Check whether information remains accurate when circumstances change or doubts arise. Unresolved verification gaps should be escalated using the approved procedure, rather than treated as completed checks.',
    ],
    scenario:
      'Someone signs on behalf of a seller but cannot explain their authority. Obtain and verify that authority before treating the representative as authorised.',
    question:
      'A seller representative’s authority is unclear. What is the appropriate next step?',
    choices: [
      'Verify the representative and their authority under the RMCP',
      'Accept their signature as proof',
      'Ask the buyer to approve the representative',
    ],
  },
  {
    title: 'Beneficial ownership',
    minutes: 4,
    body: [
      'For a company, trust or other legal arrangement, identify the people who ultimately own or exercise control, following the RMCP and current FIC guidance. A company registration document alone may not reveal those people.',
      'Understand the ownership and control structure and retain the evidence and reasoning used. Escalate an opaque or inconsistent structure to the responsible compliance person.',
    ],
    scenario:
      'The purchasing company is owned by another company. Do not stop at the immediate shareholder; establish the ultimate ownership or control using your approved process.',
    question: 'What does beneficial ownership work aim to establish?',
    choices: [
      'Only the company’s trading name',
      'Only the person who submits the offer',
      'The natural people who ultimately own or control the client',
    ],
  },
  {
    title: 'Sanctions and politically exposed persons',
    minutes: 4,
    body: [
      'Follow the RMCP for sanctions screening and for identifying politically exposed persons. These are distinct checks. A possible sanctions match needs careful verification and escalation; it is not a finding based only on a similar name.',
      'Apply the approvals and enhanced checks required by the RMCP and current guidance. Never represent a manual training exercise as an actual screening result. Use your approved screening tools and retain the evidence.',
    ],
    scenario:
      'A client’s name resembles an entry on a sanctions list. Refer it for verification under the organisation’s procedure instead of assuming either a match or a clean result.',
    question: 'What should you do with a possible sanctions match?',
    choices: [
      'Ignore it if the client denies a connection',
      'Verify and escalate using the approved procedure',
      'Automatically label the client as sanctioned',
    ],
  },
  {
    title: 'Suspicious activity and escalation',
    minutes: 4,
    body: [
      'Watch for unexplained third-party payments, inconsistent information, unusual urgency and other indicators described in the RMCP. Consider the circumstances together and record the facts rather than making unsupported accusations.',
      'Follow the organisation’s reporting and escalation procedure promptly. Do not disclose that a suspicious activity report has been or may be made to the person concerned. Internal escalation does not itself prove that a required regulatory report was filed.',
    ],
    scenario:
      'A buyer requests that unexplained funds from an unrelated party be accepted and later refunded elsewhere. Preserve the facts and escalate through the approved channel.',
    question: 'How should suspicious activity be handled?',
    choices: [
      'Escalate through the approved procedure without tipping off the client',
      'Tell the client a suspicious activity report will be made',
      'Assume another professional will report it',
    ],
  },
  {
    title: 'Records and ongoing monitoring',
    minutes: 4,
    body: [
      'Retain verification evidence, risk decisions, approvals and relevant transaction records according to the RMCP and applicable requirements. Store them in authorised systems with appropriate access controls.',
      'Keep records retrievable for authorised review and reassess relevant information when the relationship or transaction changes. Complete this foundation assessment, then read and acknowledge your organisation’s current RMCP.',
    ],
    scenario:
      'An agent leaves while a transaction is underway. The authorised team should still be able to retrieve the client checks, risk reasoning and approvals from the organisation’s records.',
    question: 'Which record-keeping approach supports compliance work?',
    choices: [
      'Keep the documents only on an agent’s personal device',
      'Delete checks as soon as an offer is signed',
      'Retain retrievable evidence and decisions in authorised systems',
    ],
  },
]
export const FIC_GUIDANCE_URL = 'https://www.fic.gov.za/compliance/'
function client() {
  if (!supabase) throw new Error('The secure data connection is unavailable.')
  return supabase
}
async function rows(table, org, branch = '') {
  const result = []
  for (let start = 0; ; start += 500) {
    let query = client().from(table).select('*').eq('organisation_id', org)
    if (branch) query = query.eq('branch_id', branch)
    const { data, error } = await query
      .order(
        table === 'branch_fic_training_progress'
          ? 'user_id'
          : table === 'organisation_fic_policies'
            ? 'published_at'
            : table === 'branch_fic_training_attempts'
              ? 'completed_at'
              : 'acknowledged_at',
        { ascending: false },
      )
      .range(start, start + 499)
    if (error) throw error
    result.push(...data)
    if (data.length < 500) return result
  }
}
export async function loadBranchFicTraining(org, branch) {
  const [progress, attempts, policies, acknowledgements] = await Promise.all([
    rows('branch_fic_training_progress', org, branch),
    rows('branch_fic_training_attempts', org, branch),
    rows('organisation_fic_policies', org),
    rows('branch_fic_policy_acknowledgements', org, branch),
  ])
  return { progress, attempts, policies, acknowledgements }
}
async function rpc(name, args) {
  const { data, error } = await client().rpc(name, args)
  if (error) throw error
  return data
}
export const saveFicLesson = (org, branch, lesson) =>
  rpc('fic_save_lesson', { p_org: org, p_branch: branch, p_lesson: lesson })
export const submitFicAssessment = (org, branch, answers) =>
  rpc('fic_submit_assessment', {
    p_org: org,
    p_branch: branch,
    p_answers: answers,
  })
export const assignFicTraining = (org, branch, due) =>
  rpc('fic_assign_branch_training', {
    p_org: org,
    p_branch: branch,
    p_due: due || null,
  })
export const acknowledgeFicPolicy = (org, branch, policy) =>
  rpc('fic_acknowledge_policy', {
    p_org: org,
    p_branch: branch,
    p_policy: policy,
  })
export async function publishFicPolicy(org, { file, version, title, owner }) {
  if (!file || file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024)
    throw new Error('Choose a PDF up to 10 MB.')
  if (![version, title, owner].every((value) => String(value || '').trim()))
    throw new Error('Enter a version, title and responsible person.')
  const path = `organisations/${org}/${crypto.randomUUID()}.pdf`
  const { error } = await client()
    .storage.from('fic-compliance')
    .upload(path, file, { upsert: false, contentType: 'application/pdf' })
  if (error) throw error
  return rpc('fic_publish_policy', {
    p_org: org,
    p_version: version,
    p_title: title,
    p_owner: owner,
    p_path: path,
  })
}
export async function openFicPolicy(policy) {
  const { data, error } = await client()
    .storage.from('fic-compliance')
    .createSignedUrl(policy.storage_path, 15 * 60)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('The policy could not be opened.')
  return data.signedUrl
}
export function ficMemberStatus(data, userId, policyId) {
  const progress = data.progress.find(
    (row) =>
      row.user_id === userId && row.course_version === FIC_COURSE_VERSION,
  )
  const attempts = data.attempts
    .filter(
      (row) =>
        row.user_id === userId && row.course_version === FIC_COURSE_VERSION,
    )
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
  const passed = attempts.find((row) => row.passed)
  const acknowledgement = data.acknowledgements.find(
    (row) => row.user_id === userId && row.policy_id === policyId,
  )
  return {
    progress,
    attempts,
    passed,
    acknowledgement,
    lessons: progress?.completed_lessons || [],
    status: passed
      ? 'Passed'
      : attempts.length
        ? 'Needs retry'
        : progress?.completed_lessons?.length
          ? 'In progress'
          : 'Not started',
  }
}
export function ficTrainingCsv(branch, data) {
  const policy = data.policies.find((row) => row.is_current)
  const lines = [
    [
      'Branch',
      'Team member',
      'Course version',
      'Training status',
      'Lessons completed',
      'Latest score',
      'Latest attempt date',
      'Passed date',
      'Due date',
      'RMCP version',
      'RMCP acknowledgement date',
    ],
  ]
  for (const member of [
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
  ]) {
    const status = ficMemberStatus(data, member.user_id, policy?.id)
    lines.push([
      branch.name,
      [member.first_name, member.last_name].filter(Boolean).join(' ') ||
        member.email ||
        'Team member',
      FIC_COURSE_VERSION,
      status.status,
      `${status.lessons.length}/6`,
      status.attempts[0] ? `${status.attempts[0].score}/6` : '',
      status.attempts[0]?.completed_at || '',
      status.passed?.completed_at || '',
      status.progress?.due_on || '',
      policy?.version || '',
      status.acknowledgement?.acknowledged_at || '',
    ])
  }
  // Spreadsheet programs must not interpret names or branch data as formulas.
  return lines
    .map((line) =>
      line
        .map(
          (value) =>
            `"${String(value ?? '')
              .replace(/^(?:\s*[=+@-]|[\t\r])/, "'$&")
              .replaceAll('"', '""')}"`,
        )
        .join(','),
    )
    .join('\r\n')
}
