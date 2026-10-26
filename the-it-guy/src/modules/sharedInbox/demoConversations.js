// Fictional conversations for interaction testing. Never persisted or sent.
const make = (
  id,
  channel,
  name,
  address,
  subject,
  status,
  assignedTo,
  messages,
) => ({
  id,
  channel,
  providerKey: "sample",
  channelAddress:
    channel === "email" ? "team@agency.example" : "+27 11 555 0100",
  name,
  address,
  subject,
  status,
  assignedTo,
  unread: true,
  unreadCount: 1,
  updated: channel === "email" ? "09:25" : "09:42",
  lastMessageAt: messages.at(-1).occurredAt,
  preview: messages.at(-1).bodyText,
  messages: messages.map((message, index) => ({
    id: `${id}-${index}`,
    messageType: "message",
    ...message,
  })),
});
export const INBOX_DEMO_CONVERSATIONS = [
  make(
    "sample-lerato",
    "whatsapp",
    "Lerato Mokoena",
    "+27 82 555 0142",
    "Viewing at The Mews",
    "open",
    "You",
    [
      {
        direction: "inbound",
        bodyText:
          "Hi! We loved the photos of The Mews. Is the two-bedroom apartment still available?",
        occurredAt: "2026-10-25T07:37:00Z",
      },
      {
        direction: "outbound",
        bodyText:
          "Hi Lerato, it is. The corner unit has a lovely view and two parking bays. Would tomorrow afternoon work for a viewing?",
        occurredAt: "2026-10-25T07:40:00Z",
      },
      {
        direction: "inbound",
        bodyText:
          "Tomorrow at 3pm would be perfect. Could you send me the address? My partner will join us.",
        occurredAt: "2026-10-25T07:42:00Z",
      },
    ],
  ),
  make(
    "sample-michael",
    "email",
    "Michael Adams",
    "michael.adams@example.test",
    "Offer on 18 Oak Avenue",
    "waiting_on_us",
    "Unassigned",
    [
      {
        direction: "inbound",
        bodyText:
          "Good morning,\n\nThank you for showing us the home on Oak Avenue. We would like to discuss making an offer. Could you confirm the next steps and which documents you need from us?\n\nKind regards,\nMichael",
        occurredAt: "2026-10-25T07:10:00Z",
      },
      {
        direction: "outbound",
        bodyText:
          "Hi Michael,\n\nI’m glad the home felt right. I can walk you through the offer process and send you the document checklist. Let me know a convenient time for a quick call.\n\nBest wishes,\nYour property team",
        occurredAt: "2026-10-25T07:18:00Z",
      },
      {
        direction: "inbound",
        bodyText:
          "Thanks! I’m available after 2pm today. We also have a question about the proposed occupation date.\n\nMichael",
        occurredAt: "2026-10-25T07:25:00Z",
      },
    ],
  ),
  make(
    "sample-aisha",
    "whatsapp",
    "Aisha Patel",
    "+27 84 555 0188",
    "Valuation in Gardens",
    "waiting_on_client",
    "You",
    [
      {
        direction: "inbound",
        bodyText:
          "We’re thinking about selling our home in Gardens. Can someone help us understand what it might be worth?",
        occurredAt: "2026-10-24T12:10:00Z",
      },
      {
        direction: "outbound",
        bodyText:
          "Absolutely, Aisha. We can arrange a complimentary valuation. Could you share the street address and a couple of times that suit you this week?",
        occurredAt: "2026-10-24T12:18:00Z",
      },
    ],
  ),
  make(
    "sample-daniel",
    "email",
    "Daniel Jacobs",
    "daniel.jacobs@example.test",
    "A home with space to work",
    "open",
    "Unassigned",
    [
      {
        direction: "inbound",
        bodyText:
          "Hello,\n\nWe are relocating to Cape Town in January and looking for a three-bedroom home with a separate study. Our preferred areas are Claremont and Newlands.\n\nDo you have any listings that might suit us? We would like to arrange a few viewings next week.\n\nThank you,\nDaniel",
        occurredAt: "2026-10-24T10:15:00Z",
      },
      {
        direction: "outbound",
        bodyText:
          "Hi Daniel,\n\nThank you for the brief. I will put together a shortlist with dedicated workspaces in those areas. What budget range would you like me to work within?\n\nYour property team",
        occurredAt: "2026-10-24T10:30:00Z",
      },
    ],
  ),
];
