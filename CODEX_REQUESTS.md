# Ask Codex to work on Arch9

You do not need to know code, file names, test commands, or the "right" technical words. Describe the result you want in normal language. Codex will find the relevant area of the product, make a sensible implementation plan, and run the appropriate checks.

## The easiest request

Copy this and replace the sentence in brackets:

> I want users to be able to [describe what should happen]. Keep the existing design unless a change is necessary. Do not make production changes. Show me what changed and check that it works.

Example:

> I want an agent to see when a seller has not uploaded a required document. Keep the existing design unless a change is necessary. Do not make production changes. Show me what changed and check that it works.

## Useful request patterns

### Build something new

> Add [feature] for [who uses it]. They should be able to [result]. It matters because [reason]. Keep the first version simple. Do not deploy it yet.

### Change an existing screen or workflow

> On [screen or part of the product], change [what feels wrong] so that [desired result]. Keep anything else working as it does now.

### Fix a problem

> When I [what I do], I expect [expected result], but instead [what happens]. Please find the cause, fix it, and tell me how you checked it.

Screenshots, copied error messages, and a short screen recording are all useful. You can attach them without explaining the technical details.

### Turn a rough idea into a feature

> I have an idea but I am not sure what the right workflow is: [idea]. Ask me only the questions that change the customer experience. Then propose the simplest useful version before building it.

### Ask for a safety review

> Review [feature or recent changes] for customer-impacting bugs, missing states, privacy risks, and confusing workflow steps. Do not change anything until you show me the findings.

### Prepare a release

> I think [feature] is ready for staging/release. Check what is needed, run the appropriate read-only checks first, and give me a go/no-go summary. Do not deploy or modify live data without asking me separately.

## Three details that help most

Include any that you know; leave the rest to Codex:

1. **Who is this for?** For example: an agent, buyer, seller, attorney, administrator, or the public.
2. **What should they be able to do?** Describe the visible outcome rather than the technical solution.
3. **What must not happen?** For example: do not change live data, do not send emails, keep the current layout, or do not affect another user role.

## What Codex will do

For ordinary work, Codex should identify the affected product, make the smallest safe change, run focused checks, and explain the result in plain English. It will ask before an action that can affect production data, send a message or email, publish a listing, or deploy a release.

Use one chat per outcome. A good chat title describes the result, such as “Seller document reminder” or “Attorney task loading issue,” rather than a broad project name.
