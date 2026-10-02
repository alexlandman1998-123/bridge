# Current imported transaction recovery

Read-only production audit: 1 October 2026, Supabase project
`isdowlnollckzvltkasn`, Produktive organisation
`efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a`.

20 organisation transactions scanned; 16 corroborated workbook imports. All 16
have no linked source documents and no historical sale date. 15 have no active
buyer participants. R05 has an existing participant link; preserve and check it.
No conflicting primary links were detected in this snapshot. This is an inventory,
not confirmation that captured identities or financial details are correct.

Local discovery in `/Users/alexanderlandman/Desktop/Produktive OTP` found 11
single filename candidates, two ambiguous matches and three expected filenames
not found. Generic Offer to Purchase files can belong to more than one import;
download suffixes and folder names do not establish deal identity. Local file
paths, sizes and SHA-256 values are in the generated local recovery plan at
`the-it-guy/output/imported-deals/recovery-plan.json`. No PDF contents or raw
buyer names/identity data are included in this report.

| Transaction | Expected source PDF | Recovery status |
| --- | --- | --- |
| PR-OTP-IMP-R02 | 20260625121046351.pdf | Download-copy candidate |
| PR-OTP-IMP-R03 | 20260714_130205.pdf | Matching filename not found |
| PR-OTP-IMP-R04 | 20260722_143804.pdf | Download-copy candidate |
| PR-OTP-IMP-R05 | 20260728_130442.pdf | Matching filename not found |
| PR-OTP-IMP-R06 | Document_260908_150020.pdf | Download-copy candidate |
| PR-OTP-IMP-R07 | Offer To Purchase (1).pdf | Ambiguous: compare originals |
| PR-OTP-IMP-R08 | Offer To Purchase.pdf | Ambiguous: compare originals |
| PR-OTP-IMP-R09 | otp royal ascot no.10.pdf | Download-copy candidate |
| PR-OTP-IMP-R10 | OTP SURREY COURT.pdf | Exact filename candidate |
| PR-OTP-IMP-R11 | SECONDARY-PRINTER_027846.pdf | Download-copy candidate |
| PR-OTP-IMP-R12 | 34A 4th Avenue Westdene signed.pdf | Download-copy candidate |
| PR-OTP-IMP-R13 | PRODUKTIVE otp 17 parrow owner.pdf | Download-copy candidate |
| PR-OTP-IMP-R14 | Signed Offer to Purchase.pdf | Download-copy candidate |
| PR-OTP-IMP-R15 | Signed OTP.pdf | Matching filename not found |
| PR-OTP-IMP-R16 | SKM_75826090611420.pdf | Download-copy candidate |
| PR-OTP-IMP-R17 | SKM_C451i26080412070_260804_121555.pdf | Download-copy candidate |

## Per-transaction recovery procedure

1. Compare the original PDF with the captured property and parties before attaching
   it. Resolve ambiguous filenames by document content; locate missing originals.
   Keep the original bytes and checksum. Check the actual sale date from the source;
   filenames, folders and workbook status are not historical evidence of sale date.
2. After explicit approval for the production write, attach the verified source to
   that transaction through the Documents workflow, then verify its stored object
   and signed preview under the authorised operator account. Avoid overwriting
   unrelated files or attaching the same generic candidate to multiple deals.
3. Check the captured buyer profile against the source. Link the correct existing
   buyer and choose one primary participant through Manage buyer links; create a
   buyer only where identity review establishes it is needed. Preserve R05's existing
   link unless source review establishes a correction. No name-only bulk matching.
4. Review and confirm buyer, seller, property, attorney and funding sections against
   the source. Missing documents remain a separate operational task. Do not copy
   workflow stages from folder names or mark imported records reviewed automatically.
5. Re-run the same inventory and verify the resulting buyer links, stored sources,
   five-section confirmations and retained correction history for each repaired deal.

The five-section review RPC is not installed in production in this audit. The
pending review migrations and app deployment must be released before that workflow
can run live. The existing Documents/buyer-link workflows must be used with their
normal permissions; this preparation adds no service-role recovery bypass.

## Verification and remaining work

10 focused recovery/compatibility checks passed. The updated organisation inventory
query ran successfully against production, and the CLI generated the recovery plan
from the actual local directory. Focused lint passed without warnings or errors.
No remote data, storage uploads, links, dates, stages or confirmation states changed.

Phase 5 recovery preparation is implemented. Actual attachment/link recovery and
human detail review remain outstanding, including locating/verifying the originals.
Repository AGENTS.md requires explicit approval before commands that write remote
data. This report is the concrete scope for that decision; an approval does not
remove the requirement to establish which original belongs to each transaction.
