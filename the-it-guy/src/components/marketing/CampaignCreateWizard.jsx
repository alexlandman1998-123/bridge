import { personalisePlaybookChannel, playbookForChannels } from '../../services/campaignPlaybookModel'
import { useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  Layers,
  Plus,
  Mail,
  MessageCircle,
  Network,
  Share2,
} from 'lucide-react'
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_GOALS,
  campaignPayload,
} from '../../services/marketingCampaignService'
import { campaignFromChannelTemplate } from '../../services/marketingChannelTemplateService'
import CampaignGoalFields from './CampaignGoalFields'
import './CampaignCreateWizard.css'

const steps = [
  'Starting point',
  'Goal & offer',
  'Channels & copy',
  'Timing',
  'Review',
]
const icons = {
  email: Mail,
  whatsapp: MessageCircle,
  meta: Network,
  chatgpt: MessageCircle,
  social: Share2,
}
function dateAfter(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function initialForm(template) {
  return {
    id: crypto.randomUUID(),
    ...(template?.playbook ? { playbook: structuredClone(template.playbook) } : {}),
    ...(template?.campaign_setup ? { campaign_setup: structuredClone(template.campaign_setup) } : {}),
    name: template?.name || '',
    goal: template?.goal || 'seller_leads',
    objective: template?.objective ?? CAMPAIGN_GOALS.seller_leads,
    audience: template?.audience || '',
    offer: template?.offer || '',
    area: template?.area || '',
    status: 'draft',
    planned_channels: [...(template?.channels || ['email'])],
    channel_content: structuredClone(template?.channel_content || {}),
    cover_url: template?.cover_url || '',
    start_date: dateAfter(0),
    end_date:
      template?.mode === 'ongoing'
        ? ''
        : dateAfter(template?.duration_days || 30),
  }
}
export default function CampaignCreateWizard({
  template,
  organisationId,
  templates = [],
  templatesLoading = false,
  templatesError = '',
  onRetryTemplates,
  onBrowseTemplates,
  onSave,
  onCancel,
}) {
  const [form, setForm] = useState(() => initialForm(template))
  const [step, setStep] = useState(template ? 1 : 0)
  const [mode, setMode] = useState(template?.mode || 'bounded')
  const [activeChannel, setActiveChannel] = useState(
    template?.channels?.[0] || 'email',
  )
  const [selected, setSelected] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const formRef = useRef(null)
  const headingRef = useRef(null)
  const field = (key) => ({
    value: form[key] ?? '',
    onChange: (event) =>
      setForm((old) => ({ ...old, [key]: event.target.value })),
  })
  function go(next) {
    setError('')
    setStep(next)
    requestAnimationFrame(() => headingRef.current?.focus())
  }
  function snapshot() {
    return {
      ...form,
      ...(form.playbook ? { playbook: playbookForChannels(form.playbook, form.planned_channels) } : {}),
      end_date: mode === 'ongoing' ? '' : form.end_date,
      channel_content: Object.fromEntries(
        form.planned_channels
          .filter((channel) => form.channel_content[channel])
          .map((channel) => [channel, { ...form.channel_content[channel] }]),
      ),
    }
  }
  async function submit(event) {
    event.preventDefault()
    if (busy || step === 0) return
    setError('')
    if (!formRef.current.reportValidity()) return
    if (step === 2 && !form.planned_channels.length) {
      setError('Choose at least one channel.')
      return
    }
    if (step === 3) {
      try {
        campaignPayload(snapshot())
      } catch (err) {
        setError(err.message)
        return
      }
    }
    if (step < 4) {
      go(step + 1)
      return
    }
    try {
      campaignPayload(snapshot())
      setBusy(true)
      await onSave(snapshot())
    } catch (err) {
      setError(err.message || 'Could not save the campaign. Try again.')
      setBusy(false)
    }
  }
  function toggle(channel) {
    const channels = form.planned_channels.includes(channel)
      ? form.planned_channels.filter((key) => key !== channel)
      : [...form.planned_channels, channel]
    setForm((old) => ({ ...old, planned_channels: channels }))
    if (!channels.includes(activeChannel)) setActiveChannel(channels[0] || '')
  }
  function copy(key, value) {
    setForm((old) => ({
      ...old,
      ...(old.playbook ? { playbook: personalisePlaybookChannel(old.playbook, activeChannel, { [key]: value }) } : {}),
      channel_content: {
        ...old.channel_content,
        [activeChannel]: {
          ...old.channel_content[activeChannel],
          [key]: value,
        },
      },
    }))
  }
  function applyTemplate() {
    try {
      const source = templates.find(
        (item) =>
          item.id === selected[activeChannel] && item.channel === activeChannel,
      )
      if (!source)
        throw new Error('Choose an available template for this channel.')
      const content =
        campaignFromChannelTemplate(source).channel_content[activeChannel]
      setForm((old) => ({
        ...old,
        ...(old.playbook ? { playbook: personalisePlaybookChannel(old.playbook, activeChannel, content) } : {}),
        channel_content: {
          ...old.channel_content,
          [activeChannel]: structuredClone(content),
        },
      }))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }
  const content = form.channel_content[activeChannel] || {}
  return (
    <form ref={formRef} className="mc-wizard" aria-label="Campaign setup" onSubmit={submit}>
      <span className="sr-only" ref={headingRef} tabIndex={-1} aria-live="polite">Step {step + 1} of {steps.length}: {steps[step]}</span>
      <ol className="mc-wizard-steps" aria-label="Campaign setup stages">
        {steps.map((label, index) => (
          <li key={label} className={index < step ? 'mc-wizard-step-complete' : undefined} aria-current={index === step ? 'step' : undefined}>
            <span>{index < step ? <Check size={15} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <fieldset disabled={busy} className="mc-wizard-body">
        {step === 0 && (
          <>
            <h3>How would you like to start?</h3>
            <div className="mc-wizard-start">
              <button type="button" onClick={onBrowseTemplates}>
                <Layers size={30} />
                <strong>Use a template</strong>
                <span>Start with a campaign playbook and make it yours.</span>
                <ArrowRight size={20} />
              </button>
              <button type="button" onClick={() => go(1)}>
                <Plus size={30} />
                <strong>Start from scratch</strong>
                <span>
                  Build your goal, offer and channel mix from a blank plan.
                </span>
                <ArrowRight size={20} />
              </button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h3>What do you want to achieve?</h3>
            <div className="mc-fields">
              <label className="mc-full">
                Campaign name
                <input
                  {...field('name')}
                  required
                  maxLength={120}
                  placeholder="e.g. Summer seller valuations"
                  autoFocus
                />
              </label>
              <CampaignGoalFields form={form} setForm={setForm} organisationId={organisationId} />
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h3>Build your channel mix</h3>
            <div className="mc-wizard-channels">
              {Object.entries(CAMPAIGN_CHANNELS).map(([channel, label]) => {
                const Icon = icons[channel]
                return (
                  <label key={channel}>
                    <input
                      type="checkbox"
                      checked={form.planned_channels.includes(channel)}
                      onChange={() => toggle(channel)}
                    />
                    <Icon size={20} />
                    {label}
                  </label>
                )
              })}
            </div>
            {!!form.planned_channels.length && (
              <>
                <div
                  className="mc-wizard-channel-tabs"
                  role="tablist"
                  aria-label="Channel copy"
                >
                  {form.planned_channels.map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      role="tab"
                      id={`wizard-tab-${channel}`}
                      aria-selected={activeChannel === channel}
                      tabIndex={activeChannel === channel ? 0 : -1}
                      onKeyDown={(event) => {
                        const channels = form.planned_channels
                        const index = channels.indexOf(channel)
                        const target =
                          event.key === 'ArrowRight'
                            ? channels[(index + 1) % channels.length]
                            : event.key === 'ArrowLeft'
                              ? channels[
                                  (index + channels.length - 1) %
                                    channels.length
                                ]
                              : event.key === 'Home'
                                ? channels[0]
                                : event.key === 'End'
                                  ? channels.at(-1)
                                  : null
                        if (target) {
                          event.preventDefault()
                          setActiveChannel(target)
                          formRef.current
                            .querySelector(`#wizard-tab-${target}`)
                            ?.focus()
                        }
                      }}
                      aria-controls="wizard-copy-panel"
                      onClick={() => setActiveChannel(channel)}
                    >
                      {CAMPAIGN_CHANNELS[channel]}
                    </button>
                  ))}
                </div>
                <div
                  id="wizard-copy-panel"
                  role="tabpanel"
                  aria-labelledby={`wizard-tab-${activeChannel}`}
                  className="mc-wizard-copy"
                >
                  <div className="mc-wizard-template">
                    <label>
                      Template for {CAMPAIGN_CHANNELS[activeChannel]}
                      <select
                        value={selected[activeChannel] || ''}
                        onChange={(event) =>
                          setSelected((old) => ({
                            ...old,
                            [activeChannel]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Write your own copy</option>
                        {templates
                          .filter((item) => item.channel === activeChannel)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ·{' '}
                              {item.visibility === 'agency'
                                ? 'Agency'
                                : 'Personal'}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="mc-button secondary"
                      disabled={!selected[activeChannel]}
                      onClick={applyTemplate}
                    >
                      Apply template
                    </button>
                  </div>
                  <p className="mc-wizard-hint">
                    Applying a template replaces this channel’s copy.
                    Personalise the wording below.
                  </p>
                  {templatesLoading && (
                    <p role="status">Loading saved templates…</p>
                  )}
                  {templatesError && (
                    <p role="status">
                      Saved templates unavailable: {templatesError}{' '}
                      <button type="button" onClick={onRetryTemplates}>
                        Retry
                      </button>
                      . You can still write your own copy.
                    </p>
                  )}
                  {!templatesLoading &&
                    !templatesError &&
                    !templates.some(
                      (item) => item.channel === activeChannel,
                    ) && (
                      <p className="mc-wizard-hint">
                        No saved templates for this channel yet.
                      </p>
                    )}
                  <label>
                    Headline or subject
                    <input
                      aria-label={`${CAMPAIGN_CHANNELS[activeChannel]} headline or subject`}
                      value={content.title || ''}
                      maxLength={240}
                      onChange={(event) => copy('title', event.target.value)}
                    />
                  </label>
                  <label>
                    Draft message
                    <textarea
                      aria-label={`${CAMPAIGN_CHANNELS[activeChannel]} draft message`}
                      value={content.body || ''}
                      maxLength={12000}
                      rows={7}
                      onChange={(event) => copy('body', event.target.value)}
                    />
                  </label>
                  <label>
                    Suggested timing
                    <input
                      value={content.timing || ''}
                      maxLength={240}
                      onChange={(event) => copy('timing', event.target.value)}
                      placeholder="e.g. Launch day, then follow up after 3 days"
                    />
                  </label>
                  <p className="mc-wizard-hint">
                    Copy is optional. Channel drafts can be prepared after
                    saving the campaign.
                  </p>
                </div>
              </>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <h3>Set the campaign timing</h3>
            <div className="mc-fields">
              <label className="mc-full">
                How should this campaign run?
                <select
                  value={mode}
                  onChange={(event) => {
                    const next = event.target.value
                    setMode(next)
                    setForm((old) => ({
                      ...old,
                      end_date:
                        next === 'ongoing' ? '' : old.end_date || dateAfter(30),
                    }))
                  }}
                >
                  <option value="bounded">
                    Time-bound — work towards an end date
                  </option>
                  <option value="ongoing">
                    Ongoing — keep the conversation going
                  </option>
                </select>
              </label>
              <label>
                Start date
                <input type="date" {...field('start_date')} required />
              </label>
              {mode === 'bounded' && (
                <label>
                  End date
                  <input
                    type="date"
                    {...field('end_date')}
                    min={form.start_date}
                    required
                  />
                </label>
              )}
              <label>
                Planned budget (ZAR)
                <input
                  type="number"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={form.planned_budget ?? ''}
                  onChange={(event) =>
                    setForm((old) => ({
                      ...old,
                      planned_budget: event.target.value,
                      budget_currency: 'ZAR',
                    }))
                  }
                />
              </label>
              <label>
                Cover image URL
                <input
                  type="url"
                  {...field('cover_url')}
                  maxLength={2048}
                  placeholder="https://…"
                />
              </label>
            </div>
            <p className="mc-wizard-note">
              These dates describe your plan. Saving will not schedule messages
              or enable automation; birthday triggers are not automated yet.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <h3>Review your campaign</h3>
            <p className="mc-wizard-note">{form.playbook ? playbookForChannels(form.playbook, form.planned_channels) ? `Includes ${playbookForChannels(form.playbook, form.planned_channels).steps.length} communication steps and ${form.playbook.followUp.length} follow-up actions. ` : 'Your selected channels will start a fresh playbook. ' : ''}After saving, review the response route and coordinated sequence in Playbook.</p>
            <div className="mc-wizard-review">
              <section>
                <div>
                  <h4>{form.name}</h4>
                  <button type="button" onClick={() => go(1)}>
                    Edit goal & offer
                  </button>
                </div>
                <p>{form.objective}</p>
                <dl>
                  <dt>Goal</dt>
                  <dd>{form.goal === 'custom' ? form.campaign_setup?.customGoal || CAMPAIGN_GOALS.custom : CAMPAIGN_GOALS[form.goal]}</dd>
                  {form.campaign_setup?.target && <><dt>Target</dt><dd>{form.campaign_setup.target}</dd></>}
                  <dt>Audience</dt>
                  <dd>{form.audience || 'To be defined'}</dd>
                  <dt>Offer</dt>
                  <dd>{form.offer || 'To be defined'}</dd>
                  <dt>Area</dt>
                  <dd>{form.area || 'Any area'}</dd>
                </dl>
              </section>
              <section>
                <div>
                  <h4>Channel drafts</h4>
                  <button type="button" onClick={() => go(2)}>
                    Edit channels & copy
                  </button>
                </div>
                {form.planned_channels.map((channel) => (
                  <article key={channel}>
                    <strong>{CAMPAIGN_CHANNELS[channel]}</strong>
                    <p>
                      {form.channel_content[channel]?.title ||
                        'No headline yet'}
                    </p>
                    <p className="mc-wizard-review-copy">
                      {form.channel_content[channel]?.body ||
                        'Copy can be added later.'}
                    </p>
                    {form.channel_content[channel]?.timing && (
                      <small>{form.channel_content[channel].timing}</small>
                    )}
                  </article>
                ))}
              </section>
              <section>
                <div>
                  <h4>Timing & budget</h4>
                  <button type="button" onClick={() => go(3)}>
                    Edit timing
                  </button>
                </div>
                <p>
                  {form.start_date}{' '}
                  {mode === 'ongoing'
                    ? 'onwards · Ongoing'
                    : `— ${form.end_date}`}
                </p>
                <p>
                  {form.planned_budget !== undefined &&
                  form.planned_budget !== ''
                    ? `ZAR ${Number(form.planned_budget).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : 'No budget set'}
                </p>
                {form.cover_url && (
                  <p className="mc-wizard-review-copy">
                    Cover: {form.cover_url}
                  </p>
                )}
              </section>
            </div>
            <p className="mc-wizard-note">
              Save as a draft, then prepare and link channel activity. Nothing
              is sent when you save.
            </p>
          </>
        )}
      </fieldset>
      {error && (
        <p className="mc-wizard-error" role="alert">
          {error}
        </p>
      )}
      <footer className="mc-wizard-footer">
        <button
          type="button"
          className="mc-button secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <div>
          {step > 0 && (
            <button
              type="button"
              className="mc-button secondary"
              disabled={busy}
              onClick={() => go(step - 1)}
            >
              Back
            </button>
          )}
          {step > 0 && (
            <button className="mc-button" type="submit" disabled={busy}>
              {busy ? 'Saving…' : step === 4 ? 'Create campaign' : 'Continue'}
              {!busy && step < 4 && <ArrowRight size={17} />}
            </button>
          )}
        </div>
      </footer>
    </form>
  )
}
