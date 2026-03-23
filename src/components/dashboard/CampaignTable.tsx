'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { CampaignMetrics } from '@/types'
import clsx from 'clsx'

interface Props {
  metrics:           CampaignMetrics[]
  customerId:        string
  onRefresh?:        () => void
  onSelectCampaign?: (campaign: CampaignMetrics) => void
}

type SortKey = keyof Pick<
  CampaignMetrics,
  'campaignName' | 'cpcCeiling' | 'avgCpc' | 'cpcUsagePct' | 'clicks' |
  'impressions' | 'ctr' | 'costEur' | 'isActual' | 'topImpressionPct' |
  'absoluteTopImpressionPct' | 'targetRoas' | 'realRoas'
>

// ── Anchos por defecto de columnas (px) ──────────────────────

const DEFAULT_WIDTHS: Record<string, number> = {
  check:    36,
  name:    230,
  ceil:    100,
  cpc:     100,
  uso:      82,
  clicks:   82,
  impr:    106,
  ctr:      78,
  cost:    106,
  is:       66,
  topIs:    80,
  absTop:   92,
  rOb:      82,
  rReal:    82,
  status:  170,
}

const LEVEL_COLOR: Record<string, string> = {
  ok:      'text-green-DEFAULT',
  info:    'text-text-secondary',
  warning: 'text-amber-DEFAULT',
  alert:   'text-red-DEFAULT',
}

function pct(v: number | null)             { return v !== null ? `${Math.round(v * 100)}%` : '—' }
function eur(v: number | null)             { return v !== null ? `${v.toFixed(2)} €` : '—' }
function num(v: number | null, d = 2)      { return v !== null ? v.toFixed(d) : '—' }

