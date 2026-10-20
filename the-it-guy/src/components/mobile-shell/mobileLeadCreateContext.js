import { createContext, useContext } from 'react'
export const MobileLeadCreateContext = createContext(null)
export function useMobileLeadCreate() { return useContext(MobileLeadCreateContext) }
