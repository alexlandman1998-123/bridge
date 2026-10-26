import { Mail, MessageSquare, Share2 } from 'lucide-react'
export default function CampaignPlatformLogo({ channel }) {
  return (
    <span className="mc-platform-logo">
      {channel === 'email' ? (
        <Mail size={19} aria-hidden="true" />
      ) : channel === 'chatgpt' ? (
        <MessageSquare size={19} aria-hidden="true" />
      ) : channel === 'social' ? (
        <Share2 size={19} aria-hidden="true" />
      ) : (
        <img
          src={
            channel === 'meta'
              ? '/brand/marketing/meta.svg'
              : '/lead-sources/whatsapp.svg'
          }
          width="20"
          height="20"
          alt=""
        />
      )}
    </span>
  )
}
