// ── Informe HTML de auditoría (marca neutra, autocontenido) ───
// Función pura: se usa en el navegador para mostrar y para descargar.

import { AREA_LABELS } from './types'
import type { AccountAuditResult, AuditReport, Finding, AuditArea } from './types'
import { formatUsage } from '@/lib/ai/usage'

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const nf = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined || !isFinite(n) ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const money = (n: number | null | undefined, cur: string) => (n === null || n === undefined ? '—' : `${nf(n, 2)} ${esc(cur)}`)
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${nf(n * 100, 2)} %`)
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })

function scoreBand(s: number) {
  if (s >= 90) return { label: 'Excelente', cls: 'band-ok' }
  if (s >= 75) return { label: 'Buena', cls: 'band-ok' }
  if (s >= 60) return { label: 'Mejorable', cls: 'band-warn' }
  return { label: 'Deficiente', cls: 'band-crit' }
}

const areaLabel = (a: AuditArea) => AREA_LABELS[a] ?? a
const prioOrder = { alta: 0, media: 1, baja: 2 } as const

function renderFindings(findings: Finding[]) {
  if (!findings.length) return '<p class="muted">Sin comprobaciones disponibles.</p>'
  const byArea = new Map<AuditArea, Finding[]>()
  for (const f of findings) byArea.set(f.area, [...(byArea.get(f.area) ?? []), f])
  const sevLabel = { ok: 'Correcto', warning: 'Aviso', critical: 'Crítico' }
  return [...byArea.entries()].map(([area, list]) => `
    <div class="check-group">
      <h4>${esc(areaLabel(area))}</h4>
      <ul class="checks">
        ${list.sort((a, b) => ({ critical: 0, warning: 1, ok: 2 }[a.severity] - { critical: 0, warning: 1, ok: 2 }[b.severity])).map(f => `
          <li><span class="sev sev-${f.severity}">${sevLabel[f.severity]}</span>
            <div><strong>${esc(f.title)}</strong>${f.scope ? ` <span class="scope">· ${esc(f.scope)}</span>` : ''}<br><span class="muted">${esc(f.detail)}</span></div></li>`).join('')}
      </ul>
    </div>`).join('')
}

function renderAccount(a: AccountAuditResult, idx: number) {
  const k = a.kpis
  const kpis: [string, string][] = [
    ['Coste', money(k.cost, a.currency)], ['Clics', nf(k.clicks)], ['Impresiones', nf(k.impressions)],
    ['CTR', pct(k.ctr)], ['CPC medio', money(k.avgCpc, a.currency)], ['Conversiones', nf(k.conversions, 1)],
    ['Valor conv.', money(k.convValue, a.currency)], ['ROAS', k.roas === null ? '—' : nf(k.roas, 2)], ['CPA', money(k.cpa, a.currency)],
  ]
  const an = a.analysis
  const band = an ? scoreBand(an.score) : null
  const counts = {
    ok: a.findings.filter(f => f.severity === 'ok').length,
    warning: a.findings.filter(f => f.severity === 'warning').length,
    critical: a.findings.filter(f => f.severity === 'critical').length,
  }

  return `
  <section class="account" id="cuenta-${idx}">
    <header class="acc-head">
      <div>
        <p class="eyebrow">Cuenta ${esc(a.customerId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'))}</p>
        <h2>${esc(a.name)}</h2>
      </div>
      ${an && band ? `<div class="score ${band.cls}"><span class="score-n">${an.score}</span><span class="score-l">/100 · ${band.label}</span></div>` : ''}
    </header>

    <div class="kpis">${kpis.map(([l, v]) => `<div class="kpi"><span>${l}</span><strong>${v}</strong></div>`).join('')}</div>

    <div class="tally">
      <span class="sev sev-critical">${counts.critical} críticos</span>
      <span class="sev sev-warning">${counts.warning} avisos</span>
      <span class="sev sev-ok">${counts.ok} correctos</span>
    </div>

    ${an ? `
    <h3>Resumen ejecutivo</h3>
    <p class="summary">${esc(an.summary)}</p>

    <div class="cols">
      <div class="block block-ok">
        <h3>✅ Lo que está bien</h3>
        ${an.strengths.length ? `<ul>${an.strengths.map(s => `<li><strong>${esc(s.title)}</strong><span class="tag">${esc(areaLabel(s.area))}</span><br>${esc(s.detail)}</li>`).join('')}</ul>` : '<p class="muted">Sin puntos fuertes destacables.</p>'}
      </div>
      <div class="block block-bad">
        <h3>❌ Lo que está mal</h3>
        ${an.issues.length ? `<ul>${[...an.issues].sort((x, y) => (x.severity === 'critical' ? 0 : 1) - (y.severity === 'critical' ? 0 : 1)).map(i => `<li><span class="sev sev-${i.severity}">${i.severity === 'critical' ? 'Crítico' : 'Aviso'}</span> <strong>${esc(i.title)}</strong><span class="tag">${esc(areaLabel(i.area))}</span><br>${esc(i.detail)}</li>`).join('')}</ul>` : '<p class="muted">No se han detectado problemas relevantes.</p>'}
      </div>
    </div>

    <h3>💡 Recomendaciones</h3>
    ${an.recommendations.length ? `
    <table class="recs">
      <thead><tr><th>Prioridad</th><th>Recomendación</th><th>Impacto esperado</th><th>Esfuerzo</th></tr></thead>
      <tbody>${[...an.recommendations].sort((x, y) => prioOrder[x.priority] - prioOrder[y.priority]).map(r => `
        <tr>
          <td><span class="prio prio-${r.priority}">${esc(r.priority)}</span></td>
          <td><strong>${esc(r.title)}</strong><span class="tag">${esc(areaLabel(r.area))}</span><br><span class="muted">${esc(r.action)}</span></td>
          <td>${esc(r.impact)}</td>
          <td>${esc(r.effort)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p class="muted">Sin recomendaciones.</p>'}
    ` : `<div class="notice">No se pudo generar el análisis experto de esta cuenta${a.analysisError ? `: ${esc(a.analysisError)}` : ''}. Se muestran las comprobaciones automáticas.</div>`}

    <h3>Comprobaciones automáticas</h3>
    ${renderFindings(a.findings)}

    ${a.unavailable.length ? `<p class="muted small">Datos no disponibles para esta cuenta: ${a.unavailable.map(esc).join(', ')}.</p>` : ''}
  </section>`
}

export function renderAuditHtml(r: AuditReport): string {
  const multi = r.accounts.length > 1
  const title = multi ? `Auditoría de Google Ads · ${r.accounts.length} cuentas` : `Auditoría de Google Ads · ${r.accounts[0]?.name ?? ''}`
  const totals = r.accounts.reduce((s, a) => ({ cost: s.cost + a.kpis.cost, conv: s.conv + a.kpis.conversions, value: s.value + a.kpis.convValue }), { cost: 0, conv: 0, value: 0 })
  const currencies = Array.from(new Set(r.accounts.map(a => a.currency)))
  const oneCur = currencies.length === 1 ? currencies[0] : null

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --ink:#1d2433; --muted:#5f6b7a; --line:#e3e7ee; --bg:#f6f7f9; --card:#fff;
          --ok:#1f8a4c; --ok-bg:#e8f5ee; --warn:#b26a00; --warn-bg:#fff4e0; --crit:#c62828; --crit-bg:#fdecea; --accent:#2f5bea; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px 64px; }
  .cover { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:32px; margin-bottom:24px; }
  .cover h1 { margin:4px 0 8px; font-size:28px; letter-spacing:-.01em; }
  .eyebrow { margin:0; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  .meta { display:flex; flex-wrap:wrap; gap:8px 24px; color:var(--muted); font-size:14px; }
  .toc { margin-top:16px; display:flex; flex-wrap:wrap; gap:8px; }
  .toc a { font-size:13px; padding:4px 10px; border:1px solid var(--line); border-radius:999px; color:var(--ink); text-decoration:none; background:var(--bg); }
  .toc a:hover { border-color:var(--accent); color:var(--accent); }
  .account, .global { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px 32px; margin-bottom:24px; }
  .acc-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:16px; }
  h2 { margin:2px 0 0; font-size:22px; }
  h3 { margin:24px 0 10px; font-size:17px; }
  h4 { margin:16px 0 6px; font-size:14px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
  .score { text-align:right; border-radius:12px; padding:10px 16px; min-width:120px; }
  .score-n { display:block; font-size:34px; font-weight:700; line-height:1; }
  .score-l { font-size:12px; }
  .band-ok { background:var(--ok-bg); color:var(--ok); } .band-warn { background:var(--warn-bg); color:var(--warn); } .band-crit { background:var(--crit-bg); color:var(--crit); }
  .kpis { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px; }
  .kpi { background:var(--bg); border-radius:10px; padding:10px 12px; }
  .kpi span { display:block; font-size:12px; color:var(--muted); }
  .kpi strong { font-size:17px; }
  .tally { display:flex; gap:8px; margin:14px 0 0; flex-wrap:wrap; }
  .summary { background:var(--bg); border-left:4px solid var(--accent); padding:12px 16px; border-radius:6px; margin:0; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .block { border-radius:12px; padding:4px 18px 10px; }
  .block-ok { background:var(--ok-bg); } .block-bad { background:var(--crit-bg); }
  .block ul { padding-left:18px; margin:0 0 8px; } .block li { margin:0 0 10px; }
  .tag { display:inline-block; margin-left:6px; font-size:11px; padding:1px 7px; border-radius:999px; background:rgba(0,0,0,.06); color:var(--muted); vertical-align:1px; }
  .sev { display:inline-block; font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; white-space:nowrap; }
  .sev-ok { background:var(--ok-bg); color:var(--ok); } .sev-warning { background:var(--warn-bg); color:var(--warn); } .sev-critical { background:var(--crit-bg); color:var(--crit); }
  .recs { width:100%; border-collapse:collapse; font-size:14px; }
  .recs th { text-align:left; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid var(--line); padding:8px; }
  .recs td { border-bottom:1px solid var(--line); padding:10px 8px; vertical-align:top; }
  .prio { display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; padding:2px 8px; border-radius:6px; }
  .prio-alta { background:var(--crit-bg); color:var(--crit); } .prio-media { background:var(--warn-bg); color:var(--warn); } .prio-baja { background:var(--bg); color:var(--muted); }
  .checks { list-style:none; padding:0; margin:0; }
  .checks li { display:flex; gap:10px; align-items:flex-start; padding:8px 0; border-bottom:1px solid var(--line); }
  .checks li .sev { margin-top:2px; min-width:66px; text-align:center; }
  .scope { color:var(--accent); font-size:13px; }
  .muted { color:var(--muted); } .small { font-size:13px; margin-top:16px; }
  .notice { background:var(--warn-bg); color:var(--warn); padding:12px 16px; border-radius:8px; margin-top:16px; }
  .overview { width:100%; border-collapse:collapse; font-size:14px; margin-top:12px; }
  .overview th, .overview td { text-align:left; padding:8px; border-bottom:1px solid var(--line); }
  .overview th { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
  .global ol { padding-left:20px; }
  footer { color:var(--muted); font-size:12px; text-align:center; margin-top:32px; }
  @media (max-width: 720px) { .cols { grid-template-columns:1fr; } .acc-head { flex-direction:column; } .score { text-align:left; } .account, .global, .cover { padding:20px; } }
  @media print {
    body { background:#fff; font-size:12px; } .wrap { padding:0; max-width:none; }
    .cover, .account, .global { border:none; padding:0 0 12px; border-radius:0; }
    .account { page-break-before: always; } .toc { display:none; }
    .block, .kpi, .summary, .score { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="cover">
    <p class="eyebrow">Informe de auditoría</p>
    <h1>${esc(title)}</h1>
    <div class="meta">
      <span>Periodo: ${esc(fmtDate(r.period.start))} – ${esc(fmtDate(r.period.end))} (${r.period.days} días)</span>
      <span>Generado: ${esc(new Date(r.generatedAt).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }))}</span>
    </div>
    ${multi ? `<nav class="toc">${r.accounts.map((a, i) => `<a href="#cuenta-${i}">${esc(a.name)}${a.analysis ? ` · ${a.analysis.score}` : ''}</a>`).join('')}</nav>` : ''}
  </div>

  ${multi ? `
  <section class="global">
    <p class="eyebrow">Visión global</p>
    <h2>Resumen del conjunto de cuentas</h2>
    ${r.global ? `
      <p class="summary">${esc(r.global.summary)}</p>
      ${r.global.commonIssues.length ? `<h3>Problemas que se repiten</h3><ul>${r.global.commonIssues.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${r.global.priorities.length ? `<h3>Prioridades</h3><ol>${r.global.priorities.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ` : '<p class="muted">No se pudo generar la visión global; consulta el detalle de cada cuenta.</p>'}
    <h3>Puntuación por cuenta</h3>
    <table class="overview">
      <thead><tr><th>Cuenta</th><th>Puntuación</th><th>Coste</th><th>Conversiones</th><th>ROAS</th><th>Críticos</th><th>Avisos</th></tr></thead>
      <tbody>${[...r.accounts].sort((a, b) => (a.analysis?.score ?? 101) - (b.analysis?.score ?? 101)).map(a => `
        <tr><td><a href="#cuenta-${r.accounts.indexOf(a)}">${esc(a.name)}</a></td>
          <td>${a.analysis ? `<span class="sev ${scoreBand(a.analysis.score).cls}">${a.analysis.score}</span>` : '—'}</td>
          <td>${money(a.kpis.cost, a.currency)}</td><td>${nf(a.kpis.conversions, 1)}</td>
          <td>${a.kpis.roas === null ? '—' : nf(a.kpis.roas, 2)}</td>
          <td>${a.findings.filter(f => f.severity === 'critical').length}</td>
          <td>${a.findings.filter(f => f.severity === 'warning').length}</td></tr>`).join('')}
      </tbody>
      ${oneCur ? `<tfoot><tr><th>Total</th><th></th><th>${money(totals.cost, oneCur)}</th><th>${nf(totals.conv, 1)}</th><th>${totals.cost > 0 && totals.value > 0 ? nf(totals.value / totals.cost, 2) : '—'}</th><th></th><th></th></tr></tfoot>` : ''}
    </table>
  </section>` : ''}

  ${r.accounts.map(renderAccount).join('')}

  <footer>Informe generado automáticamente a partir de los datos de Google Ads${r.model ? ' y analizado con IA' : ''}. Revise las recomendaciones antes de aplicarlas.${r.usage ? `<br>Coste estimado del análisis con IA: ${esc(formatUsage(r.usage))}${r.model ? ` (${esc(r.model)})` : ''}` : ''}</footer>
</div>
</body>
</html>`
}
