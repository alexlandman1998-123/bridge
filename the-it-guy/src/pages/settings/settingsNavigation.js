import {
  BriefcaseBusiness,
  Building2,
  Mail,
  Palette,
  PlugZap,
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
        description: 'Manage the password for your Arch9 account.',
        icon: Shield,
        keywords: 'password authentication',
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
        to: '/settings/business-lines',
        label: 'Business Lines',
        description: 'Enable Sales, Rentals, or both for the organisation.',
        icon: BriefcaseBusiness,
        roles: ['agent'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'business lines business focus sales rentals workspace split rental agents departments',
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
    ],
  },
  {
    label: 'PLATFORM MANAGEMENT',
    title: 'Platform',
    description: 'Module-specific configuration.',
    items: [
      {
        to: '/settings/integrations',
        label: 'Integrations',
        description: 'Property portals, Meta Lead Ads, digital cards, and connected channels.',
        icon: PlugZap,
        roles: ['agent', 'developer'],
        permission: PERMISSIONS.manageWorkspaceSettings,
        keywords: 'property24 private property syndication portal publishing meta facebook instagram lead ads whatsapp digital card qr agency id agent id source reference listings integration exdev production',
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
