import AppErrorBoundary from '../../../components/AppErrorBoundary'
import './rental-buttons.css'

export function RentalModuleBoundary({ children }) {
  return <AppErrorBoundary scope="rentals_module"><div className="rental-module">{children}</div></AppErrorBoundary>
}
