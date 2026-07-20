# Legal-document editor release validation

This gate covers the focused legal-document editor work delivered in Phases 1–5.

## Automated gate

Run:

```bash
npm run verify:legal-document-editor-release
```

The release gate validates routing, scope selection, conditional-pack protection, migration-candidate selection, focused editor layouts, action availability, compatibility with the safe conditional-master migration, targeted lint, and the production build.

## Manual staging smoke

Verify both the Mandate and OTP document routes:

1. Always included opens with the outline and wording canvas. Tools are absent until requested.
2. Conditional wording opens with the situation picker only. Selecting a situation opens one protected clause and Back returns to the picker.
3. Who signs opens with the outline and full-width signing controls. Changing sections updates the signing field list.
4. Preview opens from all three scopes. Save persists a wording or signing change, and a draft can be published only after the existing publish checks pass.
5. A live template cannot be archived, protected conditional packs cannot be reordered or removed, and their activation rules cannot be edited.

Do not release if any automated check fails or any staging route displays the legacy three-column focused editor.
