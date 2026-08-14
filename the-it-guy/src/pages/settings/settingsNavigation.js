import {
  Building2,
  CreditCard,
  FileText,
  History,
  Mail,
  Megaphone,
  Palette,
  Shield,
  UserCircle2,
  UsersRound,
} from 'lucide-react'
import { PERMISSIONS } from '../../auth/permissions/permissionRegistry'

export const SETTINGS_NAV_GROUPS = [
  {
    label: 'YOUR ACCOUNT',
    title: 'Your account',
    description: 'Personal identity and sign-in security.',
    items: [
      {
        to: '/settings/profile',
        label: 'Profile',
        description: 'Personal information, contact details, avatar, and preferences.',
        icon: UserCircle2,
        keywords: 'account personal information avatar photo job title bio language timezone preferences fields',
        status: { tone: 'success', label: 'Profile complete' },
      },
      {
        to: '/settings/security',
        label: 'Security',
        description: 'Passwords, authentication, sessions, and recovery methods.',
        icon: Shield,
        keywords: 'password authentication',
        status: { tone: 'warning', label: 'Two-factor authentication not enabled' },
      },
    ],
  },
  {
    label: 'ORGANISATION',
    title: 'Organisation',
    description: 'Workspace behaviour, identity, access, and platform controls.',
    items: [
      {
        to: '/settings/organisation',
        label: 'Organisation',
        description: 'Organisation details, offices, branches, and contact details.',
        icon: Building2,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'company agency attorney modules bond cancellation principal branches permissions visibility governance',
      },
      {
        to: '/settings/branding',
        label: 'Branding',
        description: 'Logos, colours, email branding, and portal branding.',
        icon: Palette,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'logo colours colors brand portal reports primary icon dark',
        status: { tone: 'success', label: 'Logo and colours configured' },
      },
      {
        to: '/settings/branding#public-intake',
        label: 'Public Intake',
        description: 'Publish buyer and seller intake links for social media and listing enquiries.',
        icon: Megaphone,
        roles: ['developer', 'agent'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'public intake buyer seller social media link enquiries crm lead capture agency website instagram facebook qr',
      },
      {
        to: '/settings/legal-templates',
        label: 'Legal Templates',
        description: 'Manage, save, preview, and publish the legal templates used for documents.',
        icon: FileText,
        roles: ['developer', 'agent'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'legal templates document builder signing documents contracts mandate otp publish save wording clauses',
      },
      {
        to: '/settings/communications/templates',
        label: 'Communications',
        description: 'Preview client-facing email templates and manage communications copy.',
        icon: Mail,
        roles: ['developer', 'agent'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'communications email templates preview buyer seller viewing appointment valuation notifications',
      },
      {
        to: '/settings/roles',
        label: 'Roles & Permissions',
        description: 'User roles, permission groups, and access control.',
        icon: UsersRound,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageUsers,
        keywords: 'users members team roles invites access permissions',
        status: { tone: 'neutral', label: 'Roles configured' },
      },
      {
        to: '/settings/activity',
        label: 'Activity',
        description: 'Audit logs, user activity, security events, and organisation events.',
        icon: History,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'activity audit history changes users roles billing security',
      },
    ],
  },
  {
    label: 'PLATFORM MANAGEMENT',
    title: 'Platform',
    description: 'Subscription controls and module-specific configuration.',
    items: [
      {
        to: '/settings/billing',
        label: 'Billing',
        description: 'Subscription, invoices, payment methods, and usage.',
        icon: CreditCard,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageBilling,
        keywords: 'billing subscription invoices plan entitlements usage',
        status: { tone: 'success', label: 'Subscription active' },
      },
      {
        to: '/settings/lead-capture',
        label: 'Lead Capture',
        description: 'Inbound addresses, digital cards, routing health, and agent activation.',
        icon: Mail,
        roles: ['agent'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'lead capture forwarding addresses agent activation inbound enquiry health property24 private property website parser review queue digital card qr business card',
      },
    ],
  },
]

export function canShowSettingsItem(item, { role, canManage, can }) {
  if (item.roles && !item.roles.includes(role)) return false
  if (item.requiresManage && !canManage) return false
  if (item.permission && typeof can === 'function' && !can(item.permission)) return false
  return true
}

export function buildVisibleSettingsGroups({ role, canManage, can }) {
  return SETTINGS_NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canShowSettingsItem(item, { role, canManage, can })),
    }))
    .filter((group) => group.items.length)
}
