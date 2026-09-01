# Public Websites — Phase 4 Launch Runbook

This runbook connects a client-owned website hostname to a published PropData site without changing the client’s email service.

## Preconditions

- The agency approved the website on its PropData preview address.
- The site and its content revision are published.
- The client has named the exact hostname to connect (for example, `www.agency.co.za`).
- Support captured the current records for that hostname and has a rollback contact.

## Permitted DNS changes

Only make the hosting provider’s exact website records for the approved hostname:

1. A, ALIAS or CNAME record required to direct the hostname to the public websites host.
2. A temporary or provider-required TXT verification record.
3. An explicit root-to-`www` or `www`-to-root redirect only after both website records are verified.

## Prohibited changes

Never change nameservers, transfer the domain, delete a DNS zone, or edit MX, SPF, DKIM, DMARC, autodiscover, `mail`, `mailhost`, or any email-related record. Do not remove an existing record without recording it and confirming it is the conflicting website record for the approved hostname.

## Activation checks

1. Confirm the new hostname resolves to the expected hosting provider.
2. Confirm the public application resolves the hostname to the correct organisation and no other tenant’s content appears.
3. Confirm `robots.txt` permits indexing only for the live custom domain and `sitemap.xml` returns only public pages and published properties.
4. Submit one controlled property enquiry and verify the site, listing and source context in the CRM.
5. Test home, search, property detail, campaign page and enquiry at 320px, 375px and 768px.

## Rollback

If any check fails, restore only the previously recorded website record for the approved hostname and mark the website domain disabled. Do not change email records. The preview hostname remains available for remediation and re-approval.
