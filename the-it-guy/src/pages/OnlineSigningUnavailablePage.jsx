import { ONLINE_SIGNING_DISABLED_MESSAGE } from '../core/documents/onlineSigningPolicy'

export default function OnlineSigningUnavailablePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Online signing unavailable</h1>
      <p className="mt-4 text-sm leading-6">{ONLINE_SIGNING_DISABLED_MESSAGE}</p>
      <p className="mt-2 text-sm leading-6">Please contact your Arch9 agent if you need a physical document pack.</p>
    </main>
  )
}
