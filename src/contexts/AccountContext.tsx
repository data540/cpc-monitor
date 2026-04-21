'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { GoogleAdsAccount } from '@/types'
import { getIdsByRegion } from '@/lib/accounts-data'

interface AccountContextValue {
  accounts:        GoogleAdsAccount[]
  selectedIds:     string[]
  selectedRegion:  string | null
  accountsLoading: boolean
  toggleAccount:   (id: string) => void
  clearSelection:  () => void
  selectRegion:    (region: string | null) => void
  refreshAccounts: () => void
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

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const ids    = localStorage.getItem(STORAGE_IDS)
      const region = localStorage.getItem(STORAGE_REGION)
      if (ids)    setSelectedIds(JSON.parse(ids))
      if (region) setSelectedRegion(region)
    } catch {}
  }, [])

  // Persist selectedIds
  useEffect(() => {
    try { localStorage.setItem(STORAGE_IDS, JSON.stringify(selectedIds)) } catch {}
  }, [selectedIds])

  // Persist selectedRegion
  useEffect(() => {
    try {
      if (selectedRegion) localStorage.setItem(STORAGE_REGION, selectedRegion)
      else localStorage.removeItem(STORAGE_REGION)
    } catch {}
  }, [selectedRegion])

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res  = await fetch('/api/accounts')
      const data = await res.json()
      if (res.ok && data.accounts) setAccounts(data.accounts)
    } catch {}
    finally { setAccountsLoading(false) }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

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
      setSelectedIds(getIdsByRegion(region))
    } else {
      setSelectedIds([])
    }
  }, [])

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
