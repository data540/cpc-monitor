import { z } from 'zod'

// ── Catálogo de modelos de IA (vía OpenRouter) ────────────────
// Se consulta el catálogo público de OpenRouter y, para cada familia, se elige
// la versión más reciente. Así, cuando salga p. ej. "gpt-6.3-sol" o
// "claude-opus-6", aparecerá sola sin tocar el código.

export interface ModelFamily {
  key:      string
  provider: 'ChatGPT' | 'Claude'
  label:    string
  hint:     string
  pattern:  RegExp            // ids válidos de la familia (sin :batch, :free, ~latest…)
  fallback: string            // si OpenRouter no responde
}

export const MODEL_FAMILIES: ModelFamily[] = [
  { key: 'openai-astra',  provider: 'ChatGPT', label: 'Astra',  hint: 'Máxima calidad · el más caro · ~40 s por cuenta',
    pattern: /^openai\/gpt-\d+(\.\d+)?-astra$/,          fallback: 'openai/gpt-6.2-astra' },
  { key: 'openai-sol',    provider: 'ChatGPT', label: 'Sol',    hint: 'Equilibrio calidad / precio · ~50 s por cuenta',
    pattern: /^openai\/gpt-\d+(\.\d+)?-sol$/,            fallback: 'openai/gpt-6.2-sol' },
  { key: 'openai-luna',   provider: 'ChatGPT', label: 'Luna',   hint: 'Rápido y económico · ~20 s',
    pattern: /^openai\/gpt-\d+(\.\d+)?-luna$/,           fallback: 'openai/gpt-6-luna' },
  { key: 'claude-opus',   provider: 'Claude',  label: 'Opus',   hint: 'Máxima calidad de Claude · ~45 s por cuenta',
    pattern: /^anthropic\/claude-opus-\d+(\.\d+)?$/,     fallback: 'anthropic/claude-opus-5.5' },
  { key: 'claude-sonnet', provider: 'Claude',  label: 'Sonnet', hint: 'Equilibrio calidad / precio · ~20-35 s (recomendado)',
    pattern: /^anthropic\/claude-sonnet-\d+(\.\d+)?$/,   fallback: 'anthropic/claude-sonnet-5.5' },
  { key: 'claude-haiku',  provider: 'Claude',  label: 'Haiku',  hint: 'El más rápido y económico · ~15 s',
    pattern: /^anthropic\/claude-haiku-\d+(\.\d+)?$/,    fallback: 'anthropic/claude-haiku-5.5' },
]

export const DEFAULT_FAMILY = 'claude-sonnet'

export interface ModelOption {
  family:   string
  provider: ModelFamily['provider']
  label:    string
  hint:     string
  id:       string            // id de OpenRouter, p. ej. "openai/gpt-6.2-sol"
  name:     string            // nombre comercial, p. ej. "GPT-6.2 Sol"
  priceIn:  number | null     // USD por millón de tokens
  priceOut: number | null
  live:     boolean           // true si viene del catálogo en vivo
}

const TTL_MS = 6 * 60 * 60 * 1000
type PriceMap = Record<string, { in: number; out: number }>   // USD por millón de tokens
const g = globalThis as unknown as { __aiModels?: { at: number; options: ModelOption[]; prices: PriceMap } }

// Ordena versiones "6.2" > "6.1" > "6" > "5.5"; a igualdad, la más reciente
const versionOf = (id: string) => (id.match(/-(\d+(?:\.\d+)?)(?:-|$)/)?.[1] ?? '0').split('.').map(Number)
function newer(a: any, b: any) {
  const va = versionOf(a.id), vb = versionOf(b.id)
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (va[i] ?? 0) - (vb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return (a.created ?? 0) > (b.created ?? 0)
}

const staticOptions = (): ModelOption[] => MODEL_FAMILIES.map(f => ({
  family: f.key, provider: f.provider, label: f.label, hint: f.hint,
  id: f.fallback, name: f.fallback.split('/')[1], priceIn: null, priceOut: null, live: false,
}))

export async function getModelOptions(force = false): Promise<ModelOption[]> {
  if (!force && g.__aiModels && Date.now() - g.__aiModels.at < TTL_MS) return g.__aiModels.options
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
    const { data } = await res.json() as { data: any[] }
    const prices: PriceMap = {}
    for (const m of data) {
      const pi = Number(m.pricing?.prompt), po = Number(m.pricing?.completion)
      if (isFinite(pi) && isFinite(po)) prices[m.id] = { in: pi * 1e6, out: po * 1e6 }
    }
    const options = MODEL_FAMILIES.map(f => {
      const best = data
        .filter(m => f.pattern.test(m.id))
        .filter(m => (m.supported_parameters ?? []).includes('structured_outputs'))
        .reduce<any>((acc, m) => (!acc || newer(m, acc) ? m : acc), null)
      if (!best) return staticOptions().find(o => o.family === f.key)!
      const per = (v: unknown) => (v === undefined || v === null || isNaN(Number(v)) ? null : Math.round(Number(v) * 1e6 * 100) / 100)
      return {
        family: f.key, provider: f.provider, label: f.label, hint: f.hint, id: best.id,
        name: String(best.name ?? best.id).replace(/^(OpenAI|Anthropic):\s*/, ''),
        priceIn: per(best.pricing?.prompt), priceOut: per(best.pricing?.completion), live: true,
      }
    })
    g.__aiModels = { at: Date.now(), options, prices }
    return options
  } catch (e) {
    console.warn('[ai/models] catálogo de OpenRouter no disponible:', (e as Error).message)
    return g.__aiModels?.options ?? staticOptions()
  }
}

// Precios de todos los modelos del catálogo (para estimar el coste de cada análisis)
export async function getPriceMap(): Promise<PriceMap> {
  await getModelOptions()
  return g.__aiModels?.prices ?? {}
}

// Solo se aceptan modelos de las familias permitidas (evita usar modelos arbitrarios o caros)
export const isAllowedModel = (id: string) => MODEL_FAMILIES.some(f => f.pattern.test(id))

// Validación del modelo recibido en las rutas
export const modelSchema = z.string().max(100).refine(isAllowedModel, 'Modelo no permitido').nullish()
