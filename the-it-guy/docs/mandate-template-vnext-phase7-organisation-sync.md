# Mandate Template vNext Phase 7 Organisation Template Sync

Generated: 2026-07-28T12:00:00.000Z
Version: mandate_template_vnext_phase7_organisation_sync_v1
Status: SYNC_READY_FOR_DRAFT_CREATION
Sync allowed: yes
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Targets | 9 |
| Actions | 9 |
| Already synced | 0 |
| Blockers | 0 |
| Warnings | 0 |
| Source digest | sha256:91924c1d5d84ca75471825a0976f9ecc463d51b38567ca0e311e4956bdcb6b65 |
| Source sections | 16 |

## Phase 6 Gate

| Field | Value |
| --- | --- |
| Status | RELEASE_GATE_PASSED |
| Release allowed | yes |
| Release contract | mandate-template-vnext-release-v1 |
| Runtime B3 contract | phase4-b3-integrity-v1 |
| Expected digest | sha256:91924c1d5d84ca75471825a0976f9ecc463d51b38567ca0e311e4956bdcb6b65 |
| Blockers | 0 |

## Target Plan

| Organisation | Name | Action | Existing Template | Ready |
| --- | --- | --- | --- | --- |
| 76d75072-d1b1-4d72-923a-6a91b7eb313b |  | create_draft |  | yes |
| 5b706de0-ce2d-4087-a55e-59e448c5e134 |  | create_draft |  | yes |
| ec425107-297b-48ea-81ee-5bf97da5e829 |  | create_draft |  | yes |
| cfc87922-6675-43ac-9893-88fa69933a13 |  | create_draft |  | yes |
| e265bf30-acf8-4513-ba57-96c493658e40 |  | create_draft |  | yes |
| cbb39de7-1023-4bf0-9f78-a0b760b7b22a |  | create_draft |  | yes |
| ec19d0a6-bcba-4eef-aa72-9972de88204d |  | create_draft |  | yes |
| efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a |  | create_draft |  | yes |
| 54c58314-51dd-4cae-8aa5-a0a41ef55968 |  | create_draft |  | yes |

## Actions

| Organisation | Action | Template Key | Status | Default | Active | Sections | Apply Path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 76d75072-d1b1-4d72-923a-6a91b7eb313b | create_draft | mandate_vnext_76d75072_d1b1_4d_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |
| 5b706de0-ce2d-4087-a55e-59e448c5e134 | create_draft | mandate_vnext_5b706de0_ce2d_40_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |
| ec425107-297b-48ea-81ee-5bf97da5e829 | create_draft | mandate_vnext_ec425107_297b_48_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |
| cfc87922-6675-43ac-9893-88fa69933a13 | create_draft | mandate_vnext_cfc87922_6675_43_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |
| e265bf30-acf8-4513-ba57-96c493658e40 | create_draft | mandate_vnext_e265bf30_acf8_45_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |
| cbb39de7-1023-4bf0-9f78-a0b760b7b22a | create_draft | mandate_vnext_cbb39de7_1023_4b_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |
| ec19d0a6-bcba-4eef-aa72-9972de88204d | create_draft | mandate_vnext_ec19d0a6_bcba_4e_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |
| efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a | create_draft | mandate_vnext_efa6c6ff_6941_4b_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |
| 54c58314-51dd-4cae-8aa5-a0a41ef55968 | create_draft | mandate_vnext_54c58314_51dd_4c_91924c1d5d84 | draft | no | no | 16 | createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection |

## Blockers

No blockers.

## Operator Steps

- Run Phase 6 and keep the approved content digest fixed.
- Create or update organisation-owned mandate drafts from this sync plan only after Phase 6 passes.
- Render and visually inspect the organisation draft PDF so company branding, spacing, conditional sections and signature panels remain intact.
- Promote the inspected organisation draft through the existing bridge_publish_template_revision_b4 flow; do not mark the sync payload live directly.

## Boundary

This Phase 7 report does not mutate live data. It prepares organisation-owned draft/revision sync payloads only; activation remains a separate publish action after approval evidence and visual PDF inspection.
