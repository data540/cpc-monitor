'use client'

import { useState, useMemo } from 'react'
import { CampaignMetrics } from '@/types'
import clsx from 'clsx'

interface Props {
  metrics:    CampaignMetrics[]
  customerId: string
  onRefresh?: () => void
}

type SortKey = keyof Pick<
  CampaignMetrics,
  'campaignName' | 'cpcCeiling' | 'avgCpc' | 'cpcUsagePct' | 'clicks' |
  'impressions' | 'ctr' | 'costEur' | 'isActual' | 'topImpressionPct' |
  'absoluteTopImpressionPct' | 'targetRoas' | 'realRoas'
>

const LEVEL_COLOR: Record<string, string> = {
  ok:      'text-green-DEFAULT',
  info:    'text-text-secondary',
  warning: 'text-amber-DEFAULT',
  alert:   'text-red-DEFAULT',
}

function pct(v: number | null) {
  return v !== null ? `${Math.round(v * 100)}%` : '—'
}
function eur(v: number | null) {
  return v !== null ? `${v.toFixed(2)} €` : '—'
}
function num(v: number | null, decimals = 2) {
  return v !== null ? v.toFixed(decimals) : '—'
}

export function CampaignTable({ metrics, customerId, onRefresh }: Props) {
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [newCpc, setNewCpc]         = useState('')
  const [sending, setSending]       = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sortKey, setSortKey]       = useState<SortKey>('campaignName')
  const [sortAsc, setSortAsc]       = useState(true)

  // ── Ordenación ──────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...metrics].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })
  }, [metrics, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  // ── Selección ───────────────────────────────────────────────
  const allIds     = metrics.map(m => m.campaignId)
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someChecked = !allChecked && allIds.some(id => selected.has(id))

  const toggleAll = () => {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(allIds))
  }
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Enviar cambios ───────────────────────────────────────────
  const handleSend = async () => {
    const ceiling = parseFloat(newCpc.replace(',', '.'))
    if (isNaN(ceiling) || ceiling <= 0) {
      setSendResult('Introduce un CPC techo válido (ej: 0.85)')
      return
    }
    const selectedMetrics = metrics.filter(m => selected.has(m.campaignId))
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/campaigns/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          campaigns: selectedMetrics.map(m => ({
            campaignName: m.campaignName,
            newCpcCeiling: ceiling,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setSendResult(`✓ ${data.updated} campaña${data.updated !== 1 ? 's' : ''} actualizadas${data.mode ? ` (${data.mode})` : ''}`)
      setSelected(new Set())
      setNewCpc('')
      onRefresh?.()
    } catch (e: any) {
      setSendResult(`Error: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  // ── Cabecera de columna ordenable ────────────────────────────
  const Th = ({ label, k, right }: { label: string; k: SortKey; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={clsx(
        'px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer select-none whitespace-nowrap',
        'hover:text-text-secondary transition-colors',
        right ? 'text-right' : 'text-left'
      )}
    >
      {label}
      {sortKey === k && (
        <span className="ml-1 opacity-60">{sortAsc ? '↑' : '↓'}</span>
      )}
    </th>
  )

  return (
    <div className="flex flex-col gap-4">

      {/* ── Barra de acción (aparece al seleccionar) ─────────── */}
      <div className={clsx(
        'sticky top-[57px] z-10 transition-all duration-200',
        selected.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <div className="bg-bg-surface border border-bg-border rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <span className="num text-sm text-text-secondary">
            {selected.size} campaña{selected.size !== 1 ? 's' : ''} seleccionada{selected.size !== 1 ? 's' : ''}
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <label className="num text-xs text-text-tertiary whitespace-nowrap">
              Nuevo CPC techo (€)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={newCpc}
              onChange={e => setNewCpc(e.target.value)}
              placeholder="0.00"
              className="num text-sm w-24 bg-bg-card border border-bg-border focus:border-amber-DEFAULT rounded px-2 py-1.5 text-text-primary placeholder-text-tertiary outline-none transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={sending || !newCpc}
              className={clsx(
                'num text-xs font-medium px-4 py-1.5 rounded transition-colors',
                'bg-amber-DEFAULT text-bg-base hover:opacity-90',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {sending ? 'Enviando...' : 'Enviar a Google Ads'}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="num text-xs text-text-tertiary hover:text-text-secondary transition-colors px-2"
            >
              ✕
            </button>
          </div>
        </div>

        {sendResult && (
          <p className={clsx(
            'num text-xs mt-1 px-1',
            sendResult.startsWith('✓') ? 'text-green-DEFAULT' : 'text-red-DEFAULT'
          )}>
            {sendResult}
          </p>
        )}
      </div>

      {/* ── Tabla ────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-bg-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-bg-surface border-b border-bg-border">
            <tr>
              {/* Checkbox all */}
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked }}
                  onChange={toggleAll}
                  className="accent-amber-DEFAULT cursor-pointer"
                />
              </th>
              <Th label="Campaña"     k="campaignName" />
              <Th label="CPC Techo"   k="cpcCeiling"   right />
              <Th label="CPC Actual"  k="avgCpc"       right />
              <Th label="Uso %"       k="cpcUsagePct"  right />
              <Th label="Clics"       k="clicks"       right />
              <Th label="Impresiones" k="impressions"  right />
              <Th label="CTR"         k="ctr"          right />
              <Th label="Coste"       k="costEur"      right />
              <Th label="IS"          k="isActual"     right />
              <Th label="Top IS"      k="topImpressionPct"          right />
              <Th label="Abs Top IS"  k="absoluteTopImpressionPct"  right />
              <Th label="ROAS Obj"    k="targetRoas"   right />
              <Th label="ROAS Real"   k="realRoas"     right />
              <th className="px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider text-left">
                Estado
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-bg-border">
            {sorted.map(m => {
              const isSelected = selected.has(m.campaignId)
              const usagePct   = m.cpcUsagePct ?? 0
              return (
                <tr
                  key={m.campaignId}
                  onClick={() => toggleOne(m.campaignId)}
                  className={clsx(
                    'cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-amber-DEFAULT/5 hover:bg-amber-DEFAULT/10'
                      : 'hover:bg-bg-surface'
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(m.campaignId)}
                      className="accent-amber-DEFAULT cursor-pointer"
                    />
                  </td>

                  {/* Nombre */}
                  <td className="px-3 py-2.5 text-text-primary font-medium whitespace-nowrap max-w-[220px] truncate">
                    {m.campaignName}
                  </td>

                  {/* CPC Techo */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {m.cpcCeiling !== null ? `${m.cpcCeiling.toFixed(2)} €` : '—'}
                  </td>

                  {/* CPC Actual */}
                  <td className="px-3 py-2.5 text-right num text-text-primary font-medium">
                    {m.avgCpc.toFixed(2)} €
                  </td>

                  {/* Uso % */}
                  <td className="px-3 py-2.5 text-right num">
                    {m.cpcUsagePct !== null ? (
                      <span className={clsx(
                        'font-medium',
                        usagePct >= 95 ? 'text-red-DEFAULT' :
                        usagePct >= 80 ? 'text-amber-DEFAULT' :
                        'text-green-DEFAULT'
                      )}>
                        {m.cpcUsagePct.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>

                  {/* Clics */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {m.clicks.toLocaleString('es-ES')}
                  </td>

                  {/* Impresiones */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {m.impressions.toLocaleString('es-ES')}
                  </td>

                  {/* CTR */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {m.ctr.toFixed(2)}%
                  </td>

                  {/* Coste */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {m.costEur.toFixed(2)} €
                  </td>

                  {/* IS */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {pct(m.isActual)}
                  </td>

                  {/* Top IS */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {pct(m.topImpressionPct)}
                  </td>

                  {/* Abs Top IS */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {pct(m.absoluteTopImpressionPct)}
                  </td>

                  {/* ROAS Obj */}
                  <td className="px-3 py-2.5 text-right num text-text-secondary">
                    {num(m.targetRoas)}
                  </td>

                  {/* ROAS Real */}
                  <td className="px-3 py-2.5 text-right num">
                    {m.realRoas !== null ? (
                      <span className={clsx(
                        'font-medium',
                        m.targetRoas && m.realRoas >= m.targetRoas ? 'text-green-DEFAULT' : 'text-amber-DEFAULT'
                      )}>
                        {m.realRoas.toFixed(2)}
                      </span>
                    ) : '—'}
                  </td>

                  {/* Estado */}
                  <td className={clsx('px-3 py-2.5 text-xs whitespace-nowrap', LEVEL_COLOR[m.recommendation.level])}>
                    {m.recommendation.message}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
