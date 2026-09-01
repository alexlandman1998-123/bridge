# Development Structure — Phase 1 Contract

## Canonical vocabulary

A development owns its physical structure and its commercial inventory. The structure is optional and contains only the levels a project needs:

`Development → Building | Block | Precinct | Zone → Floor | Level → Wing | Zone → Unit`

`Unit` remains the sellable inventory record. Its unit number, unit label, type, floorplan, price, VAT/transfer-duty treatment, release state and transaction context are not structural nodes.

## Templates

| Project shape | Recommended structure |
| --- | --- |
| Estate / townhouse | Precinct → Unit |
| Apartment blocks | Block → Floor → Unit |
| Single tower | Building → Floor → Unit |
| Hotel / serviced apartments | Building → Level → Wing → Unit |
| Mixed use | Building → Zone → Floor → Unit |
| Irregular project | Custom nodes, imported or created manually |

## Access contract

| Actor | Structure | Units / prices | Buyer and reservation data |
| --- | --- | --- | --- |
| Development owner / authorised operator | Create and manage | Create, release and price | Full authorised access |
| Selling agency | View only | Approved sellable inventory only | Agency-owned buyer context only |
| Agent | Navigate read-only | Approved sellable inventory only | Their assigned / agency buyer context only |
| Public visitor | Published hierarchy only | Published availability and price messaging only | Never exposed |

The Phase 2 schema must use the existing development relationship capability helpers for RLS. New exposed tables require RLS, authenticated grants, and policies that distinguish view from manage capability.

## Migration plan

1. Create `development_structure_nodes` with `development_id`, optional `parent_id`, type, label, sort order and metadata.
2. Add nullable `structure_node_id` to `units`; do not change existing `phase`, `block` or unit-number values.
3. Backfill only unambiguous existing data. Keep legacy values visible and provide a review queue for ambiguous records.
4. Add hierarchy-aware import/setup flows, then migrate availability-map scenes to structure-aware views.
5. Do not retire legacy fields until all active developments pass the rollout validation.
