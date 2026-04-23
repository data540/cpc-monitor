'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { CampaignMetrics } from '@/types'
import clsx from 'clsx'

interface Props {
  metrics:           CampaignMetrics[]
  customerId:        string
  numDays:           number
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
  budget:  110,
  estCost: 110,
  spendPct: 90,
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

export function CampaignTable({ metrics, customerId, numDays, onRefresh, onSelectCampaign }: Props) {
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [newCpc,      setNewCpc]      = useState('')
  const [sending,     setSending]     = useState(false)
  const [sendResult,  setSendResult]  = useState<string | null>(null)
  const [sortKey,     setSortKey]     = useState<SortKey>('campaignName')
  const [sortAsc,     setSortAsc]     = useState(true)
  const [colWidths,   setColWidths]   = useState(DEFAULT_WIDTHS)
  const [search,      setSearch]      = useState('')

  // ── Scrollbar lateral (proxy nativo) ─────────────────────────
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const proxyRef       = useRef<HTMLDivElement>(null)
  const isSyncing      = useRef(false)

  const onTableScroll = useCallback(() => {
    if (isSyncing.current) return
    const table = tableScrollRef.current
    const proxy = proxyRef.current
    if (!table || !proxy) return
    isSyncing.current = true
    proxy.scrollLeft = table.scrollLeft
    requestAnimationFrame(() => { isSyncing.current = false })
  }, [])

  const onProxyScroll = useCallback(() => {
    if (isSyncing.current) return
    const table = tableScrollRef.current
    const proxy = proxyRef.current
    if (!table || !proxy) return
    isSyncing.current = true
    table.scrollLeft = proxy.scrollLeft
    requestAnimationFrame(() => { isSyncing.current = false })
  }, [])

  useEffect(() => {
    const table = tableScrollRef.current
    if (!table) return
    table.addEventListener('scroll', onTableScroll, { passive: true })
    return () => table.removeEventListener('scroll', onTableScroll)
  }, [onTableScroll])

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

      {/* ── Header "Top Campaigns" ────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="num text-sm font-bold text-text-primary tracking-widest uppercase">Top Campaigns</h2>
          <span className="num text-[9px] px-2 py-0.5 rounded-sm tracking-[0.2em] uppercase border"
                style={{ background: 'rgba(0,212,255,0.08)', borderColor: 'rgba(0,212,255,0.25)', color: '#00D4FF' }}>
            LIVE MONITORING
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="num text-[10px] px-3 py-1 rounded-sm border tracking-widest uppercase transition-colors"
                  style={{ background: 'rgba(0,212,255,0.1)', borderColor: 'rgba(0,212,255,0.3)', color: '#00D4FF' }}>
            Performance
          </button>
          <button className="num text-[10px] px-3 py-1 rounded-sm border border-bg-border text-text-tertiary tracking-widest uppercase hover:text-text-secondary transition-colors">
            Bidding
          </button>
        </div>
      </div>

      {/* ── Barra de acción bulk ─────────────────────────────── */}
      <div className={clsx(
        'sticky top-[57px] z-10 transition-all duration-200',
        selected.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <div className="bg-bg-surface border border-bg-border rounded px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
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
              className="num text-sm w-24 bg-bg-card border border-bg-border focus:border-cyan-DEFAULT/60 rounded px-2 py-1.5 text-text-primary placeholder-text-tertiary outline-none transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={sending || !newCpc}
              className="num text-xs font-medium px-4 py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)', color: '#00D4FF' }}
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
            className="w-full pl-8 pr-3 py-2 text-xs num bg-bg-card border border-bg-border focus:border-cyan-DEFAULT/40 rounded text-white placeholder-text-tertiary outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-white transition-colors text-xs"
            >✕</button>
          )}
        </div>
        <span className="num text-[10px] text-text-tertiary tracking-wider">
          {search ? `${filtered.length} / ${sorted.length}` : `${sorted.length} CAMPAIGNS`}
        </span>
      </div>

      {/* ── Tabla ────────────────────────────────────────────── */}
      <div
        ref={tableScrollRef}
        className="overflow-auto rounded-t-lg border border-[#1e1e1e] hide-scrollbar"
        style={{ maxHeight: 'calc(100vh - 380px)' }}
      >
        <table
          style={{ tableLayout: 'fixed', width: totalWidth, minWidth: '100%' }}
          className="border-collapse text-sm"
        >
          <thead className="bg-[#111] border-b border-[#1e1e1e] sticky top-0 z-20">
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
                  className="accent-cyan-DEFAULT cursor-pointer"
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

              {/* Presupuesto diario */}
              <th style={{ width: colWidths.budget, minWidth: colWidths.budget, position: 'relative' }}
                  className="border-r border-[#222] select-none">
                <div className="px-3 py-2.5 text-xs font-semibold text-[#c0c0c0] uppercase tracking-wide text-right">
                  Presup. diario
                </div>
                <div onMouseDown={ev => startResize('budget', ev)}
                     className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10" />
              </th>

              {/* Coste estimado */}
              <th style={{ width: colWidths.estCost, minWidth: colWidths.estCost, position: 'relative' }}
                  className="border-r border-[#222] select-none">
                <div className="px-3 py-2.5 text-xs font-semibold text-[#c0c0c0] uppercase tracking-wide text-right">
                  Coste estimado
                </div>
                <div onMouseDown={ev => startResize('estCost', ev)}
                     className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10" />
              </th>

              {/* % Gasto/Estimado */}
              <th style={{ width: colWidths.spendPct, minWidth: colWidths.spendPct, position: 'relative' }}
                  className="border-r border-[#222] select-none">
                <div className="px-3 py-2.5 text-xs font-semibold text-[#c0c0c0] uppercase tracking-wide text-right">
                  % Gasto/Est.
                </div>
                <div onMouseDown={ev => startResize('spendPct', ev)}
                     className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10" />
              </th>

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
                <td colSpan={18} className="px-6 py-10 text-center text-[#555] text-sm">
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
                    isSelected ? 'bg-cyan-DEFAULT/5 hover:bg-cyan-DEFAULT/8' : 'hover:bg-[#111]'
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2.5 border-r border-[#161616]" onClick={e => { e.stopPropagation(); toggleOne(m.campaignId) }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(m.campaignId)}
                      className="accent-cyan-DEFAULT cursor-pointer"
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
                  <td className="px-3 py-2.5 border-r border-[#161616]">
                    {m.isActual !== null ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="num text-xs text-text-secondary">{Math.round(m.isActual * 100)}%</span>
                        <div className="progress-bar w-full">
                          <div className="progress-bar-fill" style={{ width: `${m.isActual * 100}%` }} />
                        </div>
                      </div>
                    ) : <span className="num text-xs text-text-tertiary text-right block">—</span>}
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

                  {/* Presupuesto diario / Coste estimado / % Gasto */}
                  {(() => {
                    const estimatedCost = m.dailyBudgetEur !== null ? m.dailyBudgetEur * numDays : null
                    const spendVsEstPct = estimatedCost && estimatedCost > 0 ? (m.costEur / estimatedCost) * 100 : null
                    return (
                      <>
                        <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                          {eur(m.dailyBudgetEur)}
                        </td>
                        <td className="px-3 py-2.5 border-r border-[#161616] text-right num text-text-secondary">
                          {eur(estimatedCost)}
                        </td>
                        <td className="px-3 py-2.5 border-r border-[#161616] text-right num">
                          {spendVsEstPct !== null ? (
                            <span className={clsx(
                              'font-medium',
                              spendVsEstPct > 100 ? 'text-red-DEFAULT' :
                              spendVsEstPct > 90  ? 'text-amber-DEFAULT' : 'text-green-DEFAULT'
                            )}>
                              {spendVsEstPct.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                      </>
                    )
                  })()}

                  {/* Estado */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className={clsx(
                        'num text-[9px] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1 w-fit tracking-wider uppercase border',
                        m.recommendation.level === 'ok'      && 'bg-green-dim text-green-DEFAULT border-green-DEFAULT/25',
                        m.recommendation.level === 'info'    && 'bg-blue-dim text-blue-DEFAULT border-blue-DEFAULT/25',
                        m.recommendation.level === 'warning' && 'bg-amber-dim text-amber-DEFAULT border-amber-DEFAULT/25',
                        m.recommendation.level === 'alert'   && 'bg-red-dim text-red-DEFAULT border-red-DEFAULT/25',
                      )}>
                        <span className={clsx(
                          'w-1 h-1 rounded-full inline-block',
                          m.recommendation.level === 'ok'      && 'bg-green-DEFAULT',
                          m.recommendation.level === 'info'    && 'bg-blue-DEFAULT',
                          m.recommendation.level === 'warning' && 'bg-amber-DEFAULT',
                          m.recommendation.level === 'alert'   && 'bg-red-DEFAULT',
                        )} />
                        {m.recommendation.level === 'ok'      && 'ACTIVE'}
                        {m.recommendation.level === 'info'    && 'INFO'}
                        {m.recommendation.level === 'warning' && 'AVISO'}
                        {m.recommendation.level === 'alert'   && 'ALERTA'}
                      </span>
                      <span className={clsx('text-[10px] leading-tight', LEVEL_COLOR[m.recommendation.level])}>
                        {m.recommendation.message}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Barra de scroll lateral (proxy nativo) ───────────── */}
      <div
        ref={proxyRef}
        className="table-proxy-scroll overflow-x-auto overflow-y-hidden border-x border-b border-[#1e1e1e] rounded-b-lg"
        style={{ height: 18 }}
        onScroll={onProxyScroll}
      >
        <div style={{ width: totalWidth, height: 1 }} />
      </div>
    </div>
  )
}
