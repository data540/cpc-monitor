// ── Informe HTML de CPA Analysis (autocontenido, diseño neutro) ──
import type { CpaReport, Verdict } from './types'
import { fmtDelta, fmtMoney, fmtNum, fmtPct, strategyLabel, systemStatusLabel } from './metrics'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const VERDICT_STYLE: Record<Verdict, { label: string; color: string }> = {
  escalar:   { label: 'Escalar',   color: '#15803d' },
  mantener:  { label: 'Mantener',  color: '#0369a1' },
  optimizar: { label: 'Optimizar', color: '#b45309' },
  reducir:   { label: 'Reducir',   color: '#c2410c' },
  pausar:    { label: 'Pausar',    color: '#b91c1c' },
}
const LEVEL_STYLE = {
  critical: { label: 'Crítico', bg: '#fef2f2', border: '#fca5a5', color: '#b91c1c' },
  warning:  { label: 'Aviso',   bg: '#fffbeb', border: '#fcd34d', color: '#b45309' },
  info:     { label: 'Info',    bg: '#f0f9ff', border: '#7dd3fc', color: '#0369a1' },
}
const PRIORITY_ORDER = { alta: 0, media: 1, baja: 2 }

function scoreBand(s: number) {
  if (s >= 80) return { label: 'Buena', color: '#15803d' }
  if (s >= 60) return { label: 'Mejorable', color: '#b45309' }
  return { label: 'Necesita atención', color: '#b91c1c' }
}

