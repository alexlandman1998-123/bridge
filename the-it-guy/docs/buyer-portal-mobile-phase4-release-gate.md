# Buyer portal mobile Phase 4 release gate

Run `npm run test:buyer-portal-mobile-phase4` before promoting a buyer-portal release. The automated gate protects the shared mobile presentation contract between generated demos and the live token portal.

Before release, complete this short visual smoke matrix on the preview deployment:

| Scenario | Viewports | Expected result |
| --- | --- | --- |
| Light-logo buyer brand | 320, 390, 430 px | Logo is shown on the dark mobile chrome; no dark logo tile appears on a light surface. |
| Long brand and property names | 320, 390 px | Header, hero, and navigation remain readable with no horizontal overflow. |
| Required document | 390 px | The urgent document is presented before secondary content; live upload opens the secure camera/file sheet. |
| Cash and bond purchases | 390 px | Finance copy matches the transaction; bond-only controls remain hidden for cash purchases. |
| Demo buyer link | 390 px | The five-item navigation works, the demo upload sheet is clear that no data is accepted, and all pages retain brand treatment. |
| Live buyer token | 390 px | Current stage, documents, and finance use live data; upload and navigation actions still work. |

Browser acceptance requires no error overlay, no console error, no horizontal overflow, 44 px-or-larger controls, and correct bottom safe-area spacing on iOS Safari and Android Chrome.
