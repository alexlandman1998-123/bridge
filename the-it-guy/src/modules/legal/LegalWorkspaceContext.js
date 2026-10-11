import { createContext, useContext } from 'react';
export const LegalWorkspaceContext=createContext(null);
export const useLegalWorkspace=()=>useContext(LegalWorkspaceContext);