export function renderCpaReportHtml(r: CpaReport): string {
  const cur = r.account.currency
  const m = (n: number | null) => fmtMoney(n, cur)
  const k = r.kpis
  const delta = (cur: number | null, prev: number | null, inverse = false) => {
    const d = fmtDelta(cur, prev)
    if (d === null) return ''
    const good = inverse ? d < 0 : d > 0
    return `<span class="delta" style="color:${good ? '#15803d' : '#b91c1c'}">${d > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(d), 0)}</span>`
  }
  const verdicts = new Map((r.analysis?.campaigns ?? []).map(c => [c.campaign, c]))
  const generated = new Date(r.generatedAt).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })

  const kpiCards = [
    ['Coste', m(k.cost), delta(k.cost, k.prevCost)],
    ['Conversiones', fmtNum(k.conversions, 1), delta(k.conversions, k.prevConversions)],
    ['CPA real', m(k.cpa), delta(k.cpa, k.prevCpa, true)],
    ['CPA de referencia', m(k.refCpa), ''],
    ['Tasa de conversión', fmtPct(k.convRate, 2), ''],
    ['CPC medio', m(k.cpc), ''],
    ['Cuota de impresiones', fmtPct(k.isShare, 0), ''],
    ['Perdida por presupuesto', fmtPct(k.isLostBudget, 0), ''],
  ].map(([l, v, d]) => `<div class="kpi"><div class="kl">${l}</div><div class="kv">${v}</div>${d}</div>`).join('')

  const a = r.analysis
  const band = a ? scoreBand(a.score) : null

  const campaignsRows = r.campaigns.map(c => {
    const v = verdicts.get(c.name)
    const vs = v ? VERDICT_STYLE[v.verdict] : null
    const devColor = c.deviation === null ? '#64748b' : c.deviation > 0.2 ? '#b91c1c' : c.deviation < -0.1 ? '#15803d' : '#334155'
    return `<tr>
      <td><strong>${esc(c.name)}</strong><div class="sub">${esc(strategyLabel(c.biddingType, c.targetCpa))}${c.portfolioName ? ` · cartera "${esc(c.portfolioName)}"` : ''} · ${esc(systemStatusLabel(c.systemStatus))}</div></td>
      <td class="n">${m(c.cost)}</td><td class="n">${fmtNum(c.conversions, 1)}</td>
      <td class="n">${m(c.cpa)}</td><td class="n">${m(c.refCpa)}${c.refIsAverage ? '<div class="sub">media cuenta</div>' : ''}</td>
      <td class="n" style="color:${devColor}">${c.deviation === null ? '—' : `${c.deviation > 0 ? '+' : ''}${fmtPct(c.deviation, 0)}`}</td>
      <td class="n">${m(c.cpa7)}</td>
      <td>${vs ? `<span class="pill" style="color:${vs.color};border-color:${vs.color}">${vs.label}</span>` : '—'}</td>
    </tr>${v ? `<tr class="detail"><td colspan="8"><strong>Diagnóstico:</strong> ${esc(v.diagnosis)}<br><strong>Acción:</strong> ${esc(v.action)}</td></tr>` : ''}`
  }).join('')

  const alertsHtml = r.alerts.length ? r.alerts.map(al => {
    const s = LEVEL_STYLE[al.level]
    return `<div class="alert" style="background:${s.bg};border-color:${s.border}">
      <span class="pill" style="color:${s.color};border-color:${s.color}">${s.label}</span>
      <strong>${esc(al.title)}</strong>${al.campaign ? ` <span class="sub">· ${esc(al.campaign)}</span>` : ''}
      <div>${esc(al.description)}</div></div>`
  }).join('') : '<p class="muted">Sin alertas automáticas.</p>'

  const aiHtml = a ? `
    <section>
      <h2>Diagnóstico del experto</h2>
      <div class="score"><div class="sv" style="color:${band!.color}">${a.score}</div><div><div class="sl" style="color:${band!.color}">${band!.label}</div><div class="muted">Salud de la cuenta respecto al CPA (0-100)</div></div></div>
      <p class="summary">${esc(a.summary)}</p>
      ${a.alerts.length ? `<h3>Avisos del experto</h3>${a.alerts.map(x => {
        const s = LEVEL_STYLE[x.severity]
        return `<div class="alert" style="background:${s.bg};border-color:${s.border}"><span class="pill" style="color:${s.color};border-color:${s.color}">${s.label}</span> <strong>${esc(x.title)}</strong><div>${esc(x.detail)}</div></div>`
      }).join('')}` : ''}
    </section>
    ${a.targets.length ? `<section><h2>Ajustes de CPA objetivo sugeridos</h2>
      <table><thead><tr><th>Campaña</th><th class="n">Actual</th><th class="n">Sugerido</th><th>Motivo</th></tr></thead><tbody>
      ${a.targets.map(t => `<tr><td>${esc(t.campaign)}</td><td class="n">${m(t.currentTarget)}</td><td class="n"><strong>${m(t.suggestedTarget)}</strong></td><td>${esc(t.rationale)}</td></tr>`).join('')}
      </tbody></table></section>` : ''}
    ${a.recommendations.length ? `<section><h2>Recomendaciones</h2>
      <table><thead><tr><th>Prioridad</th><th>Recomendación</th><th>Impacto esperado</th><th>Confianza</th></tr></thead><tbody>
      ${[...a.recommendations].sort((x, y) => PRIORITY_ORDER[x.priority] - PRIORITY_ORDER[y.priority]).map(x => `<tr>
        <td><span class="pill prio-${x.priority}">${x.priority}</span></td>
        <td><strong>${esc(x.title)}</strong><div>${esc(x.action)}</div></td><td>${esc(x.impact)}</td><td>${esc(x.confidence)}</td></tr>`).join('')}
      </tbody></table></section>` : ''}
    ${a.doNotTouch.length ? `<section><h2>Qué no tocar por ahora</h2><ul>${a.doNotTouch.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
  ` : `<section><p class="muted">Este informe no incluye análisis de IA.</p></section>`

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CPA Analysis · ${esc(r.account.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #f8fafc; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px 64px; }
  header { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 0 0 12px; } h3 { font-size: 15px; margin: 16px 0 8px; }
  section { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .muted, .sub { color: #64748b; } .sub { font-size: 12px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  .kl { font-size: 12px; color: #64748b; } .kv { font-size: 20px; font-weight: 700; } .delta { font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { font-size: 12px; color: #64748b; font-weight: 600; } .n { text-align: right; white-space: nowrap; }
  tr.detail td { background: #f8fafc; font-size: 12.5px; color: #334155; }
  .pill { display: inline-block; font-size: 11px; font-weight: 600; border: 1px solid; border-radius: 999px; padding: 1px 8px; text-transform: capitalize; }
  .prio-alta { color: #b91c1c; } .prio-media { color: #b45309; } .prio-baja { color: #0369a1; }
  .alert { border: 1px solid; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
  .score { display: flex; gap: 16px; align-items: center; margin-bottom: 12px; }
  .sv { font-size: 44px; font-weight: 800; line-height: 1; } .sl { font-weight: 700; font-size: 16px; }
  .summary { font-size: 15px; }
  footer { color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px; }
  @media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, 1fr); } table { font-size: 12px; } }
  @media print { body { background: #fff; } section { break-inside: avoid; border-color: #cbd5e1; } }
</style></head>
<body><div class="wrap">
  <header>
    <h1>Análisis de CPA · ${esc(r.account.name)}</h1>
    <div class="muted">Cuenta ${esc(r.account.customerId)} · ${esc(r.period.start)} a ${esc(r.period.end)} (${r.period.days} días) · ${r.conversionsMode === 'all' ? 'todas las conversiones' : 'conversiones principales'} · generado el ${esc(generated)}</div>
  </header>
  <section><h2>Indicadores (campañas analizadas)</h2><div class="kpis">${kpiCards}</div>
    <p class="sub">Variación frente a los ${r.period.days} días anteriores. La referencia de CPA es el objetivo de cada campaña o, si no tiene, la media de la cuenta.</p></section>
  ${aiHtml}
  <section><h2>Campañas</h2>
    <table><thead><tr><th>Campaña</th><th class="n">Coste</th><th class="n">Conv.</th><th class="n">CPA</th><th class="n">Referencia</th><th class="n">Desviación</th><th class="n">CPA 7 d</th><th>Veredicto</th></tr></thead>
    <tbody>${campaignsRows}</tbody></table></section>
  <section><h2>Alertas automáticas</h2>${alertsHtml}</section>
  <footer>Informe generado automáticamente${r.model ? ` · análisis con ${esc(r.model)}` : ''}. Revisa las recomendaciones antes de aplicarlas.</footer>
</div></body></html>`
}