export function CampaignTable({ metrics, customerId, onRefresh, onSelectCampaign }: Props) {
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [newCpc,      setNewCpc]      = useState('')
  const [sending,     setSending]     = useState(false)
  const [sendResult,  setSendResult]  = useState<string | null>(null)
  const [sortKey,     setSortKey]     = useState<SortKey>('campaignName')
  const [sortAsc,     setSortAsc]     = useState(true)
  const [colWidths,   setColWidths]   = useState(DEFAULT_WIDTHS)
  const [search,      setSearch]      = useState('')

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

  // ── Selección (checkbox) ─────────────────────────────────────
  const allIds      = metrics.map(m => m.campaignId)
  const allChecked  = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someChecked = !allChecked && allIds.some(id => selected.has(id))

  const toggleAll = () => allChecked ? setSelected(new Set()) : setSelected(new Set(allIds))
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // ── Envío bulk update ────────────────────────────────────────
  const handleSend = async () => {
    const ceiling = parseFloat(newCpc.replace(',', '.'))
    if (isNaN(ceiling) || ceiling <= 0) {
      setSendResult('Introduce un CPC techo válido (ej: 0.85)')
      return
    }
    const selectedMetrics = metrics.filter(m => selected.has(m.campaignId))
    setSending(true); setSendResult(null)
    try {
      const res = await fetch('/api/campaigns/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          campaigns: selectedMetrics.map(m => ({ campaignName: m.campaignName, newCpcCeiling: ceiling })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setSendResult(`✓ ${data.updated} campaña${data.updated !== 1 ? 's' : ''} actualizadas${data.mode ? ` (${data.mode})` : ''}`)
      setSelected(new Set()); setNewCpc('')
      onRefresh?.()
    } catch (e: any) {
      setSendResult(`Error: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  // ── Resize de columnas ───────────────────────────────────────
  const startResize = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = colWidths[col]

    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(50, startW + ev.clientX - startX)
      setColWidths(prev => ({ ...prev, [col]: newW }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [colWidths])

  // ── Componente de cabecera ordenable ─────────────────────────
  const Th = ({
    label, k, col, right,
  }: { label: string; k: SortKey; col: string; right?: boolean }) => (
    <th
      style={{ width: colWidths[col], minWidth: colWidths[col], position: 'relative' }}
      className="border-r border-[#222] last:border-r-0 select-none"
    >
      <div
        onClick={() => toggleSort(k)}
        className={clsx(
          'px-3 py-2.5 text-xs font-semibold text-[#c0c0c0] uppercase tracking-wide cursor-pointer',
          'hover:text-white hover:bg-[#1a1a1a] transition-colors flex items-center gap-1',
          right ? 'justify-end' : 'justify-start'
        )}
      >
        {label}
        {sortKey === k && <span className="opacity-50 text-[10px]">{sortAsc ? '↑' : '↓'}</span>}
      </div>
      {/* Drag handle */}
      <div
        onMouseDown={ev => startResize(col, ev)}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10"
      />
    </th>
  )

  // ── Filtro de búsqueda ───────────────────────────────────────
  const filtered = search.trim()
    ? sorted.filter(m => m.campaignName.toLowerCase().includes(search.toLowerCase().trim()))
    : sorted

  const totalWidth = Object.values(colWidths).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col gap-4">

      {/* ── Barra de acción bulk ─────────────────────────────── */}
      <div className={clsx(
        'sticky top-[57px] z-10 transition-all duration-200',
        selected.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <div className="bg-bg-surface border border-bg-border rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <span className="num text-sm text-text-secondary">
            {selected.size} campaña{selected.size !== 1 ? 's' : ''} seleccionada{selected.size !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <label className="num text-xs text-text-tertiary whitespace-nowrap">Nuevo CPC techo (€)</label>
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
              className="num text-xs font-medium px-4 py-1.5 rounded transition-colors bg-amber-DEFAULT text-bg-base hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? 'Enviando...' : 'Enviar a Google Ads'}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="num text-xs text-text-tertiary hover:text-text-secondary transition-colors px-2"
            >✕</button>
          </div>
        </div>
        {sendResult && (
          <p className={clsx('num text-xs mt-1 px-1', sendResult.startsWith('✓') ? 'text-green-DEFAULT' : 'text-red-DEFAULT')}>
            {sendResult}
          </p>
        )}
      </div>

      {/* ── Buscador ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-sm pointer-events-none">⌕</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar campaña..."
            className="w-full pl-8 pr-3 py-2 text-sm bg-[#111] border border-[#222] focus:border-[#444] rounded-lg text-white placeholder-[#444] outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-white transition-colors text-xs"
            >✕</button>
          )}
        </div>
        {search && (
          <span className="text-xs text-[#555]">
            {filtered.length} de {sorted.length} campañas
          </span>
        )}
      </div>

      {/* ── Tabla ────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-[#1e1e1e]">
        <table
          style={{ tableLayout: 'fixed', width: totalWidth, minWidth: '100%' }}
          className="border-collapse text-sm"
        >
          <thead className="bg-[#111] border-b border-[#1e1e1e]">
            <tr>
              {/* Checkbox all */}
              <th
                style={{ width: colWidths.check, minWidth: colWidths.check }}
                className="px-3 py-2.5 border-r border-[#222]"
              >
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked }}
                  onChange={toggleAll}
                  className="accent-amber-DEFAULT cursor-pointer"
                />
              </th>

              {/* Nombre */}
              <th
                style={{ width: colWidths.name, minWidth: colWidths.name, position: 'relative' }}
                className="border-r border-[#222] select-none"
              >
                <div
                  onClick={() => toggleSort('campaignName')}
                  className="px-3 py-2.5 text-xs font-semibold text-[#c0c0c0] uppercase tracking-wide cursor-pointer hover:text-white hover:bg-[#1a1a1a] transition-colors flex items-center gap-1"
                >
                  Campaña
                  {sortKey === 'campaignName' && <span className="opacity-50 text-[10px]">{sortAsc ? '↑' : '↓'}</span>}
                </div>
                <div onMouseDown={ev => startResize('name', ev)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10" />
              </th>

              <Th label="CPC Techo"   k="cpcCeiling"              col="ceil"   right />
              <Th label="CPC Actual"  k="avgCpc"                  col="cpc"    right />
              <Th label="Uso %"       k="cpcUsagePct"             col="uso"    right />
              <Th label="Clics"       k="clicks"                  col="clicks" right />
              <Th label="Impresiones" k="impressions"             col="impr"   right />
              <Th label="CTR"         k="ctr"                     col="ctr"    right />
              <Th label="Coste"       k="costEur"                 col="cost"   right />
              <Th label="IS"          k="isActual"                col="is"     right />
              <Th label="Top IS"      k="topImpressionPct"        col="topIs"  right />
              <Th label="Abs Top IS"  k="absoluteTopImpressionPct" col="absTop" right />
              <Th label="ROAS Obj"    k="targetRoas"              col="rOb"    right />
              <Th label="ROAS Real"   k="realRoas"                col="rReal"  right />

              {/* Estado */}
              <th
                style={{ width: colWidths.status, minWidth: colWidths.status, position: 'relative' }}
                className="border-l border-[#222] select-none"
              >
                <div className="px-3 py-2.5 text-xs font-semibold text-[#c0c0c0] uppercase tracking-wide">Estado</div>
                <div onMouseDown={ev => startResize('status', ev)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10" />
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#161616]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={15} className="px-6 py-10 text-center text-[#555] text-sm">
                  No hay campañas que coincidan con «{search}»
                </td>
              </tr>
            )}
            {filtered.map(m => {
              const isSelected = selected.has(m.campaignId)
              const usagePct   = m.cpcUsagePct ?? 0
              return (
                <tr
                  key={m.campaignId}
                  onClick={() => onSelectCampaign?.(m)}
                  className={clsx(
                    'cursor-pointer transition-colors',
                    isSelected ? 'bg-amber-DEFAULT/5 hover:bg-amber-DEFAULT/8' : 'hover:bg-[#111]'
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2.5 border-r border-[#161616]" onClick={e => { e.stopPropagation(); toggleOne(m.campaignId) }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(m.campaignId)}
                      className="accent-amber-DEFAULT cursor-pointer"
                    />
                  </td>

                  {/* Nombre */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-text-primary font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    {m.campaignName}
                  </td>

                  {/* CPC Techo */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {m.cpcCeiling !== null ? `${m.cpcCeiling.toFixed(2)} €` : '—'}
                  </td>

                  {/* CPC Actual */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-primary font-medium">
                    {m.avgCpc.toFixed(2)} €
                  </td>

                  {/* Uso % */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num">
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
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {m.clicks.toLocaleString('es-ES')}
                  </td>

                  {/* Impresiones */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {m.impressions.toLocaleString('es-ES')}
                  </td>

                  {/* CTR */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {m.ctr.toFixed(2)}%
                  </td>

                  {/* Coste */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {m.costEur.toFixed(2)} €
                  </td>

                  {/* IS */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {pct(m.isActual)}
                  </td>

                  {/* Top IS */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {pct(m.topImpressionPct)}
                  </td>

                  {/* Abs Top IS */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {pct(m.absoluteTopImpressionPct)}
                  </td>

                  {/* ROAS Obj */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                    {num(m.targetRoas)}
                  </td>

                  {/* ROAS Real */}
                  <td className="px-3 py-2.5 border-r border-[#161616] text-right num">
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
                  <td className={clsx('px-3 py-2.5 text-xs whitespace-nowrap overflow-hidden text-ellipsis', LEVEL_COLOR[m.recommendation.level])}>
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
