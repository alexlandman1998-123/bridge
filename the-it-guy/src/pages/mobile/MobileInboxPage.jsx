import { Bell, ChevronRight, MessageSquareText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MobilePushOptIn } from '../../components/mobile-shell/MobileProductivity'
import { MobileCard } from '../../components/mobile-shell/MobileShellStates'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getMobileInboxThreads, getMobileNotifications } from '../../services/mobileProductivityService'
import { trackMobileMetric } from '../../services/observability/monitoring'

function NotificationRow({ item, onOpen }) {
  return (
    <button type="button" className="flex min-h-[72px] w-full items-start gap-3 rounded-[20px] border border-[#e4ebf2] bg-white px-4 py-3 text-left" onClick={() => onOpen(item)}>
      <span className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e8f6ef] text-[#1f7a5a]">
        <Bell className="h-5 w-5" />
        {item.unread ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[#b42318]" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#10243a]">{item.title}</span>
        <span className="mt-1 block text-xs leading-5 text-[#60758d]">{item.body}</span>
      </span>
      <span className="text-xs font-semibold text-[#94a3b8]">{item.time}</span>
    </button>
  )
}

function ThreadCard({ thread, onOpen }) {
  return (
    <MobileCard>
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => onOpen(thread)}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#edf3f8] text-[#274c69]">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#10243a]">{thread.title}</span>
          <span className="mt-1 block text-xs text-[#60758d]">{thread.subtitle}</span>
        </span>
        <ChevronRight className="h-5 w-5 text-[#94a3b8]" />
      </button>
      <div className="mt-4 space-y-2">
        {thread.messages.map((message) => (
          <div key={message.id} className="rounded-[18px] bg-[#f8fafc] p-3">
            <p className="text-[11px] font-semibold uppercase text-[#1f7a5a]">{message.type}</p>
            <p className="mt-1 text-sm font-semibold text-[#10243a]">{message.body}</p>
            <p className="mt-1 text-xs text-[#60758d]">{message.author} · {message.time}</p>
          </div>
        ))}
      </div>
    </MobileCard>
  )
}

export default function MobileInboxPage() {
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const notifications = getMobileNotifications(workspace)
  const threads = getMobileInboxThreads()

  function openNotification(item) {
    void trackMobileMetric('notification_opened', {
      route: '/mobile/inbox',
      metadata: { notificationId: item.id, module: item.module, destinationRoute: item.to },
    })
    navigate(item.to)
  }

  function openThread(thread) {
    void trackMobileMetric('communication_thread_opened', {
      route: '/mobile/inbox',
      metadata: { threadId: thread.id, module: thread.module, destinationRoute: thread.to },
    })
    navigate(thread.to)
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-[28px] font-semibold text-[#10243a]">Inbox</h1>
        <p className="mt-2 text-sm leading-6 text-[#60758d]">Transaction-specific communication, system messages and internal notes.</p>
      </section>

      <MobilePushOptIn route="/mobile/inbox" />

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Notifications</h2>
        <div className="space-y-2">
          {notifications.map((item) => <NotificationRow key={item.id} item={item} onOpen={openNotification} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Communication Timeline</h2>
        <div className="space-y-3">
          {threads.map((thread) => <ThreadCard key={thread.id} thread={thread} onOpen={openThread} />)}
        </div>
      </section>
    </div>
  )
}
