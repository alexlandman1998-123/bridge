import { Building2, CalendarDays, CircleHelp, CreditCard, FileText, Home, MessageCircle, ReceiptText, Settings, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import BuyerPortalDesktopSidebar from '../client-portal/BuyerPortalDesktopSidebar'
import { BuyerMobileBottomNavigation, BuyerMobileHeader, BuyerMobilePropertyHero } from '../client-portal/BuyerMobileChrome'
import { createBuyerPortalTheme } from '../client-portal/buyerPortalTheme'

const tenantItems = [
  { key: 'overview', label: 'Home', mobileLabel: 'Home', icon: Home },
  { key: 'payments', label: 'Payments', mobileLabel: 'Pay', icon: CreditCard },
  { key: 'maintenance', label: 'Maintenance', mobileLabel: 'Repairs', icon: Wrench },
  { key: 'inspections', label: 'Inspections', mobileLabel: 'Checks', icon: CalendarDays },
  { key: 'documents', label: 'Documents', mobileLabel: 'Docs', icon: FileText },
  { key: 'messages', label: 'Messages', mobileLabel: 'Messages', icon: MessageCircle },
  { key: 'lease', label: 'My lease', mobileLabel: 'Lease', icon: ReceiptText },
  { key: 'support', label: 'Support', mobileLabel: 'Help', icon: CircleHelp },
]

const landlordItems = [
  { key: 'overview', label: 'Overview', mobileLabel: 'Home', icon: Home, description: 'Portfolio health: rent collected, occupancy, arrears, approvals and recent activity.' },
  { key: 'properties', label: 'My properties', mobileLabel: 'Homes', icon: Building2, description: 'Every property and unit, including occupied, vacant, maintenance and action-required filters.' },
  { key: 'rent', label: 'Rent & statements', mobileLabel: 'Rent', icon: CreditCard, description: 'Rent roll, payment status, owner statements, disbursements, invoices and financial documents.' },
  { key: 'maintenance', label: 'Maintenance', mobileLabel: 'Repairs', icon: Wrench, description: 'Repairs across the portfolio, quotes awaiting approval, appointments and completed work.' },
  { key: 'documents', label: 'Documents', mobileLabel: 'Docs', icon: FileText, description: 'Lease agreements, inspection reports, statements, property documents, quotes and approved invoices.' },
  { key: 'messages', label: 'Messages', mobileLabel: 'Messages', icon: MessageCircle, description: 'Conversations with the rental team, linked to the relevant property.' },
  { key: 'settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings, description: 'Contact details, notifications, banking and disbursement details, and account access.' },
  { key: 'support', label: 'Support', mobileLabel: 'Help', icon: CircleHelp, description: 'Help centre and escalation or contact options.' },
]

const groupsFor = (role) => role === 'landlord'
  ? [{ label: 'Home', items: landlordItems.slice(0, 1) }, { label: 'Portfolio', items: landlordItems.slice(1, 5) }, { label: 'Account', items: landlordItems.slice(5) }]
  : [{ label: 'Home', items: tenantItems.slice(0, 1) }, { label: 'Your tenancy', items: tenantItems.slice(1, 6) }, { label: 'Account', items: tenantItems.slice(6) }]

export function rentalPortalItems(role = 'tenant') { return role === 'landlord' ? landlordItems : tenantItems }

export default function RentalClientPortalShell({ role = 'tenant', activeKey = 'overview', property = {}, subtitle = '', branding = {}, showPropertyHero = true, children }) {
  const items = rentalPortalItems(role)
  const theme = createBuyerPortalTheme({
    primaryColour: branding.primaryColour || '#071E1A',
    secondaryColour: branding.secondaryColour || branding.primaryColour || '#031011',
    accentColour: branding.accentColour || '#64B992',
  })
  const roleLabel = role === 'landlord' ? 'Landlord portal' : 'Tenant portal'
  const brandName = branding.agencyName || 'Arch9 Rentals'
  const brandLogoUrl = branding.logoDarkUrl || branding.logoUrl || branding.logoLightUrl || ''
  const propertyName = property?.name || (role === 'landlord' ? 'Your properties' : 'Your home')
  const address = [property?.address_line_1, property?.suburb, property?.city].filter(Boolean).join(', ')
  const pathFor = (item) => `?section=${item.key}`

  return <div className="min-h-screen bg-[#f7f7f8] text-[#101823]">
    <BuyerPortalDesktopSidebar
      brandName={brandName}
      brandLogoUrl={brandLogoUrl}
      brandDescriptor={roleLabel}
      theme={theme}
      groups={groupsFor(role)}
      activeItemKey={activeKey}
      getItemPath={pathFor}
      supportContact={{}}
      supportCopy={role === 'landlord' ? 'Your rentals team is here to help with your portfolio.' : 'Your rentals team is here to help with your property and tenancy.'}
      footerDescriptor="Secure client workspace"
    />
    <main className="mx-auto w-full max-w-[1640px] px-4 pb-20 pt-4 sm:px-5 sm:pt-5 lg:ml-[264px] lg:w-[calc(100%-264px)] lg:px-8 lg:pb-8 lg:pt-7">
      <div className="lg:hidden"><BuyerMobileHeader brand={theme} logoUrl={brandLogoUrl} brandName={brandName} homePath="?section=overview" /></div>
      {showPropertyHero ? <BuyerMobilePropertyHero theme={theme} imageAlt={propertyName} className="min-h-[210px] lg:min-h-[250px]">
        <div className="flex min-h-[210px] flex-col justify-end p-5 sm:p-7 lg:min-h-[250px] lg:p-8">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white/70">{roleLabel}</p>
          <h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-[-0.045em] text-white sm:text-3xl">{propertyName}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{address || subtitle || 'Your secure rental workspace.'}</p>
          {subtitle && address ? <p className="mt-1 text-sm text-white/70">{subtitle}</p> : null}
        </div>
      </BuyerMobilePropertyHero> : null}
      <section className="mt-5 lg:mt-7">{children}</section>
    </main>
    <BuyerMobileBottomNavigation items={items} activeKey={activeKey} getPath={pathFor} activeStyle={theme.activeNavigationStyle} />
    <footer className="pb-6 pl-4 pr-4 text-center text-xs text-[#7b8491] lg:ml-[264px]">Secure access · Arch9 Rentals</footer>
  </div>
}
