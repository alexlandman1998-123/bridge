import { createContext, useContext } from 'react'
export const MobileAppointmentCreateContext = createContext(null)
export function useMobileAppointmentCreate() { return useContext(MobileAppointmentCreateContext) }
