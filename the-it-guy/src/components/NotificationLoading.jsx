export default function NotificationLoading() {
  return <div className="notification-inbox-loading" role="status" aria-label="Loading notifications">
    <span className="sr-only">Loading notifications…</span>
    {[0, 1, 2].map((row) => <div className="notification-inbox-skeleton" key={row} aria-hidden="true"><i /><div><i /><i /><i /></div></div>)}
  </div>
}
