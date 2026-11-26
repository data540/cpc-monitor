// ── Alertas fijas de CPA Analysis (puras: cliente y servidor) ──
import type { CpaAlert, CpaOverview, CpaSegments, CpaWaste, SegmentRow } from './types'
import {
  type ConvMode, accountAvgCpa, buildCampaignViews, conv, fmtMoney, fmtNum, fmtPct, isCpaStrategy, safeDiv,
  systemStatusLabel,
} from './metrics'

export const CPA_RULES = {
  deviationWarn:     0.20,   // CPA > objetivo +20 %
  deviationCrit:     0.50,   // CPA > objetivo +50 %
  worsening7d:       0.30,   // CPA 7 días > referencia +30 %
  minConvPer30d:     30,     // volumen mínimo recomendado para pujas por CPA
  scaleLostBudget:   0.10,   // cuota perdida por presupuesto
  tightLostRank:     0.40,
  convRateDrop:      0.30,   // caída de tasa de conversión
  minClicksRateDrop: 200,
  targetChange:      0.20,   // cambio de CPA objetivo > 20 %
  recentDays:        14,
  segmentFactor:     1.5,    // CPA de segmento > 1,5 × referencia
  wasteFactor:       2,      // gasto sin conversiones ≥ 2 × CPA de referencia
  termWasteShare:    0.20,
}

const daysAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000

