import { ChevronDown } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import WorkspaceSwitcher from '../../../components/WorkspaceSwitcher'
import { COMMERCIAL_BOTTOM_NAV_ITEMS, COMMERCIAL_DASHBOARD_NAV_ITEM, COMMERCIAL_NAV_SECTIONS, isCommercialNavItemActive, isCommercialNavItemAvailable } from '../commercialNavigation'
import CommercialBranding from './CommercialBranding'

function CommercialSidebar({ scope = null }) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentFullPath = `${location.pathname}${location.hash || ''}`
  const currentWorkspacePath = `${location.pathname}${location.search || ''}`
  const DashboardIcon = COMMERCIAL_DASHBOARD_NAV_ITEM.icon
  const activeItemClass = 'bg-[#eef4f8] text-[#17324b] font-semibold before:absolute before:-left-2 before:top-2.5 before:bottom-2.5 before:w-0.5 before:rounded-full before:bg-[#2f5f7b]'
  const sectionOpenClass = 'bg-[#f5f7fa] text-[#1f3448] font-semibold'
  const inactiveItemClass = 'text-slate-600 hover:bg-[#f3f7fb] hover:text-[#1c3f5c]'
  const navItemClass = 'relative flex min-h-[42px] items-center gap-3 rounded-[14px] border border-transparent px-3 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:border-[#bfd5ee] focus-visible:ring-4 focus-visible:ring-[#2f80ed]/10'
  const childItemClass = 'min-h-[38px] rounded-[12px] px-3 text-[0.9rem]'
  const visibleSections = useMemo(
    () => COMMERCIAL_NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => isCommercialNavItemAvailable(item, scope)),
      }))
      .filter((section) => section.items.length),
    [scope],
  )
  const activeSectionId = useMemo(
    () => visibleSections.find((section) => section.items.some((item) => isCommercialNavItemActive(currentFullPath, item)))?.id || null,
    [currentFullPath, visibleSections],
  )
  const [manualExpandedSectionId, setManualExpandedSectionId] = useState(null)
  const [manualCollapsedSectionId, setManualCollapsedSectionId] = useState(null)
  const expandedSectionId = visibleSections.some((section) => section.id === manualExpandedSectionId)
    ? manualExpandedSectionId
    : (activeSectionId && manualCollapsedSectionId !== activeSectionId ? activeSectionId : null)

  return (
    <aside className="hidden h-screen w-[268px] shrink-0 border-r border-slate-200 bg-white shadow-[12px_0_32px_rgba(15,23,42,0.03)] lg:flex">
      <div className="flex min-h-0 w-full flex-col px-4 py-3">
        <div className="shrink-0">
          <CommercialBranding />

          <WorkspaceSwitcher
            currentPath={currentWorkspacePath}
            onSelectWorkspace={(path) => navigate(path)}
          />
        </div>

        <nav className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Commercial Navigation">
          <Link
            to={COMMERCIAL_DASHBOARD_NAV_ITEM.to}
            aria-current={isCommercialNavItemActive(currentFullPath, COMMERCIAL_DASHBOARD_NAV_ITEM) ? 'page' : undefined}
            className={[
              navItemClass,
              isCommercialNavItemActive(currentFullPath, COMMERCIAL_DASHBOARD_NAV_ITEM) ? activeItemClass : inactiveItemClass,
            ].join(' ')}
          >
            <DashboardIcon size={17} />
            <span>{COMMERCIAL_DASHBOARD_NAV_ITEM.label}</span>
          </Link>

          <div>
            {visibleSections.map((section) => {
              const SectionIcon = section.icon
              if (section.items.length === 1) {
                const item = section.items[0]
                const active = isCommercialNavItemActive(currentFullPath, item)
                return (
                  <Link
                    key={section.id}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      navItemClass,
                      'mt-3',
                      active ? activeItemClass : inactiveItemClass,
                    ].join(' ')}
                  >
                    <SectionIcon size={17} />
                    <span>{section.label}</span>
                  </Link>
                )
              }

              return (
                <div key={section.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (expandedSectionId === section.id) {
                        setManualExpandedSectionId(null)
                        setManualCollapsedSectionId(section.id)
                        return
                      }

                      setManualCollapsedSectionId(null)
                      setManualExpandedSectionId(section.id)
                    }}
                    className={[
                      navItemClass,
                      'mt-3 w-full justify-between',
                      expandedSectionId === section.id ? sectionOpenClass : inactiveItemClass,
                    ].join(' ')}
                    aria-expanded={expandedSectionId === section.id}
                  >
                    <span className="inline-flex items-center gap-3">
                      <SectionIcon size={17} />
                      <span>{section.label}</span>
                    </span>
                    <ChevronDown size={14} className={`transition ${expandedSectionId === section.id ? 'rotate-180 text-[#0B3A5B]' : 'text-slate-400'}`} />
                  </button>
                  {expandedSectionId === section.id ? (
                    <div className="ml-5 mt-1 grid gap-1 border-l border-slate-200 pl-3">
                      {section.items.map((item) => {
                        const ItemIcon = item.icon
                        const active = isCommercialNavItemActive(currentFullPath, item)
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => {
                              setManualExpandedSectionId(null)
                              setManualCollapsedSectionId(null)
                            }}
                            aria-current={active ? 'page' : undefined}
                            className={[
                              navItemClass,
                              childItemClass,
                              active ? activeItemClass : inactiveItemClass,
                            ].join(' ')}
                          >
                            <ItemIcon size={15} />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </nav>

        <nav className="mt-2 shrink-0 border-t border-slate-200 pt-2" aria-label="Commercial Settings">
          {COMMERCIAL_BOTTOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isCommercialNavItemActive(currentFullPath, item)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  navItemClass,
                  active ? activeItemClass : inactiveItemClass,
                ].join(' ')}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}

export default memo(CommercialSidebar)
