import { Command } from 'cmdk'
import { ArrowRight, Building2, ClipboardList, Command as CommandIcon, Contact, LayoutPanelTop, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { cn } from '../../lib/utils'

const actionGroups = [
  {
    heading: 'Navigate',
    items: [
      { label: 'Go to Product', icon: LayoutPanelTop, to: '/bridge/product' },
      { label: 'Go to Solutions', icon: ClipboardList, to: '/bridge/solutions' },
      { label: 'Go to How It Works', icon: ArrowRight, to: '/bridge/how-it-works' },
      { label: 'Go to Contact', icon: Contact, to: '/bridge/contact' },
    ],
  },
  {
    heading: 'Explore roles',
    items: [
      { label: 'Explore Developers', icon: Building2, to: '/bridge/for-developers' },
      { label: 'Explore Conveyancers', icon: ClipboardList, to: '/bridge/for-conveyancers' },
      { label: 'Explore Agents', icon: Users, to: '/bridge/for-agents' },
      { label: 'Explore Buyers', icon: ArrowRight, to: '/bridge/for-buyers' },
    ],
  },
  {
    heading: 'Action',
    items: [{ label: 'Book a Demo', icon: CommandIcon, to: '/bridge/contact' }],
  },
]

export default function BridgeCommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }

      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    function onOpenRequested() {
      setOpen(true)
    }

    window.addEventListener('bridge:open-command-palette', onOpenRequested)
    return () => window.removeEventListener('bridge:open-command-palette', onOpenRequested)
  }, [])

  const items = useMemo(() => actionGroups.flatMap((group) => group.items), [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[680px] overflow-hidden p-0" showClose={false}>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <span className="rounded-full border border-marketing-borderStrong bg-white px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-marketing-subtle">
              Command
            </span>
            Bridge quick jump
          </DialogTitle>
          <DialogDescription>
            Navigate the marketing site like product software. Press <span className="font-semibold text-marketing-ink">Esc</span> to close.
          </DialogDescription>
        </DialogHeader>
        <Command
          className="overflow-hidden"
          label="Bridge command palette"
          filter={(value, search, keywords) => {
            const haystack = `${value} ${(keywords || []).join(' ')}`.toLowerCase()
            return haystack.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <div className="mx-6 mt-4 flex items-center rounded-[20px] border border-marketing-borderStrong bg-white/84 px-4">
            <Command.Input
              autoFocus
              placeholder="Search destinations or actions..."
              className="h-12 w-full border-0 bg-transparent text-sm text-marketing-ink outline-none placeholder:text-[#a0968a]"
            />
          </div>
          <Command.List className="max-h-[420px] overflow-y-auto px-3 py-4">
            <Command.Empty className="px-3 py-6 text-sm text-marketing-muted">No matching actions.</Command.Empty>
            {actionGroups.map((group) => (
              <Command.Group key={group.heading} heading={group.heading} className="mb-3 px-3 text-[11px] uppercase tracking-[0.22em] text-marketing-subtle">
                {group.items.map((item) => {
                  const Icon = item.icon

                  return (
                    <Command.Item
                      key={item.label}
                      value={item.label}
                      keywords={[item.to]}
                      onSelect={() => {
                        navigate(item.to)
                        setOpen(false)
                      }}
                      className={cn(
                        'mt-2 flex cursor-pointer items-center justify-between rounded-[20px] border border-transparent bg-transparent px-4 py-3 text-sm text-marketing-ink outline-none transition',
                        'data-[selected=true]:border-marketing-border data-[selected=true]:bg-marketing-accentSoft',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-marketing-borderStrong bg-white/86 text-marketing-accent">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span>{item.label}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-marketing-subtle" />
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
