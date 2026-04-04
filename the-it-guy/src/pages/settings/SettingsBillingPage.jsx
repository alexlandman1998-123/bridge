import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getSubscription, listBillingInvoices } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'

function formatCurrency(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function BillingMetricCard({ title, description, items, footer }) {
  return (
    <article className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="mb-5 space-y-1 border-b border-[#edf2f7] pb-5">
        <h3 className="text-lg font-semibold text-[#162334]">{title}</h3>
        <p className="text-sm leading-6 text-[#6b7d93]">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff] px-4 py-4">
            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6]">{item.label}</span>
            <strong className="mt-2 block text-lg font-semibold text-[#162334]">{item.value}</strong>
          </div>
        ))}
      </div>
      {footer ? <div className="mt-5 flex justify-end">{footer}</div> : null}
    </article>
  )
}

export default function SettingsBillingPage() {
  const { role } = useWorkspace()
  const canView = role === 'developer'
  const [subscription, setSubscription] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!canView) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const [subscriptionResponse, invoicesResponse] = await Promise.all([getSubscription(), listBillingInvoices()])
        if (active) {
          setSubscription(subscriptionResponse)
          setInvoices(invoicesResponse)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [canView])

  if (!canView) {
    return (
      <div className={settingsPageClass}>
        <SettingsPageHeader
          kicker="Billing"
          title="Subscription and invoice history"
          description="Developer admins and billing owners can access this section."
        />
        <SettingsBanner tone="warning">Billing is restricted to developer admins in the current role model.</SettingsBanner>
      </div>
    )
  }

  if (loading || !subscription) {
    return <SettingsLoadingState label="Loading billing settings…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Billing"
        title="Subscription and invoices"
        description="Review plan details, usage, renewal timing, and historic invoices."
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <BillingMetricCard
          title="Current plan"
          description="Current commercial subscription for this organisation."
          items={[
            { label: 'Plan', value: subscription.planName },
            { label: 'Billing', value: subscription.billingType },
            { label: 'Amount', value: formatCurrency(subscription.monthlyAmount) },
            {
              label: 'Renewal',
              value: subscription.renewalDate ? new Date(subscription.renewalDate).toLocaleDateString() : 'Not set',
            },
            { label: 'Included developments', value: subscription.includedDevelopments },
            { label: 'Included users', value: subscription.includedUsers },
          ]}
        />

        <BillingMetricCard
          title="Usage summary"
          description="Current portfolio usage against the live subscription."
          items={[
            { label: 'Active developments', value: subscription.activeDevelopments },
            { label: 'Active users', value: subscription.activeUsers },
            { label: 'Status', value: subscription.status },
            {
              label: 'Payment method',
              value: subscription.paymentMethodLast4 ? `•••• ${subscription.paymentMethodLast4}` : 'Not configured',
            },
          ]}
          footer={
            <Button type="button" variant="secondary">
              Contact Support
            </Button>
          }
        />
      </section>

      <SettingsSectionCard title="Billing history" description="Historic invoice list for the current organisation subscription.">
        {!invoices.length ? (
          <SettingsEmptyState
            title="No billing invoices available yet"
            description="Invoices will appear here once billing records are added."
          />
        ) : (
          <div className={settingsTableClass}>
            <div className="hidden grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] md:grid">
              <span>Invoice</span>
              <span>Issued</span>
              <span>Status</span>
              <span>Amount</span>
              <span>Paid</span>
            </div>
            <div className="divide-y divide-[#e9eff5]">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.8fr] md:items-center md:gap-4">
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Invoice</span>
                    <strong className="text-sm text-[#162334]">{invoice.invoiceNumber}</strong>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Issued</span>
                    <span className="text-sm text-[#51657b]">{invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Status</span>
                    <span className="inline-flex rounded-full border border-[#d7e3ef] bg-white px-3 py-1 text-xs font-semibold capitalize text-[#51657b]">
                      {invoice.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Amount</span>
                    <span className="text-sm font-semibold text-[#162334]">{formatCurrency(invoice.amount)}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Paid</span>
                    <span className="text-sm text-[#51657b]">{invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingsSectionCard>
    </div>
  )
}
