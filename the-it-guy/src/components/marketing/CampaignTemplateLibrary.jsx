import { useState } from 'react'
import {
  ArrowRight,
  Plus,
  Search,
  LayoutGrid,
  House,
  KeyRound,
  Megaphone,
  PartyPopper,
  Layers,
  CircleCheck,
} from 'lucide-react'
import { CAMPAIGN_CHANNELS } from '../../services/marketingCampaignService'
import { displayTemplate } from '../../services/marketingCampaignTemplates'
import {
  CAMPAIGN_CATEGORIES,
  campaignShopTemplates,
  campaignTemplateCategory,
  matchesCampaignTemplate,
} from '../../services/marketingCampaignCatalogue'
import CampaignPlatformLogo from './CampaignPlatformLogo'
import CampaignShopPreview from './CampaignShopPreview'

const categoryIcons = {
  house: House,
  key: KeyRound,
  search: Search,
  megaphone: Megaphone,
  celebration: PartyPopper,
}

export default function CampaignTemplateLibrary({
  saved = [],
  loading,
  error,
  onRetry,
  onUse,
  onCreate,
  onEdit,
  userId,
  canShare,
  initialFilter = 'ready',
}) {
  const [filter, setFilter] = useState(initialFilter)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const available =
    filter === 'ready'
      ? campaignShopTemplates
      : saved
          .filter((row) =>
            filter === 'agency'
              ? row.visibility === 'agency'
              : row.visibility === 'personal' && row.created_by === userId,
          )
          .map(displayTemplate)
  const filtered = available.filter((item) =>
    matchesCampaignTemplate(item, { category, search }),
  )
  const unavailable = filter !== 'ready' && error
  return (
    <section
      className="mc-library mc-panel"
      aria-labelledby="mc-library-heading"
    >
      <header className="mc-library-heading">
        <div className="mc-library-intro">
          <h1 id="mc-library-heading">Campaign &amp; Automation Templates</h1>
        </div>
        <button className="mc-button mc-primary" onClick={() => onCreate()}>
          <Plus size={17} /> Create template
        </button>
      </header>
      <div className="mc-library-filters">
        <div className="mc-campaign-heading">
          <nav className="mc-mode-filters" aria-label="Template library">
            {[
              ['ready', 'Ready-made'],
              ['personal', 'My templates'],
              ['agency', 'Agency templates'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value)
                  setCategory('all')
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <label className="mc-search">
            <Search size={17} />
            <input
              aria-label="Search templates"
              placeholder="Try “just sold” or “buyers”…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <nav className="mc-shop-categories" aria-label="Campaign categories">
          <button
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            <LayoutGrid size={16} aria-hidden="true" /> All categories
          </button>
          {CAMPAIGN_CATEGORIES.map((item) => {
            const Icon = categoryIcons[item.icon]
            return (
              <button
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
      {filter !== 'ready' && error && (
        <div role="alert" className="mc-error">
          {error}{' '}
          <button className="mc-text-button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {unavailable ? null : filter !== 'ready' && loading ? (
        <p role="status">Loading saved templates…</p>
      ) : (
        <>
          <div className="mc-library-grid">
            {filtered.map((template) => (
              <article key={template.id} className="mc-library-card">
                <CampaignShopPreview
                  template={template}
                  category={campaignTemplateCategory(template)}
                />
                <div className="mc-shop-card-body">
                  <div className="mc-shop-card-meta">
                    <span className="mc-shop-category-label">
                      {CAMPAIGN_CATEGORIES.find(
                        (item) =>
                          item.id === campaignTemplateCategory(template),
                      )?.label || 'Custom objective'}
                    </span>
                    <span className="mc-shop-duration">
                      {template.mode === 'ongoing'
                        ? 'Ongoing'
                        : `${template.duration_days || 30} day plan`}
                    </span>
                  </div>
                  <h2>{template.title}</h2>
                  <p>{template.description}</p>
                  <div
                    className="mc-template-tools"
                    aria-label="Campaign channels"
                  >
                    {template.channels.map((channel) => (
                      <span className="mc-platform-badge" key={channel}>
                        <CampaignPlatformLogo channel={channel} />
                        {CAMPAIGN_CHANNELS[channel]}
                      </span>
                    ))}
                  </div>
                  <details className="mc-shop-details">
                    <summary>
                      Explore campaign <span aria-hidden="true">+</span>
                    </summary>
                    <div className="mc-shop-details-content">
                      {template.setupHint && (
                        <small className="mc-shop-setup">
                          <CircleCheck size={14} aria-hidden="true" />
                          {template.setupHint}
                        </small>
                      )}
                      {Object.keys(template.channel_content || {}).length >
                        0 && (
                        <small>Includes editable channel draft content</small>
                      )}
                      {template.tags?.length > 0 && (
                        <ul className="mc-shop-tags" aria-label="Campaign tags">
                          {template.tags.map((tag) => (
                            <li key={tag}>{tag}</li>
                          ))}
                        </ul>
                      )}
                      {template.cta && (
                        <p className="mc-shop-cta">
                          <span>Suggested action</span>
                          {template.cta}
                        </p>
                      )}
                      {template.plannedAssets && (
                        <details className="mc-shop-assets">
                          <summary>
                            <Layers size={14} aria-hidden="true" />
                            Pack checklist · {template.plannedAssets.length} asset
                            types
                          </summary>
                          <ul>
                            {template.plannedAssets.map((asset) => (
                              <li key={asset}>{asset}</li>
                            ))}
                          </ul>
                          <small>
                            Asset generation and downloads are not available
                            yet.
                          </small>
                        </details>
                      )}
                    </div>
                  </details>
                </div>
                <footer>
                  <button
                    className="mc-button mc-primary"
                    onClick={() => onUse(template, filter === 'ready')}
                  >
                    Use template <ArrowRight size={16} />
                  </button>
                  {filter === 'ready' ? (
                    <button
                      className="mc-text-button"
                      onClick={() => onCreate(template)}
                    >
                      Customise template
                    </button>
                  ) : (
                    (template.visibility === 'personal'
                      ? template.created_by === userId
                      : canShare) && (
                      <button
                        className="mc-text-button"
                        onClick={() => onEdit(template.id)}
                      >
                        Edit template
                      </button>
                    )
                  )}
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
      {!filtered.length && (filter === 'ready' || !loading) && !unavailable && (
        <div className="mc-empty">
          <h2>
            {search || category !== 'all'
              ? 'No matching templates'
              : filter === 'agency'
                ? 'Your agency playbooks belong here'
                : 'Save your first template'}
          </h2>
          <p>
            {search || category !== 'all'
              ? 'Try another search or category.'
              : 'Create a reusable plan or save one from an existing campaign.'}
          </p>
          {(search || category !== 'all') && (
            <button
              className="mc-text-button"
              onClick={() => {
                setSearch('')
                setCategory('all')
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {filter === 'agency' && !canShare && (
        <p className="mc-note">
          Agency administrators can publish shared templates. You can create
          your own under My templates.
        </p>
      )}
    </section>
  )
}