export function runOverviewRules(o: CpaOverview, mode: ConvMode = 'primary'): CpaAlert[] {
  const R = CPA_RULES
  const alerts: CpaAlert[] = []
  const cur = o.currency
  const m = (n: number | null) => fmtMoney(n, cur)
  const account = o.name
  const push = (a: Omit<CpaAlert, 'account'>) => alerts.push({ ...a, account })
  const avg = accountAvgCpa(o, mode)

  const views = buildCampaignViews(o, mode).filter(v => isCpaStrategy(v.biddingType))
  for (const v of views) {
    const ref = v.refCpa
    const refName = v.refIsAverage ? 'la media de la cuenta' : 'el objetivo'
    const key = `${o.customerId}-${v.id}`

    // Estado de la estrategia de Google
    const st = v.systemStatus ?? ''
    if (st.startsWith('MISCONFIGURED')) {
      push({ id: `cpa-misconf-${key}`, level: 'critical', title: 'Estrategia de puja mal configurada',
        description: `Google indica: ${systemStatusLabel(st)}. La campaña no puede optimizar correctamente hasta corregirlo.`,
        campaign: v.name, value: systemStatusLabel(st) })
    } else if (st.startsWith('LIMITED') || st === 'MULTIPLE_LIMITED') {
      push({ id: `cpa-limited-${key}`, level: 'warning', title: 'Estrategia de puja limitada',
        description: `Google indica: ${systemStatusLabel(st)}. Revisa la causa antes de cambiar el objetivo.`,
        campaign: v.name, value: systemStatusLabel(st) })
    } else if (st.startsWith('LEARNING') || st === 'MULTIPLE_LEARNING') {
      push({ id: `cpa-learning-${key}`, level: 'info', title: 'Estrategia en aprendizaje',
        description: 'Evita cambios de objetivo o presupuesto hasta que termine el aprendizaje (normalmente 1-2 semanas o ~50 conversiones).',
        campaign: v.name, value: systemStatusLabel(st) })
    }

    if (!ref) continue

    // Gasto sin conversiones
    if (v.conversions === 0 && v.cost >= R.wasteFactor * ref) {
      push({ id: `cpa-noconv-${key}`, level: 'critical', title: 'Gasto sin conversiones',
        description: `Ha gastado ${m(v.cost)} (${fmtNum(v.cost / ref, 1)} veces ${refName}) sin ninguna conversión en el periodo.`,
        campaign: v.name, value: m(v.cost) })
      continue
    }

    // Desviación del CPA en el periodo (solo con gasto suficiente para ser significativo)
    if (v.deviation !== null && v.cost >= ref) {
      if (v.deviation > R.deviationWarn) {
        const crit = v.deviation > R.deviationCrit
        push({ id: `cpa-dev-${key}`, level: crit ? 'critical' : 'warning',
          title: v.refIsAverage ? 'CPA por encima de la media de la cuenta' : 'CPA por encima del objetivo',
          description: `CPA real ${m(v.cpa)} frente a ${refName} de ${m(ref)} (${fmtPct(v.deviation, 0)} más).`
            + (v.refIsAverage ? ' Valora fijar un CPA objetivo para controlar el coste.' : ''),
          campaign: v.name, value: `+${fmtPct(v.deviation, 0)}` })
      } else if (v.cpa7 !== null && v.cpa7 > ref * (1 + R.worsening7d) && v.cost / o.period.days * 7 >= ref) {
        push({ id: `cpa-7d-${key}`, level: 'warning', title: 'El CPA empeora en los últimos 7 días',
          description: `En el periodo está en ${m(v.cpa)}, pero en los últimos 7 días sube a ${m(v.cpa7)} (${refName}: ${m(ref)}).`,
          campaign: v.name, value: m(v.cpa7) })
      }
    }

    // Oportunidad de escalar: CPA bajo objetivo y perdiendo cuota por presupuesto
    if (v.cpa !== null && v.cpa <= ref * 0.9 && (v.isLostBudget ?? 0) > R.scaleLostBudget) {
      push({ id: `cpa-scale-${key}`, level: 'info', title: 'Oportunidad de escalar',
        description: `CPA ${m(v.cpa)} por debajo de ${refName} (${m(ref)}) y pierde ${fmtPct(v.isLostBudget, 0)} de impresiones por presupuesto. Subir el presupuesto debería traer más conversiones a un CPA similar.`,
        campaign: v.name, value: `IS perdida ppto. ${fmtPct(v.isLostBudget, 0)}` })
    }

    // Objetivo demasiado exigente: no gasta y pierde cuota por ranking
    if (!v.refIsAverage && v.cpa !== null && v.cpa < ref * 0.8 && (v.isLostRank ?? 0) > R.tightLostRank
        && v.budgetUse !== null && v.budgetUse < 0.7) {
      push({ id: `cpa-tight-${key}`, level: 'info', title: 'CPA objetivo posiblemente demasiado exigente',
        description: `Gasta el ${fmtPct(v.budgetUse, 0)} del presupuesto y pierde ${fmtPct(v.isLostRank, 0)} de impresiones por ranking con un CPA (${m(v.cpa)}) muy por debajo del objetivo. Subir ligeramente el objetivo puede dar más volumen.`,
        campaign: v.name, value: `IS perdida ranking ${fmtPct(v.isLostRank, 0)}` })
    }

    // Volumen insuficiente para puja con objetivo
    const conv30 = v.conversions * 30 / o.period.days
    if (v.targetCpa !== null && !v.portfolioName && conv30 < R.minConvPer30d && v.cost > 0) {
      push({ id: `cpa-volume-${key}`, level: 'warning', title: 'Pocas conversiones para pujar por CPA',
        description: `Unas ${fmtNum(conv30, 0)} conversiones cada 30 días (se recomiendan ${R.minConvPer30d} o más). Agrúpala con otras campañas en una estrategia de cartera para darle más datos.`,
        campaign: v.name, value: `${fmtNum(conv30, 0)} conv./30 d` })
    }
  }

  // ── Cambios recientes ──
  const recent = o.changes.filter(c => daysAgo(c.date) <= R.recentDays)
  for (const c of recent) {
    if (c.kind === 'cpa_objetivo' && c.oldValue && c.newValue) {
      const ch = (c.newValue - c.oldValue) / c.oldValue
      if (Math.abs(ch) > R.targetChange) {
        push({ id: `cpa-chg-${c.campaignId}-${c.date}`, level: 'warning', title: 'Cambio brusco del CPA objetivo',
          description: `El ${c.date.slice(0, 10)} pasó de ${m(c.oldValue)} a ${m(c.newValue)} (${ch > 0 ? '+' : ''}${fmtPct(ch, 0)}). Cambios de más del ${fmtPct(R.targetChange, 0)} reinician el aprendizaje; mejor en pasos de 10-15 %.`,
          campaign: c.campaign ?? undefined, value: `${ch > 0 ? '+' : ''}${fmtPct(ch, 0)}` })
      }
    } else if (c.kind === 'estrategia') {
      push({ id: `cpa-strat-${c.campaignId}-${c.date}`, level: 'info', title: 'Cambio de estrategia reciente',
        description: `${c.detail} el ${c.date.slice(0, 10)}. Espera al menos 2 semanas antes de juzgar el CPA.`,
        campaign: c.campaign ?? undefined })
    }
  }

  // ── Medición ──
  const cpaIds = new Set(views.map(v => v.id))
  const byDate = new Map<string, { cost: number; c: number; clicks: number }>()
  for (const d of o.daily) {
    if (!cpaIds.has(d.campaignId)) continue
    const a = byDate.get(d.date) ?? { cost: 0, c: 0, clicks: 0 }
    a.cost += d.cost; a.c += conv(d, mode); a.clicks += d.clicks
    byDate.set(d.date, a)
  }
  const dates = [...byDate.keys()].sort()
  if (dates.length >= 7) {
    const last2 = dates.slice(-2).map(d => byDate.get(d)!)
    const before = dates.slice(0, -2).map(d => byDate.get(d)!)
    const avgConvDay = before.reduce((s, x) => s + x.c, 0) / before.length
    const cost2 = last2.reduce((s, x) => s + x.cost, 0)
    if (avgConvDay >= 2 && cost2 > 0 && last2.every(x => x.c === 0)) {
      push({ id: `cpa-tracking-${o.customerId}`, level: 'critical', title: 'Posible fallo de medición de conversiones',
        description: `Los dos últimos días no registran conversiones (gasto ${m(cost2)}) cuando la media es de ${fmtNum(avgConvDay, 1)} al día. Comprueba la etiqueta y las acciones de conversión. Ten en cuenta el retraso habitual de las conversiones.`,
        value: '0 conv. en 48 h' })
    }

    // Caída de la tasa de conversión: últimos 7 días frente al resto del periodo
    if (dates.length >= 14) {
      const sumW = (ds: string[]) => ds.reduce((s, d) => { const x = byDate.get(d)!; s.c += x.c; s.clicks += x.clicks; return s }, { c: 0, clicks: 0 })
      const a = sumW(dates.slice(-7)), b = sumW(dates.slice(0, -7))
      const ra = safeDiv(a.c, a.clicks), rb = safeDiv(b.c, b.clicks)
      if (ra !== null && rb !== null && rb > 0 && a.clicks >= R.minClicksRateDrop && (rb - ra) / rb > R.convRateDrop) {
        push({ id: `cpa-cvr-${o.customerId}`, level: 'warning', title: 'Caída de la tasa de conversión',
          description: `Últimos 7 días: ${fmtPct(ra, 2)} frente a ${fmtPct(rb, 2)} en el resto del periodo (${fmtPct((rb - ra) / rb, 0)} menos). Revisa la web, la landing y la medición.`,
          value: `-${fmtPct((rb - ra) / rb, 0)}` })
      }
    }
  }

  // Acciones de conversión principales de tipos distintos
  const primaryCats = [...new Set(o.conversionActions.filter(a => a.primary).map(a => a.category))]
  if (primaryCats.length > 1) {
    push({ id: `cpa-mixed-${o.customerId}`, level: 'warning', title: 'Conversiones principales de tipos distintos',
      description: `Hay acciones principales de ${primaryCats.length} categorías (${primaryCats.join(', ')}). Todas cuentan igual en el CPA: si su valor de negocio es distinto, deja como principal solo la que importa.`,
      value: `${o.conversionActions.filter(a => a.primary).length} acciones principales` })
  }
  const leadMany = o.conversionActions.filter(a => a.primary && a.countingType === 'MANY_PER_CLICK'
    && /LEAD|SIGNUP|CONTACT|SUBMIT|PHONE|BOOK|REQUEST_QUOTE/.test(a.category))
  if (leadMany.length) {
    push({ id: `cpa-many-${o.customerId}`, level: 'info', title: 'Leads contados "todas" por clic',
      description: `${leadMany.map(a => `"${a.name}"`).join(', ')} cuenta${leadMany.length > 1 ? 'n' : ''} cada conversión. Para leads suele ser mejor "una por clic" para no inflar las conversiones y abaratar artificialmente el CPA.`,
      value: `${leadMany.length} acción(es)` })
  }

  if (avg === null && o.campaigns.some(c => c.cost > 0)) {
    push({ id: `cpa-noconv-account-${o.customerId}`, level: 'critical', title: 'La cuenta no registra conversiones',
      description: 'Hay gasto en el periodo pero ninguna conversión. Sin conversiones no se puede calcular el CPA ni pujar por él.' })
  }

  return alerts
}

