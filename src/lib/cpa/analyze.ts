// ── Análisis experto de CPA con IA (solo servidor) ────────────
// Reutiliza el proveedor del Audit: OpenAI y, si falla, OpenRouter.
import { z } from 'zod'
import { type AiUsage, callStructured } from '@/lib/audit/analyze'
import type { CpaAiAnalysis, CpaAlert, CpaOverview, CpaSegments, CpaSimulations, CpaWaste, SegmentRow } from './types'
import { type ConvMode, accountAvgCpa, buildCampaignViews, computeKpis, conv, isCpaStrategy, safeDiv, strategyLabel } from './metrics'

const SYSTEM_PROMPT = `Eres un consultor senior de Google Ads especializado en captación de leads y ventas con pujas automáticas por CPA (CPA objetivo y Maximizar conversiones). Llevas más de 10 años gestionando cuentas de alto presupuesto.

Analizas los datos de UNA cuenta que te da la herramienta y escribes para el responsable de la cuenta, que debe tomar decisiones con tu análisis.

Reglas:
- Escribe en español de España, claro y directo, sin relleno.
- Usa SOLO los datos proporcionados. No inventes cifras, campañas ni causas que los datos no respalden. Si falta un dato, dilo.
- Cita cifras concretas (CPA, conversiones, gasto, desviaciones) y los nombres exactos de las campañas.
- La referencia de CPA de cada campaña es su CPA objetivo; si no tiene, la media de la cuenta (indicado en "refEsMedia").
- No contradigas las alertas automáticas; puedes matizarlas o priorizarlas.
- Al proponer CPA objetivo: cambios graduales (10-20 % por paso), apóyate en el simulador de Google cuando exista, y no toques campañas en aprendizaje.
- Ten en cuenta el retraso de conversiones: los últimos días suelen estar incompletos.
- Distingue entre problemas de puja, de presupuesto, de tráfico (términos, segmentos) y de medición.
- Veredictos por campaña: escalar (rentable y con margen), mantener, optimizar (cerca del objetivo, con mejoras claras), reducir (CPA alto) o pausar (gasto sin resultado y sin perspectiva).
- Límites: máximo 6 alertas, 15 campañas, 8 sugerencias de objetivo, 10 recomendaciones y 5 elementos en "no tocar".
- Importes con la moneda de la cuenta y formato español (1.234,56).`

const VERDICTS = ['escalar', 'mantener', 'optimizar', 'reducir', 'pausar'] as const
const LEVEL3 = ['alta', 'media', 'baja'] as const

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'summary', 'alerts', 'campaigns', 'targets', 'recommendations', 'doNotTouch'],
  properties: {
    score:   { type: 'integer', description: 'Salud de la cuenta respecto al CPA, 0-100' },
    summary: { type: 'string', description: 'Diagnóstico general en 3-5 frases' },
    alerts: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['severity', 'title', 'detail'],
      properties: { severity: { type: 'string', enum: ['warning', 'critical'] }, title: { type: 'string' }, detail: { type: 'string' } },
    } },
    campaigns: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['campaign', 'verdict', 'diagnosis', 'action'],
      properties: {
        campaign: { type: 'string' }, verdict: { type: 'string', enum: VERDICTS },
        diagnosis: { type: 'string' }, action: { type: 'string' },
      },
    } },
    targets: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['campaign', 'currentTarget', 'suggestedTarget', 'rationale'],
      properties: {
        campaign: { type: 'string' },
        currentTarget: { type: ['number', 'null'] }, suggestedTarget: { type: ['number', 'null'] },
        rationale: { type: 'string' },
      },
    } },
    recommendations: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['priority', 'title', 'action', 'impact', 'confidence'],
      properties: {
        priority: { type: 'string', enum: LEVEL3 }, title: { type: 'string' }, action: { type: 'string' },
        impact: { type: 'string' }, confidence: { type: 'string', enum: LEVEL3 },
      },
    } },
    doNotTouch: { type: 'array', items: { type: 'string' } },
  },
}

const analysisZ = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string(),
  alerts: z.array(z.object({ severity: z.enum(['warning', 'critical']), title: z.string(), detail: z.string() })),
  campaigns: z.array(z.object({ campaign: z.string(), verdict: z.enum(VERDICTS), diagnosis: z.string(), action: z.string() })),
  targets: z.array(z.object({ campaign: z.string(), currentTarget: z.number().nullable(), suggestedTarget: z.number().nullable(), rationale: z.string() })),
  recommendations: z.array(z.object({
    priority: z.enum(LEVEL3), title: z.string(), action: z.string(), impact: z.string(), confidence: z.enum(LEVEL3),
  })),
  doNotTouch: z.array(z.string()),
})

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100)
const r3 = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000)

function segSummary(rows: SegmentRow[] | undefined, mode: ConvMode, limit = 8) {
  return (rows ?? []).slice(0, limit).map(r => ({
    segmento: r.label, coste: r2(r.cost), conversiones: r2(conv(r, mode)), cpa: r2(safeDiv(r.cost, conv(r, mode))),
  }))
}

