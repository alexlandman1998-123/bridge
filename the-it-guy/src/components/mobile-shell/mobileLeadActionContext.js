import { createContext, useContext } from 'react'
export const MobileLeadActionContext = createContext(null)
export function useMobileLeadActions() { return useContext(MobileLeadActionContext) }
