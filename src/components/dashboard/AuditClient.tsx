'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useAccountContext } from '@/contexts/AccountContext'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { renderAuditHtml } from '@/lib/audit/report'
import { ModelPicker, useModelChoice } from './ModelPicker'
import type {
  AccountAnalysis, AccountAuditData, AccountAuditResult, AccountKpis, AuditReport, Finding, GlobalAnalysis,
} from '@/lib/audit/types'

type Mode = 'one' | 'several' | 'all'
type Step = 'pending' | 'collecting' | 'analyzing' | 'done' | 'error'
interface Progress { step: Step; message?: string }

const PERIODS = [7, 14, 30, 90] as const
const CONCURRENCY = 3

const STEP_LABEL: Record<Step, string> = {
  pending: 'En cola', collecting: 'Descargando datos…', analyzing: 'Analizando con IA…', done: 'Listo', error: 'Error',
}
const STEP_COLOR: Record<Step, string> = {
  pending: 'text-text-tertiary', collecting: 'text-cyan-DEFAULT', analyzing: 'text-amber-DEFAULT',
  done: 'text-green-DEFAULT', error: 'text-red-DEFAULT',
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
  return json as T
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++])
  }))
}

function downloadHtml(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

export function AuditClient() {
  const { accounts, selectedIds, accountsLoading } = useAccountContext()
  const ai = useModelChoice()

  const [mode,     setMode]     = useState<Mode>('several')
  const [chosen,   setChosen]   = useState<string[]>([])
  const [filter,   setFilter]   = useState('')
  const [days,     setDays]     = useState<(typeof PERIODS)[number]>(30)
  const [running,  setRunning]  = useState(false)
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [globalStep, setGlobalStep] = useState<Step | null>(null)
  const [report,   setReport]   = useState<AuditReport | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const initialised = useRef(false)

  // Preselección inicial: la selección de la barra lateral
  useEffect(() => {
    if (initialised.current || !accounts.length) return
    initialised.current = true
    const valid = selectedIds.filter(id => accounts.some(a => a.id === id))
    setChosen(valid)
    if (valid.length === 1) setMode('one')
  }, [accounts, selectedIds])

  const targetIds = useMemo(
    () => (mode === 'all' ? accounts.map(a => a.id) : chosen.filter(id => accounts.some(a => a.id === id))),
    [mode, chosen, accounts],
  )

  const visible = accounts.filter(a => {
    const q = filter.toLowerCase()
    return !q || a.name.toLowerCase().includes(q) || a.id.includes(q)
  })

  const toggle = (id: string) => {
    if (mode === 'one') setChosen([id])
    else setChosen(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const changeMode = (m: Mode) => {
    setMode(m)
    if (m === 'one' && chosen.length > 1) setChosen(chosen.slice(0, 1))
  }

  const html = useMemo(() => (report ? renderAuditHtml(report) : ''), [report])

  async function run() {
    if (!targetIds.length || running) return
    if (targetIds.length > 10 && !confirm(`Vas a auditar ${targetIds.length} cuentas. Puede tardar varios minutos y consume más uso de OpenAI. ¿Continuar?`)) return

    setRunning(true); setError(null); setReport(null); setGlobalStep(null)
    setProgress(Object.fromEntries(targetIds.map(id => [id, { step: 'pending' as Step }])))
    const set = (id: string, p: Progress) => setProgress(prev => ({ ...prev, [id]: p }))

    const results = new Map<string, AccountAuditResult>()
    let period: AuditReport['period'] | null = null
    let model: string | null = null
    const chosenModel = ai.model   // fijo durante toda la auditoría

    await runPool(targetIds, CONCURRENCY, async id => {
      const acc = accounts.find(a => a.id === id)!
      let collected: { data: AccountAuditData; kpis: AccountKpis; findings: Finding[] }
      try {
        set(id, { step: 'collecting' })
        collected = await postJson('/api/audit/collect', { customerId: id, days })
        period ??= collected.data.period
      } catch (e: any) {
        set(id, { step: 'error', message: e.message })
        return
      }
      const base: AccountAuditResult = {
        customerId: id, name: acc.name, currency: collected.data.currency,
        kpis: collected.kpis, findings: collected.findings, analysis: null,
        unavailable: collected.data.unavailable,
      }
      try {
        set(id, { step: 'analyzing' })
        const r = await postJson<{ analysis: AccountAnalysis; model: string }>('/api/audit/analyze', { ...collected, model: chosenModel })
        model = r.model
        results.set(id, { ...base, analysis: r.analysis })
        set(id, { step: 'done' })
      } catch (e: any) {
        // Sin IA: se conserva el informe con las comprobaciones automáticas
        results.set(id, { ...base, analysisError: e.message })
        set(id, { step: 'error', message: `Análisis IA: ${e.message}` })
      }
    })

    const ordered = targetIds.map(id => results.get(id)).filter((r): r is AccountAuditResult => !!r)
    if (!ordered.length || !period) {
      setError('No se pudo auditar ninguna cuenta. Revisa los errores de cada cuenta.')
      setRunning(false)
      return
    }

    let global: GlobalAnalysis | null = null
    const analysed = ordered.filter(r => r.analysis)
    if (analysed.length >= 2) {
      setGlobalStep('analyzing')
      try {
        const r = await postJson<{ global: GlobalAnalysis }>('/api/audit/global', {
          accounts: analysed.map(a => ({ name: a.name, kpis: a.kpis, analysis: a.analysis })),
          model: chosenModel,
        })
        global = r.global
        setGlobalStep('done')
      } catch {
        setGlobalStep('error')
      }
    }

    setReport({ generatedAt: new Date().toISOString(), period, model, accounts: ordered, global })
    setRunning(false)
  }

  const filename = report
    ? `auditoria-google-ads-${report.accounts.length === 1 ? slug(report.accounts[0].name) : `${report.accounts.length}-cuentas`}-${report.generatedAt.slice(0, 10)}.html`
    : ''

  const doneCount = Object.values(progress).filter(p => p.step === 'done' || p.step === 'error').length
  const total     = Object.keys(progress).length

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <AppSidebar activeSection="audit" lastUpdate={null} loading={running} onRefresh={() => {}} />

      <main className="ml-[240px] flex-1 overflow-y-auto px-8 py-8 space-y-6">
        <div>
          <p className="num text-[10px] text-text-tertiary tracking-[0.2em] uppercase mb-1">System › Audit</p>
          <h1 className="num text-xl font-bold text-text-primary tracking-wide">Auditoría de cuentas</h1>
          <p className="text-xs text-text-secondary mt-1">
            Análisis experto de la configuración y el rendimiento: lo que está bien, lo que está mal y recomendaciones priorizadas.
          </p>
        </div>

        {/* ── Configuración ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-bg-card border border-bg-border rounded-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase">Cuentas a auditar</h3>
              <div className="flex gap-1">
                {([['one', 'Una'], ['several', 'Varias'], ['all', 'Todas']] as [Mode, string][]).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => changeMode(m)}
                    disabled={running}
                    className={`num text-[10px] px-3 py-1 rounded border tracking-wider transition-colors ${
                      mode === m ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT border-cyan-DEFAULT/40' : 'text-text-secondary border-bg-border hover:text-text-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode !== 'all' && (
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Buscar cuenta por nombre o ID…"
                className="num text-[11px] w-full bg-bg-base border border-bg-border focus:border-cyan-DEFAULT/60 rounded px-3 py-2 mb-2 text-text-primary placeholder-text-tertiary outline-none"
              />
            )}

            <div className={`max-h-[260px] overflow-y-auto border border-bg-border rounded ${mode === 'all' ? 'opacity-60' : ''}`}>
              {accountsLoading && <p className="num text-[10px] text-text-tertiary px-3 py-3">Cargando cuentas…</p>}
              {!accountsLoading && accounts.length === 0 && (
                <p className="num text-[10px] text-text-tertiary px-3 py-3">Tu usuario no tiene acceso a ninguna cuenta de Google Ads.</p>
              )}
              {(mode === 'all' ? accounts : visible).map(a => {
                const on = mode === 'all' || chosen.includes(a.id)
                return (
                  <button
                    key={a.id}
                    onClick={() => mode !== 'all' && toggle(a.id)}
                    disabled={running || mode === 'all'}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-bg-border/50 last:border-0 transition-colors ${
                      on ? 'bg-cyan-DEFAULT/5' : 'hover:bg-bg-hover'
                    }`}
                  >
                    <span className={`w-4 h-4 flex items-center justify-center border flex-shrink-0 ${mode === 'one' ? 'rounded-full' : 'rounded'} ${
                      on ? 'bg-cyan-DEFAULT border-cyan-DEFAULT text-bg-base' : 'border-[#444] text-transparent'
                    }`}>
                      <span className="text-[9px] font-bold leading-none">✓</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`num text-[11px] block truncate ${on ? 'text-cyan-DEFAULT' : 'text-text-primary'}`}>{a.name}</span>
                      <span className="num text-[9px] text-text-tertiary">{a.id} · {a.currency}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="num text-[10px] text-text-tertiary mt-2">
              {targetIds.length} cuenta{targetIds.length === 1 ? '' : 's'} seleccionada{targetIds.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="bg-bg-card border border-bg-border rounded-md p-5 flex flex-col">
            <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase mb-3">Periodo analizado</h3>
            <div className="grid grid-cols-4 gap-1 mb-4">
              {PERIODS.map(p => (
                <button
                  key={p}
                  onClick={() => setDays(p)}
                  disabled={running}
                  className={`num text-[11px] py-1.5 rounded border transition-colors ${
                    days === p ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT border-cyan-DEFAULT/40' : 'text-text-secondary border-bg-border hover:text-text-primary'
                  }`}
                >
                  {p}d
                </button>
              ))}
            </div>
            <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase mb-3">Modelo de IA</h3>
            <div className="mb-4"><ModelPicker choice={ai} disabled={running} /></div>
            <p className="text-[11px] text-text-secondary leading-relaxed mb-4">
              Se revisan conversiones, estrategia de puja, presupuesto e Impression Share, palabras clave y Nivel de Calidad,
              términos de búsqueda, anuncios, extensiones, dispositivos, horarios y ubicaciones.
            </p>
            <button
              onClick={run}
              disabled={running || targetIds.length === 0}
              className="mt-auto num text-[12px] font-bold w-full py-2.5 rounded bg-cyan-DEFAULT text-bg-base hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed tracking-wider"
            >
              {running ? `AUDITANDO… ${doneCount}/${total}` : 'GENERAR AUDITORÍA'}
            </button>
          </div>
        </div>

        {/* ── Progreso ── */}
        {total > 0 && (
          <div className="bg-bg-card border border-bg-border rounded-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase">Progreso</h3>
              <span className="num text-[10px] text-text-tertiary">{doneCount}/{total}</span>
            </div>
            <div className="h-1 bg-bg-border rounded-full overflow-hidden mb-3">
              <div className="h-full bg-cyan-DEFAULT transition-all duration-500" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
            </div>
            <div className="space-y-1">
              {Object.entries(progress).map(([id, p]) => (
                <div key={id} className="flex items-start justify-between gap-4 text-[11px] num">
                  <span className="text-text-primary truncate">{accounts.find(a => a.id === id)?.name ?? id}</span>
                  <span className={`${STEP_COLOR[p.step]} text-right`}>
                    {STEP_LABEL[p.step]}{p.message ? ` — ${p.message}` : ''}
                  </span>
                </div>
              ))}
              {globalStep && (
                <div className="flex items-start justify-between gap-4 text-[11px] num pt-1 border-t border-bg-border mt-2">
                  <span className="text-text-primary">Visión global</span>
                  <span className={STEP_COLOR[globalStep]}>{globalStep === 'analyzing' ? 'Redactando…' : STEP_LABEL[globalStep]}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {error && <div className="bg-red-dim border border-red-DEFAULT/30 text-red-DEFAULT rounded-md px-4 py-3 text-xs num">{error}</div>}

        {/* ── Informe ── */}
        {report && (
          <div className="bg-bg-card border border-bg-border rounded-md overflow-hidden">
            <div className="px-5 py-3 border-b border-bg-border flex items-center justify-between gap-3">
              <h3 className="num text-[10px] text-text-tertiary tracking-widest uppercase">Informe</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() } }}
                  className="num text-[11px] px-3 py-1.5 rounded border border-bg-border text-text-secondary hover:text-text-primary transition-colors"
                >
                  Abrir en pestaña
                </button>
                <button
                  onClick={() => downloadHtml(html, filename)}
                  className="num text-[11px] font-bold px-4 py-1.5 rounded bg-cyan-DEFAULT text-bg-base hover:opacity-90 transition-opacity"
                >
                  ⬇ Descargar HTML
                </button>
              </div>
            </div>
            <iframe title="Informe de auditoría" srcDoc={html} sandbox="allow-same-origin" className="w-full bg-white" style={{ height: '80vh' }} />
          </div>
        )}
      </main>
    </div>
  )
}