// ── Segmentos ──
export function runSegmentRules(s: CpaSegments, refCpa: number | null, currency: string, account: string, mode: ConvMode = 'primary'): CpaAlert[] {
  if (!refCpa) return []
  const R = CPA_RULES
  const out: CpaAlert[] = []
  const m = (n: number | null) => fmtMoney(n, currency)

  const check = (rows: SegmentRow[], dim: string) => {
    const total = rows.reduce((a, r) => a + r.cost, 0)
    for (const r of rows) {
      const c = conv(r, mode)
      if (r.cost < Math.max(R.wasteFactor * refCpa, total * 0.05)) continue
      const cpa = safeDiv(r.cost, c)
      if (cpa === null) {
        out.push({ id: `seg-${dim}-${r.segment}`, level: 'warning', account, title: `${dim}: gasto sin conversiones`,
          description: `"${r.label}" ha gastado ${m(r.cost)} sin conversiones.`, value: m(r.cost) })
      } else if (cpa > refCpa * R.segmentFactor) {
        out.push({ id: `seg-${dim}-${r.segment}`, level: 'warning', account, title: `${dim}: CPA muy alto`,
          description: `"${r.label}" tiene un CPA de ${m(cpa)} (${fmtNum(cpa / refCpa, 1)} veces la referencia de ${m(refCpa)}) con ${m(r.cost)} de gasto. Valora un ajuste de puja o exclusión.`,
          value: m(cpa) })
      }
    }
  }
  check(s.devices, 'Dispositivo')
  check(s.networks, 'Red')
  check(s.geo, 'Ubicación')
  check(s.ages, 'Edad')
  check(s.genders, 'Sexo')

  // Partners de búsqueda frente a Búsqueda de Google
  const search = s.networks.find(n => n.segment === 'SEARCH')
  const partners = s.networks.find(n => n.segment === 'SEARCH_PARTNERS')
  if (search && partners && partners.cost >= refCpa) {
    const cs = safeDiv(search.cost, conv(search, mode)), cp = safeDiv(partners.cost, conv(partners, mode))
    if (cs && (cp === null || cp > cs * R.segmentFactor)) {
      out.push({ id: 'seg-partners', level: 'warning', account, title: 'Partners de búsqueda poco rentables',
        description: `CPA en partners ${m(cp)} frente a ${m(cs)} en la Búsqueda de Google, con ${m(partners.cost)} de gasto. Valora desactivar la red de partners.`,
        value: m(cp) })
    }
  }

  // Franjas horarias más caras (agregando días)
  const hours = new Map<number, { cost: number; c: number }>()
  for (const h of s.heatmap) {
    const a = hours.get(h.hour) ?? { cost: 0, c: 0 }
    a.cost += h.cost; a.c += mode === 'all' ? h.allConv : h.conversions
    hours.set(h.hour, a)
  }
  const bad = [...hours.entries()]
    .filter(([, a]) => a.cost >= R.wasteFactor * refCpa && (a.c === 0 || a.cost / a.c > refCpa * R.segmentFactor))
    .sort(([, a], [, b]) => b.cost - a.cost).slice(0, 4)
  if (bad.length) {
    out.push({ id: 'seg-hours', level: 'info', account, title: 'Franjas horarias caras',
      description: `Las horas ${bad.map(([h]) => `${String(h).padStart(2, '0')}h`).join(', ')} tienen un CPA más de ${R.segmentFactor} veces la referencia. Revisa la programación o los ajustes de puja por horario.`,
      value: `${bad.length} franja(s)` })
  }
  return out
}

