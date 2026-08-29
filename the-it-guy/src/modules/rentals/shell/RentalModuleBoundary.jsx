import AppErrorBoundary from '../../../components/AppErrorBoundary'

export function RentalModuleBoundary({ children }) {
  return <AppErrorBoundary scope="rentals_module">{children}</AppErrorBoundary>
}
