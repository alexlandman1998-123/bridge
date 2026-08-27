import { MessageCircle, PhoneCall } from 'lucide-react'
import { Link } from 'react-router-dom'

function navigationGroups(groups = [], items = []) {
  if (Array.isArray(groups) && groups.length) return groups
  return [{ label: '', items: Array.isArray(items) ? items : [] }]
}

export function BuyerPortalNavigationItem({ item, active = false, path = '#', status = '', theme }) {
  const Icon = item.icon
  return (
    <Link
      to={path}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-[46px] items-center gap-3 rounded-[12px] border px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'border-white/30 bg-white/15 text-white'
          : 'border-transparent text-white/75 hover:bg-white/10 hover:text-white'
      }`}
      style={active ? theme?.activeNavigationStyle : undefined}
    >
      {Icon ? <Icon size={17} /> : null}
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-normal [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
        {item.label}
      </span>
      {status ? (
        <span className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${
          active ? 'border-white/40 bg-white/15 text-white' : 'border-white/15 bg-black/15 text-white/75'
        }`}>
          {status}
        </span>
      ) : null}
    </Link>
  )
}

export function BuyerPortalSupportPanel({ contact = {}, copy = '' }) {
  const resolvedCopy = copy || contact?.name || contact?.title || 'Your team is available.'
  return (
    <section className="rounded-[18px] border border-white/20 bg-white/10 p-4 text-white">
      <p className="text-sm font-semibold text-white">Need help?</p>
      <p className="mt-1 text-xs leading-5 text-white/75">{resolvedCopy}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {contact?.email ? (
          <a href={`mailto:${contact.email}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-white/15 text-xs font-semibold text-white transition hover:bg-white/20">
            <MessageCircle size={14} />
            Email
          </a>
        ) : null}
        {contact?.phone ? (
          <a href={`tel:${contact.phone}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-white/15 text-xs font-semibold text-white transition hover:bg-white/10">
            <PhoneCall size={14} />
            Call
          </a>
        ) : null}
      </div>
    </section>
  )
}

export default function BuyerPortalDesktopSidebar({
  brandName = 'Buyer Portal',
  brandLogoUrl = '',
  brandDescriptor = 'Your purchase',
  theme,
  groups = [],
  items = [],
  activeItemKey = 'overview',
  isItemActive,
  getItemPath,
  statusByKey = {},
  supportContact = {},
  supportCopy = '',
  headerControls = null,
  footerDescriptor = '',
}) {
  const resolvedGroups = navigationGroups(groups, items).filter((group) => Array.isArray(group?.items) && group.items.length)

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col overflow-y-auto px-6 py-6 text-white lg:flex"
      style={theme?.sidebarStyle}
      data-buyer-portal-shell="desktop-sidebar"
    >
      <div className="border-b border-white/10 pb-5">
        <div className="min-h-[56px]">
          {brandLogoUrl ? (
            <img src={brandLogoUrl} alt={`${brandName} logo`} className="max-h-14 max-w-[190px] object-contain object-left" />
          ) : (
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white">{brandName}</h1>
          )}
        </div>
        <p className="mt-3 text-sm font-medium text-white/70">{brandDescriptor}</p>
        {headerControls}
      </div>

      <nav className="mt-6 grid gap-5" aria-label="Buyer portal">
        {resolvedGroups.map((group, groupIndex) => (
          <div key={group.label || `buyer-navigation-${groupIndex}`}>
            {group.label ? (
              <p className="mb-2 px-1 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white/55">{group.label}</p>
            ) : null}
            <div className="grid gap-2">
              {group.items.map((item) => {
                const active = typeof isItemActive === 'function' ? isItemActive(item) : item.key === activeItemKey
                const status = statusByKey[item.key]
                return (
                  <BuyerPortalNavigationItem
                    key={item.key}
                    item={item}
                    active={active}
                    path={typeof getItemPath === 'function' ? getItemPath(item) : item.to || '#'}
                    status={status}
                    theme={theme}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-6">
        <BuyerPortalSupportPanel contact={supportContact} copy={supportCopy} />
        <div className="px-1 pb-1 pt-4 text-xs leading-5 text-white/70">
          <p className="font-semibold text-white">{brandName}</p>
          {footerDescriptor ? <p>{footerDescriptor}</p> : null}
        </div>
      </div>
    </aside>
  )
}
