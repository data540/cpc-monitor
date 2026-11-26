// ── Análisis experto con OpenAI ───────────────────────────────
// Recibe datos + hallazgos de las reglas y devuelve un análisis estructurado
// (JSON con esquema estricto). Solo servidor.

import OpenAI from 'openai'
import { z } from 'zod'
import type { AccountAuditData, AccountAnalysis, AccountKpis, Finding, GlobalAnalysis } from './types'

// Proveedor principal: OpenAI. Respaldo: OpenRouter (API compatible con OpenAI).
export const AUDIT_MODEL      = process.env.OPENAI_MODEL || 'gpt-5.4-mini'
const FALLBACK_MODEL          = process.env.OPENROUTER_MODEL || `openai/${AUDIT_MODEL}`
const REASONING_EFFORT = (process.env.OPENAI_REASONING_EFFORT || 'low') as 'low' | 'medium' | 'high'

// Vercel gratuito: las funciones cortan a los 60 s. Presupuesto total por llamada
// con margen; si hay respaldo, el principal tiene un tope menor para dejarle tiempo.
const TOTAL_BUDGET_MS    = 55_000
const PRIMARY_TIMEOUT_MS = 34_000
const MIN_FALLBACK_MS    = 12_000

const AREAS = ['cuenta', 'conversiones', 'campanas', 'pujas', 'presupuesto', 'palabras_clave',
  'terminos', 'anuncios', 'extensiones', 'segmentos'] as const

const hasOpenAI     = () => !!process.env.OPENAI_API_KEY
const hasOpenRouter = () => !!process.env.OPENROUTER_API_KEY

let openai: OpenAI | null = null
let openrouter: OpenAI | null = null
const getOpenAI = () => (openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }))
const getOpenRouter = () => (openrouter ??= new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  maxRetries: 0,
}))

// Los modelos de razonamiento (gpt-5*, o*) aceptan `reasoning`; el resto no
const supportsReasoning = (m: string) => /^(openai\/)?(gpt-5|o\d)/.test(m)

const SYSTEM_PROMPT = `Eres un consultor senior de Google Ads con más de 10 años gestionando cuentas de alto presupuesto (búsqueda, Performance Max, Shopping y Display) y estrategias de puja automáticas.

Tu tarea es auditar una cuenta de Google Ads a partir de los datos que te da la herramienta y redactar las conclusiones para el responsable de la cuenta.

Reglas:
- Básate SOLO en los datos recibidos. No inventes cifras, campañas ni configuraciones. Si un dato no está disponible, no lo supongas.
- Los "hallazgos_reglas" son comprobaciones objetivas ya calculadas: úsalos como base, no los contradigas y no los repitas literalmente; interprétalos, prioriza y explica el porqué.
- Cita cifras concretas (importe, %, ROAS, CPA, Nivel de Calidad) y nombra las campañas o elementos afectados.
- Prioriza por impacto en negocio (gasto desperdiciado, ingresos perdidos), no por número de avisos.
- Las recomendaciones deben ser accionables: qué hacer, dónde y qué resultado esperar.
- Escribe en español de España, tono profesional y directo, sin relleno.
- Puntuación 0-100: 90+ excelente, 75-89 buena, 60-74 mejorable, <60 deficiente.
- Límites: hasta 8 puntos fuertes, hasta 10 problemas y hasta 10 recomendaciones.`

const itemSchema = {
  type: 'object', additionalProperties: false,
  required: ['area', 'title', 'detail'],
  properties: {
    area:   { type: 'string', enum: AREAS },
    title:  { type: 'string', description: 'Titular breve (máx. 12 palabras)' },
    detail: { type: 'string', description: 'Explicación con cifras concretas (1-3 frases)' },
  },
} as const

const ACCOUNT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'summary', 'strengths', 'issues', 'recommendations'],
  properties: {
    score:   { type: 'integer', description: 'Puntuación global 0-100' },
    summary: { type: 'string', description: 'Resumen ejecutivo de 3-5 frases' },
    strengths: { type: 'array', items: itemSchema },
    issues: {
      type: 'array',
      items: {
        ...itemSchema,
        required: [...itemSchema.required, 'severity'],
        properties: { ...itemSchema.properties, severity: { type: 'string', enum: ['warning', 'critical'] } },
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['priority', 'area', 'title', 'action', 'impact', 'effort'],
        properties: {
          priority: { type: 'string', enum: ['alta', 'media', 'baja'] },
          area:     { type: 'string', enum: AREAS },
          title:    { type: 'string' },
          action:   { type: 'string', description: 'Qué hacer exactamente y dónde' },
          impact:   { type: 'string', description: 'Resultado esperado' },
          effort:   { type: 'string', enum: ['bajo', 'medio', 'alto'] },
        },
      },
    },
  },
}

const GLOBAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'commonIssues', 'priorities'],
  properties: {
    summary:      { type: 'string', description: 'Visión global de 4-6 frases' },
    commonIssues: { type: 'array', items: { type: 'string' }, description: 'Problemas repetidos en varias cuentas (máx. 6)' },
    priorities:   { type: 'array', items: { type: 'string' }, description: 'Prioridades globales ordenadas (máx. 6)' },
  },
}

// Validación del resultado (además del esquema estricto)
const areaZ = z.enum(AREAS)
const accountZ = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.object({ area: areaZ, title: z.string(), detail: z.string() })),
  issues: z.array(z.object({ area: areaZ, title: z.string(), detail: z.string(), severity: z.enum(['warning', 'critical']) })),
  recommendations: z.array(z.object({
    priority: z.enum(['alta', 'media', 'baja']), area: areaZ, title: z.string(),
    action: z.string(), impact: z.string(), effort: z.enum(['bajo', 'medio', 'alto']),
  })),
})
const globalZ = z.object({ summary: z.string(), commonIssues: z.array(z.string()), priorities: z.array(z.string()) })

// OpenAI (Responses API)
async function viaOpenAI(name: string, schema: object, input: string, timeout: number, system: string): Promise<string> {
  const res = await getOpenAI().responses.create({
    model: AUDIT_MODEL,
    instructions: system,
    input,
    max_output_tokens: 12_000,
    ...(supportsReasoning(AUDIT_MODEL) ? { reasoning: { effort: REASONING_EFFORT } } : {}),
    text: { format: { type: 'json_schema', name, schema: schema as Record<string, unknown>, strict: true } },
  }, { timeout })
  if (res.status === 'incomplete') {
    throw new Error(`Respuesta incompleta de OpenAI (${res.incomplete_details?.reason ?? 'desconocido'})`)
  }
  if (!res.output_text) throw new Error('OpenAI no devolvió contenido (posible rechazo)')
  return res.output_text
}

// OpenRouter (Chat Completions, compatible con OpenAI)
async function viaOpenRouter(name: string, schema: object, input: string, timeout: number, system: string): Promise<string> {
  const res = await getOpenRouter().chat.completions.create({
    model: FALLBACK_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input },
    ],
    max_completion_tokens: 12_000,
    ...(supportsReasoning(FALLBACK_MODEL) ? { reasoning_effort: REASONING_EFFORT } : {}),
    response_format: { type: 'json_schema', json_schema: { name, schema: schema as Record<string, unknown>, strict: true } },
  }, { timeout })
  const choice = res.choices?.[0]
  if (choice?.finish_reason === 'length') throw new Error('Respuesta incompleta de OpenRouter (límite de longitud)')
  const text = choice?.message?.content
  if (!text) throw new Error('OpenRouter no devolvió contenido (posible rechazo)')
  return text
}

// Intenta OpenAI y, si falla o tarda demasiado, OpenRouter. Devuelve qué modelo respondió.
export async function callStructured<T>(name: string, schema: object, input: string, validate: (v: unknown) => T, system: string = SYSTEM_PROMPT): Promise<{ value: T; model: string }> {
  if (!hasOpenAI() && !hasOpenRouter()) throw new Error('Falta OPENAI_API_KEY (u OPENROUTER_API_KEY) en las variables de entorno')
  const started = Date.now()
  let primaryError: unknown = null

  if (hasOpenAI()) {
    try {
      const text = await viaOpenAI(name, schema, input, hasOpenRouter() ? PRIMARY_TIMEOUT_MS : TOTAL_BUDGET_MS, system)
      return { value: validate(JSON.parse(text)), model: AUDIT_MODEL }
    } catch (e) {
      primaryError = e
      console.warn('[audit/analyze] OpenAI falló, probando OpenRouter:', describeOpenAIError(e))
    }
  }

  const remaining = TOTAL_BUDGET_MS - (Date.now() - started)
  if (!hasOpenRouter() || remaining < MIN_FALLBACK_MS) throw primaryError ?? new Error('Sin tiempo para el respaldo')
  try {
    const text = await viaOpenRouter(name, schema, input, remaining, system)
    return { value: validate(JSON.parse(text)), model: `${FALLBACK_MODEL} (OpenRouter)` }
  } catch (e) {
    console.warn('[audit/analyze] OpenRouter falló:', describeOpenAIError(e))
    throw primaryError ?? e
  }
}

