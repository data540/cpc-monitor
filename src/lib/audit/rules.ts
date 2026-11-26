// ── Reglas fijas de auditoría (sin IA) ────────────────────────
// Cada regla produce hallazgos objetivos con cifras. La IA los usa como base
// y no debe contradecirlos. Umbrales en RULES_CONFIG.

import type { AccountAuditData, AccountKpis, Finding, Severity, AuditArea } from './types'

export const RULES_CONFIG = {
  optimizationScoreOk:      0.8,
  optimizationScoreWarn:    0.7,
  optimizationScoreCrit:    0.5,
  noConvCampaignSpendShare: 0.05,  // campaña sin conversiones con ≥5 % del gasto
  roasCritRatio:            0.5,   // ROAS real < 50 % del objetivo
  roasWarnRatio:            0.8,
  cpaWarnRatio:             1.5,   // CPA real > 150 % del objetivo
  minConvPer30dSmartBid:    15,
  isLostBudgetWarn:         0.2,
  isLostRankWarn:           0.4,
  qsCrit:                   5,
  qsWarn:                   7,
  lowQsSpendShareCrit:      0.2,   // > 20 % del gasto en keywords con QS ≤ 4
  wastedTermsShareWarn:     0.3,   // > 30 % del gasto de términos sin conversión
  weakAdsShareWarn:         0.3,
  segmentSpendShare:        0.15,
  hourSpendShare:           0.05,
  geoSpendShare:            0.1,
}
const C = RULES_CONFIG

const LEAD_CATEGORIES = new Set([
  'SUBMIT_LEAD_FORM', 'LEAD', 'CONTACT', 'SIGNUP', 'BOOK_APPOINTMENT',
  'REQUEST_QUOTE', 'GET_DIRECTIONS', 'PHONE_CALL_LEAD', 'IMPORTED_LEAD',
  'QUALIFIED_LEAD', 'CONVERTED_LEAD',
])

const pct = (n: number) => `${dec((n * 100), 0)} %`
const dec = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

export function computeKpis(d: AccountAuditData): AccountKpis {
  const s = d.campaigns.reduce((a, c) => ({
    cost: a.cost + c.cost, clicks: a.clicks + c.clicks, impressions: a.impressions + c.impressions,
    conversions: a.conversions + c.conversions, convValue: a.convValue + c.convValue,
  }), { cost: 0, clicks: 0, impressions: 0, conversions: 0, convValue: 0 })
  return {
    ...s,
    roas:   s.cost > 0 && s.convValue > 0 ? s.convValue / s.cost : null,
    cpa:    s.conversions > 0 ? s.cost / s.conversions : null,
    ctr:    s.impressions > 0 ? s.clicks / s.impressions : null,
    avgCpc: s.clicks > 0 ? s.cost / s.clicks : null,
  }
}