// ── Desperdicio ──
export function runWasteRules(w: CpaWaste, refCpa: number | null, currency: string, account: string): CpaAlert[] {
  if (!refCpa) return []
  const R = CPA_RULES
  const m = (n: number | null) => fmtMoney(n, currency)
  const out: CpaAlert[] = []
  const badKw = w.keywords.filter(k => k.conversions === 0 && k.cost >= R.wasteFactor * refCpa)
  if (badKw.length) {
    const sum = badKw.reduce((s, k) => s + k.cost, 0)
    out.push({ id: 'waste-kw', level: badKw.length > 5 ? 'critical' : 'warning', account, title: 'Palabras clave que gastan sin convertir',
      description: `${badKw.length} palabra(s) clave han gastado más de ${R.wasteFactor} veces la referencia sin conversiones (${m(sum)} en total). Las principales: ${badKw.slice(0, 5).map(k => `"${k.text}" (${m(k.cost)})`).join(', ')}.`,
      value: m(sum) })
  }
  const badTerms = w.terms.filter(t => t.conversions === 0 && t.cost >= R.wasteFactor * refCpa)
  if (badTerms.length) {
    out.push({ id: 'waste-terms', level: 'warning', account, title: 'Términos de búsqueda candidatos a negativa',
      description: `${badTerms.length} término(s) han gastado más de ${R.wasteFactor} veces la referencia sin convertir: ${badTerms.slice(0, 5).map(t => `"${t.text}"`).join(', ')}.`,
      value: m(badTerms.reduce((s, t) => s + t.cost, 0)) })
  }
  const share = safeDiv(w.totals.termCostNoConv, w.totals.termCost)
  if (share !== null && share > R.termWasteShare && w.totals.termCost > 0) {
    out.push({ id: 'waste-share', level: 'warning', account, title: 'Mucho gasto en términos sin conversión',
      description: `El ${fmtPct(share, 0)} del gasto en los términos analizados (${m(w.totals.termCostNoConv)}) no ha generado conversiones. Refuerza las negativas y revisa las concordancias amplias.`,
      value: fmtPct(share, 0) })
  }
  return out
}

export const LEVEL_ORDER: Record<CpaAlert['level'], number> = { critical: 0, warning: 1, info: 2 }
export const sortAlerts = (a: CpaAlert[]) => [...a].sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level])
