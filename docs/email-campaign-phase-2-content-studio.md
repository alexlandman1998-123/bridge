# Arch9 Email Campaigns — Phase 2: Content studio

Phase 2 makes campaign composition repeatable without making raw HTML the default workflow.

## Included

- Agency-scoped template library, backed by the existing RLS-protected `email_templates` model.
- Save the current campaign layout as a reusable template.
- Apply a template to the current draft without changing the stored template.
- Import `.html` / `.htm` files up to 750 KB directly into the advanced editor.
- Preview HTML defensively in the browser. The send worker independently strips scripts, event handlers, JavaScript URLs and iframes before provider delivery.
- Campaign content remains immutable as soon as sending has started, so a later template edit cannot rewrite historical email.

## Deliberate boundary

This phase does not create a Storage bucket or upload the raw HTML source to object storage. A selected file is read locally and saved as a tenant-isolated template record. This keeps uploaded HTML inside the existing template permission model and avoids adding another public asset surface during the schema freeze.

## Verification

The UI accepts only `.html` / `.htm` files, rejects files over 750 KB, and retains a separate server-side sanitisation boundary before Resend receives content.