export function runRules(d: AccountAuditData): Finding[] {
  const out: Finding[] = []
  const money = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${d.currency}`
  const add = (id: string, area: AuditArea, severity: Severity, title: string, detail: string, scope?: string) =>
    out.push({ id, area, severity, title, detail, ...(scope ? { scope } : {}) })
  const has = (block: string) => !d.unavailable.includes(block)

  const k = computeKpis(d)
  const per30 = 30 / d.period.days

  // ── Cuenta ──────────────────────────────────────────────────
  if (d.optimizationScore !== null) {
    const s = d.optimizationScore
    if (s >= C.optimizationScoreOk) add('opt-score', 'cuenta', 'ok', 'Buena puntuación de optimización', `Puntuación de optimización de Google: ${pct(s)}.`)
    else if (s < C.optimizationScoreCrit) add('opt-score', 'cuenta', 'critical', 'Puntuación de optimización baja', `Puntuación de optimización de Google: ${pct(s)} (por debajo del ${pct(C.optimizationScoreCrit)}).`)
    else if (s < C.optimizationScoreWarn) add('opt-score', 'cuenta', 'warning', 'Puntuación de optimización mejorable', `Puntuación de optimización de Google: ${pct(s)}.`)
  }
  if (d.autoTagging === false) add('auto-tagging', 'cuenta', 'critical', 'Etiquetado automático desactivado', 'Sin auto-tagging (GCLID) se pierde la atribución en Google Analytics y las conversiones importadas.')
  else if (d.autoTagging === true) add('auto-tagging', 'cuenta', 'ok', 'Etiquetado automático activo', 'El auto-tagging (GCLID) está activado.')
  const recTotal = d.googleRecommendations.reduce((s, r) => s + r.count, 0)
  if (recTotal >= 20) add('google-recs', 'cuenta', 'warning', 'Muchas recomendaciones de Google pendientes',
    `${recTotal} recomendaciones sin revisar. Las más frecuentes: ${d.googleRecommendations.slice(0, 3).map(r => `${r.type} (${r.count})`).join(', ')}.`)

  // ── Conversiones ────────────────────────────────────────────
  if (has('Acciones de conversión')) {
    const primary = d.conversionActions.filter(a => a.primary && a.inConversions)
    if (d.conversionActions.length === 0) add('conv-none', 'conversiones', 'critical', 'No hay acciones de conversión activas', 'Sin conversiones configuradas no se puede optimizar ni medir el rendimiento.')
    else if (primary.length === 0) add('conv-primary', 'conversiones', 'critical', 'Ninguna conversión principal', 'Hay acciones de conversión, pero ninguna es principal: las pujas automáticas no tienen objetivo.')
    else {
      if (primary.length > 5) add('conv-many', 'conversiones', 'warning', 'Demasiadas conversiones principales',
        `${primary.length} acciones principales: riesgo de doble conteo y de optimizar hacia micro-conversiones.`)
      const leadMany = primary.filter(a => LEAD_CATEGORIES.has(a.category) && a.countingType === 'MANY_PER_CLICK')
      if (leadMany.length) add('conv-counting', 'conversiones', 'warning', 'Leads contados como "todas"',
        `Acciones de captación contadas una vez por cada conversión: ${leadMany.map(a => a.name).join(', ')}. Para leads lo recomendable es "una".`)
      if (primary.length <= 5 && !leadMany.length) add('conv-setup', 'conversiones', 'ok', 'Configuración de conversiones coherente', `${primary.length} acción(es) principal(es) configuradas.`)
    }
  }
  if (k.cost > 0 && k.conversions === 0) add('conv-zero', 'conversiones', 'critical', 'Gasto sin conversiones registradas',
    `Se han gastado ${money(k.cost)} en ${d.period.days} días sin ninguna conversión.`)

  // ── Campañas y pujas ────────────────────────────────────────
  const noConv = d.campaigns.filter(c => k.cost > 0 && c.cost / k.cost >= C.noConvCampaignSpendShare && c.conversions === 0)
  for (const c of noConv.slice(0, 5)) add(`camp-noconv-${c.id}`, 'campanas', 'critical', 'Campaña con gasto relevante y sin conversiones',
    `${money(c.cost)} (${pct(c.cost / k.cost)} del gasto) sin conversiones.`, c.name)

  let roasOk = 0
  for (const c of d.campaigns) {
    if (!c.targetRoas || c.cost <= 0) continue
    const real = c.convValue / c.cost
    const ratio = real / c.targetRoas
    if (ratio < C.roasCritRatio) add(`roas-${c.id}`, 'pujas', 'critical', 'ROAS muy por debajo del objetivo',
      `ROAS real ${dec(real, 2)} frente a un objetivo de ${dec(c.targetRoas, 2)} (${pct(ratio)}).`, c.name)
    else if (ratio < C.roasWarnRatio) add(`roas-${c.id}`, 'pujas', 'warning', 'ROAS por debajo del objetivo',
      `ROAS real ${dec(real, 2)} frente a un objetivo de ${dec(c.targetRoas, 2)} (${pct(ratio)}).`, c.name)
    else roasOk++
  }
  if (roasOk > 0) add('roas-ok', 'pujas', 'ok', 'Campañas que cumplen su ROAS objetivo', `${roasOk} campaña(s) con ROAS real ≥ ${pct(C.roasWarnRatio)} del objetivo.`)

  for (const c of d.campaigns) {
    if (!c.targetCpa || c.conversions <= 0) continue
    const cpa = c.cost / c.conversions
    if (cpa > c.targetCpa * C.cpaWarnRatio) add(`cpa-${c.id}`, 'pujas', 'warning', 'CPA por encima del objetivo',
      `CPA real ${money(cpa)} frente a un objetivo de ${money(c.targetCpa)}.`, c.name)
  }

  const manual = d.campaigns.filter(c => ['MANUAL_CPC', 'ENHANCED_CPC'].includes(c.biddingStrategy) && c.conversions * per30 >= 30)
  for (const c of manual.slice(0, 5)) add(`bid-manual-${c.id}`, 'pujas', 'warning', 'Puja manual con volumen para Smart Bidding',
    `${dec(c.conversions, 0)} conversiones en ${d.period.days} días con ${c.biddingStrategy}: tiene datos suficientes para una estrategia automática.`, c.name)

  const smart = d.campaigns.filter(c => ['TARGET_ROAS', 'TARGET_CPA', 'MAXIMIZE_CONVERSION_VALUE', 'MAXIMIZE_CONVERSIONS'].includes(c.biddingStrategy) || c.targetRoas || c.targetCpa)
  const starved = smart.filter(c => c.cost > 0 && c.conversions * per30 < C.minConvPer30dSmartBid)
  for (const c of starved.slice(0, 5)) add(`bid-data-${c.id}`, 'pujas', 'warning', 'Pocas conversiones para la estrategia automática',
    `${dec((c.conversions * per30), 1)} conversiones/30 días (recomendado ≥ ${C.minConvPer30dSmartBid}). El algoritmo aprende con pocos datos.`, c.name)

  // ── Presupuesto e Impression Share ──────────────────────────
  for (const c of d.campaigns) {
    if (c.isLostBudget === null) continue
    const goodRoas = c.targetRoas ? c.cost > 0 && c.convValue / c.cost >= c.targetRoas : c.conversions > 0
    if (c.isLostBudget >= C.isLostBudgetWarn) add(`is-budget-${c.id}`, 'presupuesto', 'warning',
      goodRoas ? 'Campaña rentable limitada por presupuesto' : 'Impresiones perdidas por presupuesto',
      `Pierde el ${pct(c.isLostBudget)} de las impresiones por presupuesto${c.dailyBudget ? ` (presupuesto diario ${money(c.dailyBudget)})` : ''}.`, c.name)
    if (c.isLostRank !== null && c.isLostRank >= C.isLostRankWarn) add(`is-rank-${c.id}`, 'presupuesto', 'warning', 'Muchas impresiones perdidas por ranking',
      `Pierde el ${pct(c.isLostRank)} de las impresiones por ranking (puja o calidad).`, c.name)
  }
  const isCamps = d.campaigns.filter(c => c.isShare !== null && c.cost > 0)
  if (isCamps.length) {
    const w = isCamps.reduce((s, c) => s + c.cost, 0)
    const avgIs = isCamps.reduce((s, c) => s + (c.isShare ?? 0) * c.cost, 0) / w
    if (avgIs >= 0.7) add('is-avg', 'presupuesto', 'ok', 'Buena cuota de impresiones', `Cuota de impresiones media ponderada por gasto: ${pct(avgIs)}.`)
  }

  // ── Palabras clave ──────────────────────────────────────────
  if (has('Palabras clave') && d.keywords.length) {
    const withQs = d.keywords.filter(kw => kw.qualityScore !== null && kw.cost > 0)
    const qsSpend = withQs.reduce((s, kw) => s + kw.cost, 0)
    if (qsSpend > 0) {
      const wQs = withQs.reduce((s, kw) => s + (kw.qualityScore ?? 0) * kw.cost, 0) / qsSpend
      if (wQs < C.qsCrit) add('qs-avg', 'palabras_clave', 'critical', 'Nivel de Calidad medio bajo', `Nivel de Calidad medio ponderado por gasto: ${dec(wQs, 1)}/10.`)
      else if (wQs < C.qsWarn) add('qs-avg', 'palabras_clave', 'warning', 'Nivel de Calidad medio mejorable', `Nivel de Calidad medio ponderado por gasto: ${dec(wQs, 1)}/10.`)
      else add('qs-avg', 'palabras_clave', 'ok', 'Buen Nivel de Calidad', `Nivel de Calidad medio ponderado por gasto: ${dec(wQs, 1)}/10.`)

      const lowSpend = withQs.filter(kw => (kw.qualityScore ?? 10) <= 4).reduce((s, kw) => s + kw.cost, 0)
      if (lowSpend / qsSpend > C.lowQsSpendShareCrit) add('qs-low-spend', 'palabras_clave', 'critical', 'Mucho gasto en palabras clave de baja calidad',
        `El ${pct(lowSpend / qsSpend)} del gasto (${money(lowSpend)}) va a palabras clave con Nivel de Calidad ≤ 4.`)

      const comps: [keyof typeof withQs[number], string][] = [
        ['landingPage', 'Experiencia en la página de destino'], ['expectedCtr', 'CTR esperado'], ['adRelevance', 'Relevancia del anuncio'],
      ]
      for (const [field, label] of comps) {
        const below = withQs.filter(kw => kw[field] === 'BELOW_AVERAGE').reduce((s, kw) => s + kw.cost, 0)
        if (below / qsSpend > 0.25) add(`qs-${String(field)}`, 'palabras_clave', 'warning', `${label} por debajo de la media`,
          `El ${pct(below / qsSpend)} del gasto con Nivel de Calidad tiene "${label}" por debajo de la media.`)
      }
    }
    const refCpa = k.cpa ?? (k.avgCpc ? k.avgCpc * 20 : null)
    if (refCpa) {
      const waste = d.keywords.filter(kw => kw.conversions === 0 && kw.cost >= refCpa * 2).slice(0, 5)
      for (const kw of waste) add(`kw-waste-${kw.text}-${kw.adGroup}`, 'palabras_clave', 'warning', 'Palabra clave con gasto alto y sin conversiones',
        `"${kw.text}" (${kw.matchType}): ${money(kw.cost)} y ${kw.clicks} clics sin conversiones.`, kw.campaign)
    }
    const broadManual = d.keywords.filter(kw => kw.matchType === 'BROAD' &&
      d.campaigns.some(c => c.name === kw.campaign && ['MANUAL_CPC', 'ENHANCED_CPC'].includes(c.biddingStrategy)))
    if (broadManual.length) add('kw-broad-manual', 'palabras_clave', 'warning', 'Concordancia amplia con puja manual',
      `${broadManual.length} palabras clave en concordancia amplia en campañas con puja manual: la amplia funciona mejor con Smart Bidding.`)
  }

  // ── Términos de búsqueda y negativas ────────────────────────
  if (has('Términos de búsqueda') && d.searchTerms.length) {
    const tSpend = d.searchTerms.reduce((s, t) => s + t.cost, 0)
    const zero = d.searchTerms.filter(t => t.conversions === 0)
    const zSpend = zero.reduce((s, t) => s + t.cost, 0)
    if (tSpend > 0 && zSpend / tSpend > C.wastedTermsShareWarn) add('terms-waste', 'terminos', 'warning', 'Gasto alto en términos sin conversiones',
      `El ${pct(zSpend / tSpend)} del gasto de los términos principales (${money(zSpend)}) no ha convertido. Candidatos a negativa: ${zero.slice(0, 5).map(t => `"${t.term}"`).join(', ')}.`)
    else if (tSpend > 0) add('terms-ok', 'terminos', 'ok', 'Términos de búsqueda bien aprovechados', `Solo el ${pct(zSpend / tSpend)} del gasto de los términos principales no convierte.`)
  }
  if (d.negatives.campaignsWithoutNegatives.length) add('neg-missing', 'terminos', 'warning', 'Campañas de búsqueda sin palabras clave negativas',
    `${d.negatives.campaignsWithoutNegatives.length} campaña(s) sin negativas propias ni listas compartidas: ${d.negatives.campaignsWithoutNegatives.slice(0, 5).join(', ')}.`)

  // ── Anuncios ────────────────────────────────────────────────
  if (has('Anuncios') && d.ads.length) {
    const perGroup = new Map<string, number>()
    for (const a of d.ads) perGroup.set(`${a.campaign}›${a.adGroup}`, (perGroup.get(`${a.campaign}›${a.adGroup}`) ?? 0) + 1)
    const single = [...perGroup.values()].filter(n => n < 2).length
    if (single > 0) add('ads-single', 'anuncios', 'warning', 'Grupos de anuncios con un solo anuncio',
      `${single} de ${perGroup.size} grupos tienen menos de 2 anuncios activos: no hay alternativas para probar.`)

    const rsa = d.ads.filter(a => a.type === 'RESPONSIVE_SEARCH_AD' && a.adStrength && a.adStrength !== 'PENDING' && a.adStrength !== 'UNSPECIFIED')
    if (rsa.length) {
      const weak = rsa.filter(a => a.adStrength === 'POOR' || a.adStrength === 'AVERAGE').length
      if (weak / rsa.length > C.weakAdsShareWarn) add('ads-strength', 'anuncios', 'warning', 'Anuncios con fuerza baja',
        `${weak} de ${rsa.length} anuncios de búsqueda adaptables tienen fuerza "Baja" o "Normal".`)
      else add('ads-strength', 'anuncios', 'ok', 'Buena fuerza de los anuncios', `${rsa.length - weak} de ${rsa.length} anuncios adaptables tienen fuerza "Buena" o "Excelente".`)
    }
    const disapproved = d.ads.filter(a => a.approvalStatus === 'DISAPPROVED').length
    if (disapproved) add('ads-disapproved', 'anuncios', 'critical', 'Anuncios rechazados', `${disapproved} anuncio(s) activos están rechazados por políticas.`)
    const limited = d.ads.filter(a => a.approvalStatus === 'APPROVED_LIMITED' || a.approvalStatus === 'AREA_OF_INTEREST_ONLY').length
    if (limited) add('ads-limited', 'anuncios', 'warning', 'Anuncios aprobados con limitaciones', `${limited} anuncio(s) se publican con restricciones de políticas.`)
  }

  // ── Recursos (extensiones) ──────────────────────────────────
  if (has('Recursos de campaña') || has('Recursos de cuenta')) {
    const want: [string, string][] = [['SITELINK', 'enlaces de sitio'], ['CALLOUT', 'textos destacados'], ['STRUCTURED_SNIPPET', 'fragmentos estructurados']]
    const search = d.campaigns.filter(c => c.channel === 'SEARCH')
    for (const [type, label] of want) {
      if (d.assetTypes.account.includes(type)) continue
      const missing = search.filter(c => !(d.assetTypes.byCampaign[c.name] ?? []).includes(type))
      if (missing.length) add(`asset-${type}`, 'extensiones', 'warning', `Faltan ${label}`,
        `${missing.length} campaña(s) de búsqueda sin ${label}: ${missing.slice(0, 4).map(c => c.name).join(', ')}.`)
    }
    if (search.length && !out.some(f => f.id.startsWith('asset-'))) add('assets-ok', 'extensiones', 'ok', 'Recursos principales configurados', 'Enlaces de sitio, textos destacados y fragmentos estructurados presentes.')
  }

  // ── Segmentos ───────────────────────────────────────────────
  const segCheck = (rows: typeof d.devices, minShare: number, label: string, area: AuditArea, idp: string) => {
    const total = rows.reduce((s, r) => s + r.cost, 0)
    if (total <= 0) return
    const accRoas = k.roas, accCr = k.clicks > 0 ? k.conversions / k.clicks : 0
    for (const r of rows) {
      const share = r.cost / total
      if (share < minShare) continue
      if (r.conversions === 0) { add(`${idp}-${r.segment}`, area, 'warning', `${label} con gasto y sin conversiones`, `${r.segment}: ${pct(share)} del gasto (${money(r.cost)}) sin conversiones.`); continue }
      const roas = r.cost > 0 ? r.convValue / r.cost : 0
      if (accRoas && roas < accRoas * 0.5) add(`${idp}-${r.segment}`, area, 'warning', `${label} con rentabilidad baja`, `${r.segment}: ROAS ${dec(roas, 2)} frente a ${dec(accRoas, 2)} de la cuenta.`)
      else if (!accRoas && accCr > 0 && r.clicks > 0 && r.conversions / r.clicks < accCr * 0.5) add(`${idp}-${r.segment}`, area, 'warning', `${label} con tasa de conversión baja`,
        `${r.segment}: tasa de conversión ${pct(r.conversions / r.clicks)} frente a ${pct(accCr)} de la cuenta.`)
    }
  }
  segCheck(d.devices, C.segmentSpendShare, 'Dispositivo', 'segmentos', 'dev')
  segCheck(d.geo, C.geoSpendShare, 'Ubicación', 'segmentos', 'geo')
  const hTotal = d.hours.reduce((s, r) => s + r.cost, 0)
  if (hTotal > 0) {
    const deadHours = d.hours.filter(h => h.cost / hTotal >= C.hourSpendShare && h.conversions === 0)
    if (deadHours.length) add('hours-dead', 'segmentos', 'warning', 'Franjas horarias con gasto y sin conversiones',
      `Horas sin conversiones con ≥ ${pct(C.hourSpendShare)} del gasto: ${deadHours.map(h => `${h.segment}h`).join(', ')}.`)
  }

  return out
}
