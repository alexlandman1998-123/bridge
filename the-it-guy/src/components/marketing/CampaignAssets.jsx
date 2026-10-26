import { PROPERTY_CAMPAIGNS } from '../../services/listingCampaignContract'
import {
  GENERAL_CAMPAIGNS,
  generalTemplate,
} from '../../services/generalCampaignModel'
import { useEffect, useRef, useState } from 'react'
import { Download, Images, Mail, MessageCircle, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  loadCampaignPack,
  handoffCampaignDraft,
} from '../../services/campaignPackService'
import {
  generateCampaignPack,
  campaignPackZip,
  downloadCampaignAsset,
} from '../../services/campaignPackRenderer'
import './CampaignAssets.css'

export default function CampaignAssets({
  campaign,
  organisationId,
  userId,
  canEdit,
  activities = [],
  onEdit,
  onLinked,
}) {
  const family = campaign.campaign_builder
    ? generalTemplate(campaign.campaign_builder.template)?.title || 'Campaign'
    : campaign.listing_builder?.version === 2
      ? PROPERTY_CAMPAIGNS[campaign.listing_builder.template]?.title ||
        'Property campaign'
      : 'Just Listed'
  const collection =
    campaign.listing_builder?.template === 'property-collection'
  const general = Boolean(campaign.campaign_builder)
  const templateId =
    campaign.campaign_builder?.template || campaign.listing_builder?.template
  const config = general
    ? GENERAL_CAMPAIGNS[templateId]
    : PROPERTY_CAMPAIGNS[templateId]
  const packDescription = config
    ? [
        templateId === 'review-request'
          ? 'Optional review-link graphic · Email and WhatsApp only'
          : `${family} post`,
        config.carousel ? `${config.carousel}-slide carousel` : '',
        config.stories
          ? `${config.stories} ${config.stories === 1 ? 'story' : 'stories'}`
          : '',
        templateId === 'key-handover'
          ? 'Buyer and seller celebration variants'
          : '',
        ['just-sold', 'buyer-demand'].includes(templateId)
          ? 'Digital neighbourhood flyer'
          : '',
        ['thinking-of-selling', 'first-time-buyer'].includes(templateId)
          ? 'Downloadable checklist (.txt)'
          : '',
        templateId === 'meet-your-agent' ? 'Biography (.txt)' : '',
        'Channel copy and follow-ups',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const [assets, setAssets] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [nameOnly, setNameOnly] = useState(false)
  const [created, setCreated] = useState({})
  const request = useRef(0)
  const urls = useRef([])
  useEffect(
    () => () => {
      request.current += 1
      urls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    [],
  )
  async function act(label, callback) {
    const token = ++request.current
    setBusy(label)
    setError('')
    setNotice('')
    try {
      await callback(token)
    } catch (err) {
      if (request.current === token)
        setError(err.message || 'Unable to prepare this campaign. Try again.')
    } finally {
      if (request.current === token) setBusy('')
    }
  }
  const current = (token) => request.current === token
  function prepare() {
    return act('Preparing artwork…', async (token) => {
      const pack = await loadCampaignPack(organisationId, userId, campaign)
      const result = await generateCampaignPack(pack, { nameOnly })
      await loadCampaignPack(organisationId, userId, campaign)
      if (!current(token)) return
      urls.current.forEach((url) => URL.revokeObjectURL(url))
      const prepared = result.map((asset) => ({
        ...asset,
        ...(asset.width ? { url: URL.createObjectURL(asset.blob) } : {}),
      }))
      urls.current = prepared.map((asset) => asset.url).filter(Boolean)
      setAssets(prepared)
      setNotice(
        pack.general
          ? 'Your pack is ready. It uses saved agency branding and the public portrait for agent introductions. Review each design before sharing. Artwork may shorten text; complete wording and any checklist are included as text files.'
          : `Your pack is ready. It uses ${pack.members ? pack.members.reduce((count, item) => count + item.images.length, 0) : pack.images.length} approved listing photos; photos repeat where needed. Area-only teasers use agency branding. Review each design before sharing. Artwork text may be shortened to fit; full wording is included in the text files.`,
      )
    })
  }
  function download(asset) {
    return act('Checking current details…', async (token) => {
      const pack = await loadCampaignPack(organisationId, userId, campaign)
      if (
        (!asset || asset.width) &&
        !pack.allowNoPhoto &&
        (pack.members
          ? pack.members.some((item) => !item.images.length)
          : !pack.images.length)
      )
        throw new Error(
          'The saved cover photo is no longer available. Refresh and save the campaign before downloading artwork.',
        )
      const blob = asset ? asset.blob : await campaignPackZip(assets)
      if (!current(token)) return
      downloadCampaignAsset(
        blob,
        asset?.filename ||
          `${general ? 'campaign' : 'property-campaign'}-${campaign.id.slice(0, 8)}-r${campaign.revision}.zip`,
      )
      setNotice('Download prepared. Review the assets before sharing.')
    })
  }
  function handoff(channel) {
    return act(
      `Preparing ${channel === 'email' ? 'email' : 'WhatsApp'} draft…`,
      async (token) => {
        const result = await handoffCampaignDraft(
          organisationId,
          userId,
          campaign,
          channel,
        )
        if (!current(token)) return
        setCreated((previous) => ({ ...previous, [channel]: result }))
        await onLinked?.()
        if (!current(token)) return
        setNotice(
          result.status === 'draft'
            ? 'Channel draft saved and linked. Open it to review the sender, audience and wording. Nothing has been sent or scheduled.'
            : 'Existing channel campaign linked. Open it to view its current status.',
        )
      },
    )
  }
  return (
    <section
      className="cp-workspace"
      aria-label="Campaign assets and drafts"
      aria-busy={Boolean(busy)}
    >
      <header className="cp-heading">
        <Images size={25} />
        <div>
          <h2>Your {family} pack</h2>
          <p>Branded artwork and channel drafts, using this saved campaign.</p>
        </div>
      </header>
      {error && (
        <div className="mc-error" role="alert">
          <p>{error}</p>
          {canEdit && (
            <button className="mc-button" onClick={onEdit}>
              Edit campaign details
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="cp-notice" role="status">
          {notice}
        </p>
      )}
      {!canEdit ? (
        <p>
          The campaign owner or an agency administrator can prepare its assets
          and channel drafts.
        </p>
      ) : (
        <>
          <section className="mc-panel">
            <h3>Download your campaign pack</h3>
            <p>
              {general || campaign.listing_builder?.version === 2
                ? collection
                  ? 'A carousel slide and story per property · Email roundup · WhatsApp introduction'
                  : packDescription
                : '1 photo post · 5 carousel slides · 2 stories · Social, email and WhatsApp copy · Enquiry reply'}
            </p>
            <p className="mc-note">
              Square designs: 1080 × 1080. Stories: 1080 × 1920. Files download
              to your device.
            </p>
            <label className="cp-choice">
              <input
                type="checkbox"
                checked={nameOnly}
                disabled={Boolean(busy)}
                onChange={(event) => setNameOnly(event.target.checked)}
              />
              Use agency-name branding instead of a logo
            </label>
            <div className="cp-actions">
              <button
                className="mc-button mc-primary"
                disabled={Boolean(busy)}
                onClick={prepare}
              >
                {assets.length ? <RefreshCw size={16} /> : <Images size={16} />}
                {assets.length ? 'Rebuild artwork' : 'Prepare artwork'}
              </button>
              {assets.length > 0 && (
                <button
                  className="mc-button"
                  disabled={Boolean(busy)}
                  onClick={() => download()}
                >
                  <Download size={16} />
                  Download full pack (.zip)
                </button>
              )}
            </div>
            {busy && <p role="status">{busy}</p>}
            <div className="cp-assets">
              {assets.map((asset) => (
                <article className="cp-asset" key={asset.id}>
                  {asset.url && (
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Preview ${asset.label}`}
                    >
                      <img src={asset.url} alt={asset.label} />
                    </a>
                  )}
                  <div>
                    <strong>{asset.label}</strong>
                    {asset.width && (
                      <small>
                        {asset.width} × {asset.height} PNG
                      </small>
                    )}
                    <button
                      className="mc-button"
                      disabled={Boolean(busy)}
                      onClick={() => download(asset)}
                    >
                      <Download size={15} />
                      Download
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className="mc-panel">
            <h3>Continue in a channel</h3>
            <p>
              Choose a sender and audience in the channel tool, then review
              before sending.
            </p>
            <div className="cp-channels">
              {['email', 'whatsapp'].map((channel) => {
                const linked = activities.filter(
                  (item) =>
                    item.channel === channel &&
                    item.campaign_id === campaign.id,
                )
                const saved = created[channel]
                const Icon = channel === 'email' ? Mail : MessageCircle
                return (
                  <article key={channel}>
                    <Icon size={24} />
                    <h4>{channel === 'email' ? 'Email' : 'WhatsApp'}</h4>
                    <p>
                      {channel === 'email'
                        ? 'Your editable email copy and agency colours. Add a downloaded image through the email image library if you want one.'
                        : 'Your suggested wording. Choose an approved template and use its available message fields.'}
                    </p>
                    {saved ? (
                      <Link
                        className="mc-button mc-primary"
                        to={`/marketing?section=${channel}&view=${saved.status === 'draft' ? 'create' : 'detail'}&id=${encodeURIComponent(saved.id)}`}
                      >
                        Open {channel === 'email' ? 'email' : 'WhatsApp'}{' '}
                        {saved.status === 'draft' ? 'draft' : 'campaign'}
                      </Link>
                    ) : (
                      <button
                        className="mc-button"
                        disabled={Boolean(busy)}
                        onClick={() => handoff(channel)}
                      >
                        Create {channel === 'email' ? 'email' : 'WhatsApp'}{' '}
                        draft
                      </button>
                    )}
                    {linked.map((item) => (
                      <Link
                        key={item.id}
                        className="mc-text-button"
                        to={`/marketing?section=${channel}&view=detail&id=${encodeURIComponent(item[`${channel}_campaign_id`])}`}
                      >
                        Open linked campaign
                      </Link>
                    ))}
                  </article>
                )
              })}
            </div>
            <p className="mc-note">
              Creating a draft does not send, schedule, upload listing photos or
              publish anything. Repeating the action reopens the same draft for
              this saved campaign revision.
            </p>
          </section>
        </>
      )}
    </section>
  )
}
