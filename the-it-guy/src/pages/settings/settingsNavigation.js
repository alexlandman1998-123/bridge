import {
  BadgePercent,
  Building2,
  CreditCard,
  History,
  Mail,
  Palette,
  Shield,
  UserCircle2,
  UsersRound,
} from 'lucide-react'
import { PERMISSIONS } from '../../auth/permissions/permissionRegistry'

export const SETTINGS_NAV_GROUPS = [
  {
    label: 'ACCOUNT',
    title: 'Your account',
    description: 'Personal identity and sign-in security.',
    items: [
      {
        to: '/settings/profile',
        label: 'Profile',
        description: 'Name, contact details, avatar, and workspace identity.',
        icon: UserCircle2,
        keywords: 'account personal information avatar photo job title bio language timezone preferences fields',
      },
      {
        to: '/settings/security',
        label: 'Security',
        description: 'Password and sign-in protection.',
        icon: Shield,
        keywords: 'password authentication',
      },
    ],
  },
  {
    label: 'WORKSPACE',
    title: 'Workspace',
    description: 'Organisation identity, team access, and commercial rules.',
    items: [
      {
        to: '/settings/organisation',
        label: 'Organisation',
        description: 'Company details, branches, governance, and operational defaults.',
        icon: Building2,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'company agency principal branches permissions visibility governance',
      },
      {
        to: '/settings/branding',
        label: 'Branding',
        description: 'Logos, colours, and branded workspace presentation.',
        icon: Palette,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'logo colours colors brand portal reports primary icon dark',
      },
      {
        to: '/settings/commission',
        label: 'Commission',
        description: 'Commission structures, splits, and referral rules.',
        icon: BadgePercent,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'commission splits targets referrals overrides templates finance agency performance',
      },
      {
        to: '/settings/users',
        label: 'Users',
        description: 'Invites, roles, job titles, permissions, and ownership.',
        icon: UsersRound,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageUsers,
        keywords: 'members team roles invites access permissions',
      },
    ],
  },
  {
    label: 'PLATFORM',
    title: 'Platform',
    description: 'Subscription controls and module-specific configuration.',
    items: [
      {
        to: '/settings/activity',
        label: 'Activity',
        description: 'Audited account, workspace, access, and billing changes.',
        icon: History,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'activity audit history changes users roles billing security',
      },
      {
        to: '/settings/billing',
        label: 'Billing',
        description: 'Plan, usage, invoices, and subscription requests.',
        icon: CreditCard,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        permission: PERMISSIONS.manageBilling,
        keywords: 'billing subscription invoices plan entitlements usage',
      },
      {
        to: '/settings/lead-capture',
        label: 'Lead Capture',
        description: 'Inbound addresses, routing health, and agent activation.',
        icon: Mail,
        roles: ['agent'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'lead capture forwarding addresses agent activation inbound enquiry health property24 private property website parser review queue',
      },
    ],
  },
]

export function canShowSettingsItem(item, { role, canManage, can }) {
  if (item.roles && !item.roles.includes(role)) return false
  if (item.requiresManage && !canManage) return false
  if (item.permission && !can(item.permission)) return false
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
