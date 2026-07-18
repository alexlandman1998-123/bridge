import { normalizeText } from "../utils/text.ts";

export type NotificationAutomationCategory =
  | "standard_email"
  | "notification"
  | "reminder";

export type NotificationAutomationDefinition = {
  key: string;
  displayName: string;
  category: NotificationAutomationCategory;
  triggerType: "manual_send" | "system_event" | "scheduled_reminder";
  recipientRole: string;
  implementationStatus: "active" | "planned" | "disabled";
  defaultEnabled: boolean;
  communicationTypes: string[];
  roleTypes: string[];
  reminderPolicy?: {
    cadenceDays: number[];
    stopWhen: string;
    quietHours?: {
      enabled: boolean;
      timezone: string;
      startHour: number;
      endHour: number;
    };
    escalation?: {
      enabled: boolean;
      afterDay: number;
      recipientRole: string;
      label: string;
    };
  } | null;
};

export const NOTIFICATION_AUTOMATION_KEYS = {
  BUYER_ONBOARDING_SENT: "buyer_onboarding_sent",
  SELLER_ONBOARDING_SENT: "seller_onboarding_sent",
  BUYER_PORTAL_SENT: "buyer_portal_sent",
  SELLER_PORTAL_SENT: "seller_portal_sent",
  ATTORNEY_INVITE_SENT: "attorney_invite_sent",
  BOND_ORIGINATOR_INVITE_SENT: "bond_originator_invite_sent",
  AGENT_INVITE_SENT: "agent_invite_sent",
  BUYER_ONBOARDING_SUBMITTED: "buyer_onboarding_submitted",
  SELLER_ONBOARDING_SUBMITTED: "seller_onboarding_submitted",
  ATTORNEY_INVITE_ACCEPTED: "attorney_invite_accepted",
  BOND_ORIGINATOR_INVITE_ACCEPTED: "bond_originator_invite_accepted",
  AGENT_INVITE_ACCEPTED: "agent_invite_accepted",
  BUYER_ONBOARDING_REMINDER: "buyer_onboarding_reminder",
  SELLER_ONBOARDING_REMINDER: "seller_onboarding_reminder",
  SELLER_DOCUMENT_REQUESTED: "seller_document_requested",
  SELLER_DOCUMENT_REQUEST_REMINDER: "seller_document_request_reminder",
  SELLER_DOCUMENT_REQUEST_ESCALATION: "seller_document_request_escalation",
  ATTORNEY_INVITE_REMINDER: "attorney_invite_reminder",
  BOND_ORIGINATOR_INVITE_REMINDER: "bond_originator_invite_reminder",
  AGENT_INVITE_REMINDER: "agent_invite_reminder",
} as const;

function definition(
  input: NotificationAutomationDefinition,
): NotificationAutomationDefinition {
  return Object.freeze({
    ...input,
    communicationTypes: [...input.communicationTypes],
    roleTypes: [...input.roleTypes],
    reminderPolicy: input.reminderPolicy
      ? {
        ...input.reminderPolicy,
        cadenceDays: [...input.reminderPolicy.cadenceDays],
        quietHours: input.reminderPolicy.quietHours
          ? { ...input.reminderPolicy.quietHours }
          : undefined,
        escalation: input.reminderPolicy.escalation
          ? { ...input.reminderPolicy.escalation }
          : undefined,
      }
      : null,
  });
}

export const NOTIFICATION_AUTOMATION_DEFINITIONS = Object.freeze(
  [
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SENT,
      displayName: "Buyer onboarding email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["client_onboarding"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SENT,
      displayName: "Seller onboarding email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_onboarding_link_seller"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_PORTAL_SENT,
      displayName: "Buyer portal email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["client_portal_link"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_PORTAL_SENT,
      displayName: "Seller portal email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_portal_link_seller"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_SENT,
      displayName: "Attorney invite email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "attorney",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_partner_invitation"],
      roleTypes: [
        "transfer_attorney",
        "bond_attorney",
        "cancellation_attorney",
      ],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_SENT,
      displayName: "Bond originator invite email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "bond_originator",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_partner_invitation"],
      roleTypes: ["bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_SENT,
      displayName: "Agent invite email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["agent_invite", "workspace_invite", "branch_invite"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SUBMITTED,
      displayName: "Buyer onboarding submitted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["onboarding_submitted"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SUBMITTED,
      displayName: "Seller onboarding submitted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_onboarding_submitted_agent"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_ACCEPTED,
      displayName: "Attorney invite accepted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: [
        "transfer_attorney",
        "bond_attorney",
        "cancellation_attorney",
      ],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_ACCEPTED,
      displayName: "Bond originator invite accepted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: ["bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_ACCEPTED,
      displayName: "Agent invite accepted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "admin",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: ["agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_REMINDER,
      displayName: "Buyer onboarding reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: [],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SUBMITTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate to assigned agent after the final buyer onboarding reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_REMINDER,
      displayName: "Seller onboarding reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: [],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SUBMITTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate to assigned agent after the final seller onboarding reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_DOCUMENT_REQUESTED,
      displayName: "Seller document requested",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_document_requested"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_DOCUMENT_REQUEST_REMINDER,
      displayName: "Seller document request reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_document_request_reminder"],
      roleTypes: [],
      reminderPolicy: {
        cadenceDays: [0, 2, 5, 9],
        stopWhen: "seller_document_supplied",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label: "Escalate overdue seller document requests to the assigned agent.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_DOCUMENT_REQUEST_ESCALATION,
      displayName: "Seller document request escalation",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_document_request_escalation"],
      roleTypes: ["agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_REMINDER,
      displayName: "Attorney invite reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "attorney",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: [
        "transfer_attorney",
        "bond_attorney",
        "cancellation_attorney",
      ],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_ACCEPTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate to transaction owner after the final attorney invite reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_REMINDER,
      displayName: "Bond originator invite reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "bond_originator",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: ["bond_originator"],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_ACCEPTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate to transaction owner after the final bond originator invite reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_REMINDER,
      displayName: "Agent invite reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: ["agent"],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_ACCEPTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "admin",
          label:
            "Escalate to workspace admin after the final agent invite reminder.",
        },
      },
    }),
  ] satisfies NotificationAutomationDefinition[],
);