export function buildPayload(o: CpaOverview, mode: ConvMode, alerts: CpaAlert[],
  seg?: CpaSegments | null, waste?: CpaWaste | null, sims?: CpaSimulations | null) {
  const views = buildCampaignViews(o, mode)
  const cpaViews = views.filter(v => isCpaStrategy(v.biddingType))
  const kpis = computeKpis(cpaViews.length ? cpaViews : views, [o], mode)

  // Horas agregadas (CPA por hora)
  let horas: unknown[] = []
  if (seg?.heatmap?.length) {
    const acc = new Map<number, { cost: number; c: number }>()
    for (const h of seg.heatmap) {
      const a = acc.get(h.hour) ?? { cost: 0, c: 0 }
      a.cost += h.cost; a.c += mode === 'all' ? h.allConv : h.conversions
      acc.set(h.hour, a)
    }
    horas = [...acc.entries()].sort(([a], [b]) => a - b).map(([h, a]) => ({ hora: h, coste: r2(a.cost), conversiones: r2(a.c), cpa: r2(safeDiv(a.cost, a.c)) }))
  }

  return {
    cuenta: o.name, moneda: o.currency,
    periodo: o.period, periodoAnterior: o.prevPeriod,
    conversionesUsadas: mode === 'all' ? 'todas las conversiones' : 'conversiones principales',
    cpaMedioCuenta: r2(accountAvgCpa(o, mode)),
    kpisCampanasCpa: {
      coste: r2(kpis.cost), conversiones: r2(kpis.conversions), cpa: r2(kpis.cpa), cpaReferencia: r2(kpis.refCpa),
      tasaConv: r3(kpis.convRate), cpc: r2(kpis.cpc), ctr: r3(kpis.ctr),
      cuotaImpr: r3(kpis.isShare), perdidaPresupuesto: r3(kpis.isLostBudget), perdidaRanking: r3(kpis.isLostRank),
      costeAnterior: r2(kpis.prevCost), conversionesAnterior: r2(kpis.prevConversions), cpaAnterior: r2(kpis.prevCpa),
    },
    campanas: views.slice(0, 30).map(v => ({
      nombre: v.name, estrategia: strategyLabel(v.biddingType, v.targetCpa), cartera: v.portfolioName,
      estadoPuja: v.systemStatus, cpaObjetivo: r2(v.targetCpa), refEsMedia: v.refIsAverage, cpaReferencia: r2(v.refCpa),
      coste: r2(v.cost), conversiones: r2(v.conversions), cpa: r2(v.cpa), cpa7d: r2(v.cpa7), cpaPeriodoAnterior: r2(v.prevCpa),
      desviacion: r3(v.deviation), tasaConv: r3(v.convRate), cpc: r2(v.cpc),
      presupuestoDiario: r2(v.dailyBudget), usoPresupuesto: r3(v.budgetUse),
      cuotaImpr: r3(v.isShare), perdidaPresupuesto: r3(v.isLostBudget), perdidaRanking: r3(v.isLostRank),
    })),
    cambiosRecientes: o.changes.slice(0, 20).map(c => ({ fecha: c.date.slice(0, 10), campana: c.campaign, tipo: c.kind, detalle: c.detail, antes: c.oldValue, despues: c.newValue })),
    accionesConversion: o.conversionActions.map(a => ({ nombre: a.name, categoria: a.category, principal: a.primary, recuento: a.countingType })),
    alertasAutomaticas: alerts.map(a => ({ nivel: a.level, titulo: a.title, detalle: a.description, campana: a.campaign ?? null })),
    segmentos: seg ? {
      dispositivos: segSummary(seg.devices, mode), redes: segSummary(seg.networks, mode),
      ubicaciones: segSummary(seg.geo, mode, 10), edades: segSummary(seg.ages, mode), sexo: segSummary(seg.genders, mode),
      audiencias: segSummary(seg.audiences, mode, 8), horas,
      conversionesPorAccion: seg.conversionsByAction.slice(0, 10),
    } : 'no cargados',
    desperdicio: waste ? {
      totales: waste.totals,
      palabrasSinConversion: waste.keywords.filter(k => k.conversions === 0).slice(0, 15)
        .map(k => ({ texto: k.text, concordancia: k.matchType, campana: k.campaign, coste: k.cost, clics: k.clicks })),
      terminosSinConversion: waste.terms.filter(t => t.conversions === 0).slice(0, 15)
        .map(t => ({ texto: t.text, campana: t.campaign, coste: t.cost, clics: t.clicks })),
    } : 'no cargado',
    simulador: sims ? sims.simulations.slice(0, 10).map(s => ({
      campana: s.campaign, tipo: s.type === 'TARGET_CPA' ? 'CPA objetivo' : 'presupuesto diario', actual: s.current,
      periodo: `${s.startDate} a ${s.endDate}`,
      puntos: s.points.slice(0, 10).map(p => ({ valor: p.x, coste: p.cost, conversiones: p.conversions })),
    })) : 'no cargado',
    datosNoDisponibles: [...o.unavailable, ...(seg?.unavailable ?? []), ...(waste?.unavailable ?? []), ...(sims?.unavailable ?? [])],
  }
}

export async function analyzeCpa(payload: unknown, model?: string | null): Promise<{ analysis: CpaAiAnalysis; model: string; usage: AiUsage }> {
  const input = `Datos de la cuenta (JSON):\n${JSON.stringify(payload)}`
  const { value, model: used, usage } = await callStructured('cpa_analysis', SCHEMA, input, v => analysisZ.parse(v), SYSTEM_PROMPT, model)
  return { analysis: value as CpaAiAnalysis, model: used, usage }
}
