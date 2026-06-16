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
  const activeItemClass = 'bg-[rgba(0,102,204,0.08)] text-[#0B3A5B] shadow-[inset_0_0_0_1px_rgba(0,102,204,0.12)]'
  const inactiveItemClass = 'text-slate-600 hover:bg-slate-50 hover:text-[#0B3A5B]'
  const navItemClass = 'flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150'
  const childItemClass = 'ml-4 min-h-9 rounded-lg pr-3 pl-9 text-[0.94rem]'
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
  const expandedSectionId = activeSectionId || (visibleSections.some((section) => section.id === manualExpandedSectionId) ? manualExpandedSectionId : null)

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
              return (
                <div key={section.id}>
                  <button
                    type="button"
                    onClick={() => setManualExpandedSectionId((current) => (current === section.id ? null : section.id))}
                    className={[
                      navItemClass,
                      'mt-3 w-full justify-between',
                      activeSectionId === section.id ? activeItemClass : inactiveItemClass,
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
                    <div className="mt-1 grid gap-1">
                      {section.items.map((item) => {
                        const ItemIcon = item.icon
                        const active = isCommercialNavItemActive(currentFullPath, item)
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
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
