// ── Lógica de recomendaciones ─────────────────────────────────
// Portada directa del script de Google Ads que ya funciona en producción.

import { Recommendation } from '@/types'

interface RecommendationInput {
  cpcUsagePct:  number | null
  isActual:     number | null
  cpcCeiling:   number | null
  realRoas:     number | null
  targetRoas:   number | null
}

const ALERT_THRESHOLD_PCT = 85

export function buildRecommendation(d: RecommendationInput): Recommendation {
  if (!d.cpcCeiling) {
    return {
      level:   'info',
      message: 'Sin límite CPC configurado',
      parts:   ['Añade el techo en Configuración o en la estrategia de cartera de Google Ads'],
    }
  }

  const parts: string[] = []
  let level: Recommendation['level'] = 'ok'

  // CPC cerca o en el techo
  if (d.cpcUsagePct !== null && d.cpcUsagePct >= ALERT_THRESHOLD_PCT) {
    parts.push(`CPC al ${d.cpcUsagePct}% del techo → considera subir el límite`)
    level = 'alert'
  } else if (d.cpcUsagePct !== null && d.cpcUsagePct >= 70) {
    parts.push(`CPC al ${d.cpcUsagePct}% del techo → vigilar evolución`)
    level = level === 'ok' ? 'warning' : level
  }

  // CPC muy por debajo del techo
  if (d.cpcUsagePct !== null && d.cpcUsagePct < 50 && d.cpcUsagePct > 0) {
    parts.push(`CPC al ${d.cpcUsagePct}% del techo → margen para bajar el límite`)
    level = level === 'ok' ? 'info' : level
  }

  // IS baja
  if (d.isActual !== null && d.isActual < 0.50) {
    parts.push(`IS baja (${Math.round(d.isActual * 100)}%) → revisa presupuesto y límite CPC`)
    level = level === 'ok' ? 'warning' : level
  }

  // ROAS real vs objetivo
  if (d.targetRoas && d.realRoas) {
    const diff = Math.round(((d.realRoas - d.targetRoas) / d.targetRoas) * 100)
    if (diff > 20) {
      parts.push(`ROAS real (${d.realRoas}) supera objetivo en ${diff}% → margen para más clics`)
      level = level === 'ok' ? 'info' : level
    } else if (diff < -20) {
      parts.push(`ROAS real (${d.realRoas}) por debajo del objetivo → revisar estrategia`)
      level = level === 'ok' ? 'warning' : level
    }
  }

  const message = parts.length > 0 ? parts[0] : 'Sin alertas'
  return { level, message, parts }
}
