# Buyer and tenant WhatsApp screening setup

Use the primary app's Marketing → WhatsApp → Automations area. Save each
property's verified terms before enabling its screening. A new setup defaults to
**Test recipient only**. The test phone must be the enquiry contact's actual
international number, and that person must have recorded permission for the
selected shared company sender. An enquiry by itself is not permission.

## Opening templates

Create these two text-only templates in **the WhatsApp Business account connected
to the chosen company number**. Identically named Meta accounts can be different
accounts; match the connected account ID, not just its display name.

Suggested category: Utility, because these respond to a particular property
enquiry. Language: English (US), `en_US`. Meta determines approval and category.
No header, footer, buttons or attachments are required. Use numbered variables.

**Name: `arch9_buyer_screening_v1`**

```text
Hi, this is {{1}}. Thanks for your enquiry about buying {{2}} in {{3}}. To help your agent review your enquiry, our automated assistant has up to {{4}} short questions. You can pause and return later. Reply START to begin or continue, AGENT to speak to a person, or STOP to stop these messages. Please do not send ID documents or bank details in this chat.
```

**Name: `arch9_tenant_screening_v1`**

```text
Hi, this is {{1}}. Thanks for your enquiry about renting {{2}} in {{3}}. To help your agent review your enquiry, our automated assistant has up to {{4}} short questions. You can pause and return later. Reply START to begin or continue, AGENT to speak to a person, or STOP to stop these messages. Please do not send ID documents or bank details in this chat.
```

| Variable | Example for Meta review | Map in Arch9 |
| --- | --- | --- |
| `{{1}}` | Example Agency | Agency legal name |
| `{{2}}` | Example Property REF 1042 | Property name/reference |
| `{{3}}` | Cape Town | Property location |
| `{{4}}` | 28 buyer / 25 tenant | Maximum question count |

The app substitutes the saved property and current question count. Keep the
maximum count dynamic: some finance and pet questions are conditional. Reload
approved templates after Meta approval; pending templates cannot be enabled.

## Controlled test

1. Configure one sale listing and one rental listing. Use genuine, verified
   property terms; do not invent deposits, fees, availability or privacy terms.
2. Select a connected shared company sender and **Test recipient only**. Enter
   the agreed test phone. Save switched off, inspect the exact opening and
   questionnaire preview, then explicitly enable the test recipient.
3. Open that test contact in the shared inbox and record their actual permission
   for this sender. Create a new buyer enquiry for the sale property. Reply START
   from the test phone, complete the flow, and review the saved answers and task.
4. Test a rental enquiry next. One phone cannot run overlapping questionnaires
   on the same sender. Close or hand off the previous screening first; an
   existing CRM link must be reviewed and deliberately updated to the new lead.
5. Check PAUSE/RESUME, AGENT, invalid answers, conditional bond/pet follow-ups and
   a recorded provider receipt. Test STOP last: it revokes permission and must
   not be silently reset to continue testing.

Questions are free-text messages inside the customer-service reply window. When
that window closes, the approved opening invites the applicant to continue.
Delivery acceptance, delivery and read status are distinct; an uncertain send
cannot be retried automatically. Identity upload links and viewing confirmation
remain assigned-agent follow-up. No credit check, scoring or approval runs.

After successful testing, edit the property, explicitly choose **Future property
enquiries**, save switched off, review, and enable again. Existing enquiries are
not backfilled. Disable the property to stop new screening and hand off its
unfinished conversations without deleting answers or receipts.
