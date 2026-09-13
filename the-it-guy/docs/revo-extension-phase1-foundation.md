# Revo extension — Phase 1 foundation

## Outcome

Phase 1 creates the code-level Revo extension boundary in the primary Arch9 application. It does not enable a live Revo feature, write organisation settings, deploy an application, or change the Supabase schema.

The resolver lives at `src/modules/revo/revoExtensionRegistry.js`. It accepts the active organisation and its existing `organisation_settings.settings_json` payload and enables Revo only when both requirements are met:

1. The organisation ID is Revo's registered organisation ID.
2. The persisted Revo extension setting is explicitly enabled.

## Persisted setting contract

When production activation is approved, the Revo organisation's existing `settings_json` should contain this additive setting:

```json
{
  "workspaceExtensions": {
    "revo": {
      "enabled": true,
      "features": {
        "example_revo_feature": false
      }
    }
  }
}
```

`enabled` makes the Revo extension available. Each named feature remains off until its own value is set to `true`. The resolver rejects a copied `revo` setting for any other organisation.

## Use in later phases

Every Revo-only route, UI surface, action, and server-side operation must use the extension resolver and enforce the same organisation scope. The resolver is suitable for client visibility and product routing; database policies and server-side endpoints remain the final enforcement points for future Revo data and actions.

## Verification

Run:

```sh
npm --prefix the-it-guy run test:revo-extension-foundation
```

The check proves the following cases:

- Revo can enable its registered extension and an explicitly enabled feature.
- Revo cannot use the extension while it is disabled.
- Another organisation cannot activate Revo functionality by copying the setting.
- Unknown extensions remain denied.