// Datos compactos para el modelo: lo relevante, sin ruido
function compactPayload(d: AccountAuditData, kpis: AccountKpis, findings: Finding[]) {
  const r = (n: number | null, dec = 2) => (n === null ? null : Number(n.toFixed(dec)))
  return {
    cuenta: { nombre: d.name, moneda: d.currency, periodo: d.period, puntuacion_optimizacion_google: d.optimizationScore, auto_tagging: d.autoTagging },
    kpis: { coste: r(kpis.cost), clics: kpis.clicks, impresiones: kpis.impressions, conversiones: r(kpis.conversions),
      valor_conversiones: r(kpis.convValue), roas: r(kpis.roas), cpa: r(kpis.cpa), ctr: r(kpis.ctr, 4), cpc_medio: r(kpis.avgCpc) },
    hallazgos_reglas: findings.map(f => ({ area: f.area, severidad: f.severity, titulo: f.title, detalle: f.detail, ambito: f.scope })),
    campanas: d.campaigns.slice(0, 30).map(c => ({
      nombre: c.name, tipo: c.channel, puja: c.biddingStrategy, troas: c.targetRoas, tcpa: c.targetCpa,
      presupuesto_diario: c.dailyBudget, coste: c.cost, clics: c.clicks, conversiones: c.conversions,
      valor: c.convValue, roas: c.cost > 0 ? r(c.convValue / c.cost) : null, ctr: r(c.ctr, 4),
      is: r(c.isShare, 3), is_perdida_presupuesto: r(c.isLostBudget, 3), is_perdida_ranking: r(c.isLostRank, 3),
    })),
    palabras_clave_top: d.keywords.slice(0, 40).map(k => ({
      texto: k.text, concordancia: k.matchType, campana: k.campaign, qs: k.qualityScore,
      ctr_esperado: k.expectedCtr, relevancia: k.adRelevance, landing: k.landingPage,
      coste: k.cost, clics: k.clicks, conversiones: k.conversions,
    })),
    terminos_busqueda_top: d.searchTerms.slice(0, 40).map(t => ({ termino: t.term, campana: t.campaign, coste: t.cost, clics: t.clicks, conversiones: t.conversions })),
    anuncios: summarizeAds(d),
    recursos: { cuenta: d.assetTypes.account, campanas_con_recursos: Object.keys(d.assetTypes.byCampaign).length },
    negativas: d.negatives,
    dispositivos: d.devices, horas: d.hours, ubicaciones: d.geo,
    acciones_conversion: d.conversionActions,
    recomendaciones_google: d.googleRecommendations.slice(0, 10),
    datos_no_disponibles: d.unavailable,
  }
}

function summarizeAds(d: AccountAuditData) {
  const byType: Record<string, number> = {}, byStrength: Record<string, number> = {}, byApproval: Record<string, number> = {}
  for (const a of d.ads) {
    byType[a.type] = (byType[a.type] ?? 0) + 1
    if (a.adStrength) byStrength[a.adStrength] = (byStrength[a.adStrength] ?? 0) + 1
    if (a.approvalStatus) byApproval[a.approvalStatus] = (byApproval[a.approvalStatus] ?? 0) + 1
  }
  return { total: d.ads.length, por_tipo: byType, por_fuerza: byStrength, por_aprobacion: byApproval }
}

export async function analyzeAccount(d: AccountAuditData, kpis: AccountKpis, findings: Finding[]): Promise<{ analysis: AccountAnalysis; model: string }> {
  const input = `Audita esta cuenta de Google Ads. Datos (JSON):\n${JSON.stringify(compactPayload(d, kpis, findings))}`
  const { value, model } = await callStructured('auditoria_cuenta', ACCOUNT_SCHEMA, input, v => accountZ.parse(v))
  return { analysis: value, model }
}

export async function analyzeGlobal(accounts: { name: string; kpis: AccountKpis; analysis: AccountAnalysis }[]): Promise<GlobalAnalysis> {
  const payload = accounts.map(a => ({
    cuenta: a.name, puntuacion: a.analysis.score, resumen: a.analysis.summary,
    coste: Math.round(a.kpis.cost), roas: a.kpis.roas, cpa: a.kpis.cpa,
    problemas: a.analysis.issues.map(i => `[${i.severity}] ${i.title}`),
    recomendaciones_alta: a.analysis.recommendations.filter(r => r.priority === 'alta').map(r => r.title),
  }))
  const input = `Estas son las auditorías individuales de varias cuentas de un mismo cliente/MCC. Redacta la visión global: estado general, problemas que se repiten y prioridades para el conjunto. Datos (JSON):\n${JSON.stringify(payload)}`
  return (await callStructured('auditoria_global', GLOBAL_SCHEMA, input, v => globalZ.parse(v))).value
}

export function describeOpenAIError(e: unknown): string {
  if (e instanceof OpenAI.APIConnectionTimeoutError) return 'OpenAI tardó demasiado en responder. Prueba con menos cuentas o vuelve a intentarlo.'
  if (e instanceof OpenAI.RateLimitError) {
    const code = (e as any).code ?? (e as any).error?.code
    if (code === 'insufficient_quota' || code === 'credit_balance_exhausted') return 'La cuenta de OpenAI no tiene saldo.'
    return 'Límite de uso de la IA alcanzado. Espera un momento y reintenta.'
  }
  if (e instanceof OpenAI.AuthenticationError) return 'La clave de OpenAI no es válida.'
  if (e instanceof OpenAI.APIError) return `Error de OpenAI (${e.status ?? '—'}): ${e.message}`
  if (e instanceof z.ZodError) return 'La respuesta de la IA no tenía el formato esperado.'
  return e instanceof Error ? e.message : String(e)
}