const definitionsByKey = new Map(
  NOTIFICATION_AUTOMATION_DEFINITIONS.map((item) => [item.key, item]),
);

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function isAttorneyRole(value: unknown) {
  const role = normalizeKey(value);
  return role === "attorney" || role.endsWith("_attorney") ||
    role.includes("conveyancer");
}

function isAgentInvite(type: unknown, workspaceRole: unknown) {
  const normalizedType = normalizeKey(type);
  const normalizedRole = normalizeKey(workspaceRole);
  return normalizedType === "agent_invite" || normalizedRole.includes("agent");
}

export function getNotificationAutomationDefinition(
  key: unknown,
): NotificationAutomationDefinition | null {
  return definitionsByKey.get(normalizeKey(key)) || null;
}

export function resolveNotificationAutomationKey({
  communicationType = "",
  type = "",
  roleType = "",
  roleLabel = "",
  workspaceRole = "",
  emailKind = "",
}: {
  communicationType?: unknown;
  type?: unknown;
  roleType?: unknown;
  roleLabel?: unknown;
  workspaceRole?: unknown;
  emailKind?: unknown;
} = {}) {
  const normalizedCommunicationType = normalizeKey(communicationType || type);
  const normalizedType = normalizeKey(type);
  const normalizedEmailKind = normalizeKey(emailKind);
  const normalizedRoleType = normalizeKey(roleType);

  if (normalizedCommunicationType === "client_onboarding") {
    return NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SENT;
  }
  if (
    [
      "seller_onboarding_link_seller",
      "seller_onboarding",
      "seller_onboarding_link",
    ].includes(normalizedCommunicationType)
  ) {
    return NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SENT;
  }
  if (normalizedCommunicationType === "client_portal_link") {
    return NOTIFICATION_AUTOMATION_KEYS.BUYER_PORTAL_SENT;
  }
  if (
    normalizedCommunicationType === "seller_portal_link_seller" ||
    normalizedType === "seller_portal_link" ||
    normalizedEmailKind === "portal_documents"
  ) {
    return NOTIFICATION_AUTOMATION_KEYS.SELLER_PORTAL_SENT;
  }
  if (
    ["onboarding_submitted", "client_onboarding_submitted"].includes(
      normalizedCommunicationType,
    )
  ) {
    return NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SUBMITTED;
  }
  if (normalizedCommunicationType === "seller_onboarding_submitted_agent") {
    return NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SUBMITTED;
  }
  if (normalizedCommunicationType === "transaction_partner_invitation") {
    if (normalizedRoleType === "bond_originator") {
      return NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_SENT;
    }
    if (isAttorneyRole(roleType) || isAttorneyRole(roleLabel)) {
      return NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_SENT;
    }
  }
  if (
    ["workspace_invite", "team_invite", "branch_invite", "agent_invite"]
      .includes(normalizedCommunicationType)
  ) {
    return isAgentInvite(normalizedCommunicationType, workspaceRole)
      ? NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_SENT
      : "";
  }
  return definitionsByKey.has(normalizedCommunicationType)
    ? normalizedCommunicationType
    : "";
}

export function resolveNotificationAutomation(input: {
  communicationType?: unknown;
  type?: unknown;
  roleType?: unknown;
  roleLabel?: unknown;
  workspaceRole?: unknown;
  emailKind?: unknown;
} = {}) {
  return getNotificationAutomationDefinition(
    resolveNotificationAutomationKey(input),
  );
}
