# Conveyancer practice operations — G1 contract

G1 is the common authority and traceability contract for the practice-operations G-series. It does not change matter facts, approve legal work, move trust money or contact external providers.

## Delivered

- Organisation, attorney-firm, branch, team, matter, lane and operation identities.
- Operational roles for responsible and supervising attorneys, conveyancing secretaries, accounts, compliance, firm management and internal services.
- A bounded role-capability matrix with professional approval powers kept out of ordinary delegation.
- Versioned firm-policy binding through policy ID, version, effective date and fingerprint.
- Manual and integration evidence-source contracts that converge on the same canonical evidence type.
- Integration evidence remains proposed or under review and cannot approve itself.
- Time-limited, matter-bound delegation with non-delegable legal, trust, compliance and emergency powers.
- Independent, reasoned approvals with distinct users and self-approval prevention.
- Reference-only operation payloads and secret-material rejection.
- Explicit local side-effect allowlist and hard prohibition of autonomous payments, legal approval, waivers, regulatory submissions and Deeds outcomes.
- A common append-only audit-event shape with reference and hash evidence.
- An immutable traceability result proving firm, matter, policy, actor, authority, source, approvals and side-effect boundaries.

## Boundary

G1 is an executable domain contract. Persistence and database RLS remain separate concerns. Later G phases must wrap their records and decisions in this authority language rather than inventing new role or audit semantics.

Run:

```sh
npm run test:conveyancer-practice-g1
```

G1 adds no database migration.

