import { Outlet } from 'react-router-dom'
import { MobileExecutiveFrame } from './ExecutiveMobileUi'

export default function MobileExecutiveLayout() {
  return (
    <MobileExecutiveFrame className="pb-16">
      <Outlet />
    </MobileExecutiveFrame>
  )
}
