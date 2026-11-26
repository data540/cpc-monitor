// Consumo de IA (tokens y coste estimado). Puro: servidor y cliente.

export interface AiUsage { inputTokens: number; outputTokens: number; costUsd: number | null }

export const addUsage = (a: AiUsage | null | undefined, b: AiUsage | null | undefined): AiUsage | null => {
  if (!a) return b ?? null
  if (!b) return a
  return {
    inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd === null && b.costUsd === null ? null : (a.costUsd ?? 0) + (b.costUsd ?? 0),
  }
}

// "0,0234 $ · 12.345 tokens de entrada y 3.210 de salida"
export function formatUsage(u: AiUsage | null | undefined): string {
  if (!u) return 'sin datos de consumo'
  const n = (x: number) => x.toLocaleString('es-ES')
  const cost = u.costUsd === null ? 'coste no disponible'
    : `${u.costUsd.toLocaleString('es-ES', { minimumFractionDigits: u.costUsd < 0.1 ? 4 : 2, maximumFractionDigits: u.costUsd < 0.1 ? 4 : 2 })} $`
  return `${cost} · ${n(u.inputTokens)} tokens de entrada y ${n(u.outputTokens)} de salida`
}
