'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { GoogleAdsAccount } from '@/types'

interface AccountContextValue {
  accounts:        GoogleAdsAccount[]
  selectedIds:     string[]
  selectedRegion:  string | null
  accountsLoading: boolean
  toggleAccount:   (id: string) => void
  clearSelection:  () => void
  selectRegion:    (region: string | null) => void
  refreshAccounts: (force?: boolean) => void
  getAccountName:  (id: string) => string
}

const AccountContext = createContext<AccountContextValue | null>(null)

const STORAGE_IDS    = 'cpc_selected_account_ids'
const STORAGE_REGION = 'cpc_selected_region'

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts,        setAccounts]        = useState<GoogleAdsAccount[]>([])
  const [selectedIds,     setSelectedIds]     = useState<string[]>([])
  const [selectedRegion,  setSelectedRegion]  = useState<string | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(false)
  // No persistir hasta haber restaurado: si no, el estado inicial vacío
  // sobrescribe lo guardado (p. ej. con el doble montaje de Strict Mode).
  const [hydrated,        setHydrated]        = useState(false)

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const ids    = localStorage.getItem(STORAGE_IDS)
      const region = localStorage.getItem(STORAGE_REGION)
      if (ids)    setSelectedIds(JSON.parse(ids))
      if (region) setSelectedRegion(region)
    } catch {}
    setHydrated(true)
  }, [])

  // Persist selectedIds
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(STORAGE_IDS, JSON.stringify(selectedIds)) } catch {}
  }, [selectedIds, hydrated])

  // Persist selectedRegion
  useEffect(() => {
    if (!hydrated) return
    try {
      if (selectedRegion) localStorage.setItem(STORAGE_REGION, selectedRegion)
      else localStorage.removeItem(STORAGE_REGION)
    } catch {}
  }, [selectedRegion, hydrated])

  const fetchAccounts = useCallback(async (force = false) => {
    setAccountsLoading(true)
    try {
      const res  = await fetch(force ? '/api/accounts?refresh=1' : '/api/accounts')
      const data = await res.json()
      if (res.ok && data.accounts) {
        const list: GoogleAdsAccount[] = data.accounts
        setAccounts(list)
        // Descartar de la selección guardada las cuentas a las que este usuario
        // no tiene acceso (p. ej. otro usuario en el mismo navegador)
        const allowed = new Set(list.map(a => a.id))
        setSelectedIds(prev => {
          const next = prev.filter(id => allowed.has(id))
          return next.length === prev.length ? prev : next
        })
      }
    } catch {}
    finally { setAccountsLoading(false) }
  }, [])

  // Cargar cuentas tras restaurar, para que el filtrado se aplique a lo guardado
  useEffect(() => { if (hydrated) fetchAccounts() }, [hydrated, fetchAccounts])

  const toggleAccount = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
    // If manually toggling, clear the region filter
    setSelectedRegion(null)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
    setSelectedRegion(null)
  }, [])

  const selectRegion = useCallback((region: string | null) => {
    setSelectedRegion(region)
    if (region) {
      setSelectedIds(accounts.filter(a => a.region === region).map(a => a.id))
    } else {
      setSelectedIds([])
    }
  }, [accounts])

  const getAccountName = useCallback((id: string) =>
    accounts.find(a => a.id === id)?.name ?? id,
  [accounts])

  return (
    <AccountContext.Provider value={{
      accounts, selectedIds, selectedRegion, accountsLoading,
      toggleAccount, clearSelection, selectRegion, refreshAccounts: fetchAccounts, getAccountName,
    }}>
      {children}
    </AccountContext.Provider>
  )
}

export function useAccountContext() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccountContext must be used inside AccountProvider')
  return ctx
}
