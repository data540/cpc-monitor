'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { GoogleAdsAccount } from '@/types'

interface AccountContextValue {
  accounts:       GoogleAdsAccount[]
  selectedIds:    string[]
  accountsLoading: boolean
  toggleAccount:  (id: string) => void
  clearSelection: () => void
  refreshAccounts: () => void
  getAccountName: (id: string) => string
}

const AccountContext = createContext<AccountContextValue | null>(null)

const STORAGE_KEY = 'cpc_selected_account_ids'

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts,        setAccounts]        = useState<GoogleAdsAccount[]>([])
  const [selectedIds,     setSelectedIds]     = useState<string[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)

  // Restore selection from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setSelectedIds(JSON.parse(saved))
    } catch {}
  }, [])

  // Persist selection to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds))
    } catch {}
  }, [selectedIds])

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res  = await fetch('/api/accounts')
      const data = await res.json()
      if (res.ok && data.accounts) {
        setAccounts(data.accounts)
      }
    } catch {}
    finally { setAccountsLoading(false) }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const toggleAccount = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const clearSelection = useCallback(() => setSelectedIds([]), [])

  const getAccountName = useCallback((id: string) =>
    accounts.find(a => a.id === id)?.name ?? id,
  [accounts])

  return (
    <AccountContext.Provider value={{
      accounts, selectedIds, accountsLoading,
      toggleAccount, clearSelection, refreshAccounts: fetchAccounts, getAccountName,
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
