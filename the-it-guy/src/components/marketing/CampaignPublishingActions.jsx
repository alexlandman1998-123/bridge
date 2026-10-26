import { useEffect, useRef, useState } from 'react'
import { Copy, Download, ExternalLink } from 'lucide-react'
import { campaignChannelBriefText } from '../../services/campaignChannelBrief'
import './CampaignPublishingActions.css'

export default function CampaignPublishingActions({
  channel,
  campaign,
  onLoadBrief,
}) {
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current += 1
    },
    [],
  )
  async function act(action) {
    const token = ++request.current
    setBusy(action)
    setNotice('')
    setError('')
    try {
      const brief = await onLoadBrief(channel)
      if (token !== request.current) return
      if (action === 'download') {
        const url = URL.createObjectURL(
          new Blob([campaignChannelBriefText(brief)], {
            type: 'text/plain;charset=utf-8',
          }),
        )
        const link = document.createElement('a')
        link.href = url
        link.download = `${
          brief.campaign
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 60) || 'campaign'
        }-${channel}-brief.txt`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setNotice(
          'Publishing brief downloaded. Artwork is referenced by link; nothing has been published.',
        )
      } else {
        if (!navigator.clipboard?.writeText)
          throw new Error(
            'Clipboard unavailable. Select and copy the saved wording above, or download the brief.',
          )
        await navigator.clipboard.writeText(
          action === 'headline' ? brief.headline : brief.message,
        )
        if (token === request.current)
          setNotice(`${action === 'headline' ? 'Headline' : 'Message'} copied.`)
      }
    } catch (err) {
      if (token === request.current)
        setError(
          err.name === 'NotAllowedError'
            ? 'Clipboard unavailable. Select and copy the saved wording above, or download the brief.'
            : err.message ||
                'Could not prepare the publishing brief. Refresh and try again.',
        )
    } finally {
      if (token === request.current) setBusy('')
    }
  }
  const hasCopy = Boolean(campaign.channel_content?.[channel]?.body?.trim())
  const isAd = ['meta', 'chatgpt'].includes(channel)
  return (
    <div className="mc-publishing-actions">
      <div className="mc-publishing-heading">
        <strong>
          {isAd ? 'Prepare your ad' : 'Prepare your post'}
        </strong>
        <span>Manual publishing</span>
      </div>
      <p>
        {channel === 'chatgpt'
          ? 'Take your ad draft into ChatGPT Ads Manager. Confirm your advertiser account eligibility, creative, destination, targeting and budget there.'
          : channel === 'meta'
          ? 'Take your headline, ad copy and campaign brief into Ads Manager. Choose the ad account, audience, creative and budget there.'
          : 'Take your caption and campaign brief into your publishing tool. Add artwork and choose the account before posting.'}
      </p>
      <div className="mc-publishing-buttons">
        {isAd && (
          <button
            type="button"
            className="mc-button secondary"
            disabled={!!busy || !campaign.channel_content?.[channel]?.title?.trim()}
            onClick={() => act('headline')}
          >
            <Copy size={15} />
            Copy headline
          </button>
        )}
        <button
          type="button"
          className="mc-button secondary"
          disabled={!!busy || !hasCopy}
          onClick={() => act('message')}
        >
          <Copy size={15} />
          Copy {isAd ? 'ad copy' : 'caption'}
        </button>
        <button
          type="button"
          className="mc-button secondary"
          disabled={!!busy || !hasCopy}
          onClick={() => act('download')}
        >
          <Download size={15} />
          {busy === 'download' ? 'Preparing…' : 'Download publishing brief'}
        </button>
        <a
          className="mc-button"
          href={
            channel === 'chatgpt' ? 'https://ads.openai.com/' : channel === 'meta'
              ? 'https://adsmanager.facebook.com/'
              : 'https://business.facebook.com/latest/home'
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          Open {channel === 'chatgpt' ? 'ChatGPT Ads Manager' : channel === 'meta' ? 'Ads Manager' : 'Meta Business Suite'}
          <ExternalLink size={15} />
        </a>
      </div>
      {!hasCopy && (
        <p>
          Add and save this channel’s wording in Edit campaign to prepare the
          brief.
        </p>
      )}
      <small>
        Publishing and results are managed in your channel tool. Copying or
        downloading does not publish or mark this activity as sent.
      </small>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="mc-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
