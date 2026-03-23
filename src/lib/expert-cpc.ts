// ── Motor Experto de CPC ───────────────────────────────────────
// Calcula el techo de CPC óptimo a partir de las métricas de campaña,
// la distribución estadística y la tendencia histórica.

import { CampaignMetrics, CpcDistributionData, TrendData } from '@/types'

export interface ExpertRecommendation {
  suggestedCeiling: number
  currentCeiling:   number | null
  delta:            number
  deltaPercent:     number | null
  confidence:       'high' | 'medium' | 'low'
  scenario:         'raise_constrained'
                  | 'raise_losing_traffic'
                  | 'lower_underperforming'
                  | 'hold_no_ceiling'
                  | 'hold_stable'
                  | 'hold_budget_bottleneck'
                  | 'is_below_threshold'
  reasoning:        string[]
}

interface EngineInput {
  metrics:      CampaignMetrics
  distribution: CpcDistributionData | null
  trend:        TrendData | null
  isThreshold:  number | null
}

// ── Umbrales ──────────────────────────────────────────────────

const ROAS_OVERPERFORM_THRESHOLD   = 1.15
const ROAS_UNDERPERFORM_THRESHOLD  = 0.90
const CPC_SATURATION_THRESHOLD     = 82
const IS_LOW_THRESHOLD             = 0.75
const IS_RANK_DOMINANT_THRESHOLD   = 0.60   // >60% de la IS perdida es por ranking → techo CPC es el cuello de botella
const MIN_CLICKS_HIGH_CONFIDENCE   = 150
const MIN_CLICKS_MEDIUM_CONFIDENCE = 50

// ── Función principal ─────────────────────────────────────────

export function computeOptimalCeiling(input: EngineInput): ExpertRecommendation {
  const { metrics: m, distribution: dist, trend, isThreshold } = input
  const reasoning: string[] = []

  // ── Señales derivadas ─────────────────────────────────────────

  const efficiencyRatio = (m.realRoas && m.targetRoas && m.targetRoas > 0)
    ? m.realRoas / m.targetRoas
    : null

  // CPC máximo admisible para cubrir el ROAS objetivo
  const breakEvenCpc = (m.avgCpc > 0 && efficiencyRatio !== null)
    ? round2(m.avgCpc * efficiencyRatio)
    : null

  // Impresiones estimadas perdidas
  const lostImpressions = (m.isActual && m.isActual > 0 && m.isActual < 1)
    ? Math.round(m.impressions / m.isActual * (1 - m.isActual))
    : null

  // Posición del CPC medio en la distribución (percentil aproximado)
  const cpcPercentileInDist = dist
    ? approxPercentile(m.avgCpc, dist)
    : null

  // Dispersión de CPCs: stdDev / avg → coeficiente de variación
  const cpcVariability = dist && dist.stats.avgCpc > 0
    ? round2(dist.stats.stdDev / dist.stats.avgCpc)
    : null

  // ── IS decomposición: ¿por qué se pierde IS? ──────────────────

  const totalIsLost = (m.isLostBudget ?? 0) + (m.isLostRank ?? 0)
  const rankShare   = totalIsLost > 0.01 && m.isLostRank != null
    ? m.isLostRank / totalIsLost
    : null  // % de la IS perdida atribuible a ranking de puja

  // El techo de CPC es el cuello de botella cuando la mayoría de la pérdida es por ranking
  const rankIsDominantBottleneck = rankShare !== null && rankShare >= IS_RANK_DOMINANT_THRESHOLD
  // El presupuesto es el cuello de botella
  const budgetIsDominantBottleneck = rankShare !== null && rankShare < (1 - IS_RANK_DOMINANT_THRESHOLD)

  // ── Bloque 0: sin techo configurado ──────────────────────────

  if (!m.cpcCeiling) {
    const suggested = dist
      ? round2(dist.stats.p90 * 1.1)
      : round2(m.avgCpc * 1.3)

    reasoning.push(`No hay techo de CPC configurado en esta campaña.`)
    if (dist) {
      reasoning.push(
        `El p90 de CPCs reales es €${f2(dist.stats.p90)}, lo que significa que el 90% de las pujas ` +
        `ganadoras se pagan por debajo de esa cifra. Se propone €${f2(suggested)} como primer techo (p90 + 10%).`
      )
    } else {
      reasoning.push(
        `CPC medio actual €${f2(m.avgCpc)}. Sin datos de distribución, se propone €${f2(suggested)} ` +
        `(+30% sobre el CPC medio) como techo inicial conservador.`
      )
    }
    if (breakEvenCpc && m.targetRoas) {
      reasoning.push(
        `Con el ROAS objetivo de ${f2(m.targetRoas)}, el CPC máximo admisible para mantener la rentabilidad ` +
        `es aproximadamente €${f2(breakEvenCpc)}.`
      )
    }

    return {
      suggestedCeiling: suggested,
      currentCeiling:   null,
      delta:            suggested,
      deltaPercent:     null,
      confidence:       'low',
      scenario:         'hold_no_ceiling',
      reasoning,
    }
  }

  // ── Señales booleanas ─────────────────────────────────────────

  const isSaturated    = m.cpcUsagePct !== null && m.cpcUsagePct >= CPC_SATURATION_THRESHOLD
  const isLosingIS     = m.isActual !== null && m.isActual < IS_LOW_THRESHOLD
  const overperforming  = efficiencyRatio !== null && efficiencyRatio >= ROAS_OVERPERFORM_THRESHOLD
  const underperforming = efficiencyRatio !== null && efficiencyRatio <= ROAS_UNDERPERFORM_THRESHOLD

  // Ancla estadística: p90 si hay distribución, avgCpc si no
  const anchor = dist ? dist.stats.p90 : m.avgCpc

  // ── Bloques de escenarios ─────────────────────────────────────

  let suggested: number
  let scenario:  ExpertRecommendation['scenario']

  // ── Bloque IS threshold: IS por debajo del umbral objetivo ────
  // Se comprueba ANTES que underperforming y overperforming
  // Solo se activa si hay umbral configurado y la IS está por debajo

  if (isThreshold !== null && isThreshold > 0 && m.isActual !== null && m.isActual < isThreshold) {
    scenario = 'is_below_threshold'
    const isPct = Math.round(m.isActual * 100)
    const thresholdPct = Math.round(isThreshold * 100)
    const gap = thresholdPct - isPct

    reasoning.push(
      `⚠ ALERTA IS: Impression Share del ${isPct}% — ${gap} puntos por debajo del umbral objetivo del ${thresholdPct}%.`
    )

    if (m.isLostBudget !== null && m.isLostRank !== null && totalIsLost > 0.01) {
      const budgetLostPct = Math.round(m.isLostBudget * 100)
      const rankLostPct = Math.round(m.isLostRank * 100)
      if (rankIsDominantBottleneck) {
        reasoning.push(
          `La pérdida de IS es principalmente por ranking de puja: ${rankLostPct}% por ranking vs ${budgetLostPct}% por presupuesto. ` +
          `El techo CPC está limitando la cobertura en subastas competidas.`
        )
        const multiplier = Math.min(efficiencyRatio ?? 1.15, 1.25)
        suggested = round2(anchor * multiplier)
        reasoning.push(
          `Se recomienda subir el techo de €${f2(m.cpcCeiling)} a €${f2(suggested)} para recuperar IS y alcanzar el umbral objetivo del ${thresholdPct}%.`
        )
      } else {
        reasoning.push(
          `La pérdida de IS es principalmente por presupuesto: ${budgetLostPct}% por presupuesto vs ${rankLostPct}% por ranking. ` +
          `Subir el techo CPC no recuperará estas impresiones.`
        )
        suggested = round2(m.cpcCeiling)
        reasoning.push(
          `Recomendación: mantener el techo CPC actual (€${f2(m.cpcCeiling)}) y aumentar el presupuesto diario para recuperar IS hasta el ${thresholdPct}%.`
        )
      }
    } else {
      suggested = round2(m.cpcCeiling * 1.10)
      reasoning.push(
        `Sin datos de descomposición IS, se propone subir el techo un 10% a €${f2(suggested)} como medida para mejorar el ranking en subastas.`
      )
    }

    if (lostImpressions) {
      reasoning.push(
        `Se estiman ~${lostImpressions.toLocaleString('es-ES')} impresiones perdidas diariamente. ` +
        `Recuperar el umbral del ${thresholdPct}% requeriría capturar aproximadamente ${Math.round(lostImpressions * (gap / 100)).toLocaleString('es-ES')} impresiones adicionales.`
      )
    }

  // ── Bloque 1: bajo rendimiento ────────────────────────────────

  } else if (underperforming) {
    scenario = 'lower_underperforming'
    const base = dist ? Math.max(dist.stats.medianCpc, m.avgCpc * 0.92) : m.avgCpc * 0.92
    suggested  = round2(base)

    if (efficiencyRatio !== null && m.realRoas && m.targetRoas) {
      const gap = Math.round((1 - efficiencyRatio) * 100)
      reasoning.push(
        `ROAS real: ${f2(m.realRoas)} vs objetivo: ${f2(m.targetRoas)} — brecha del ${gap}%. ` +
        `Por cada € invertido estás generando ${f2(m.realRoas)} € en conversiones, ` +
        `cuando necesitas al menos ${f2(m.targetRoas)} €.`
      )
    }
    if (breakEvenCpc) {
      reasoning.push(
        `Para alcanzar el ROAS objetivo con el patrón de conversión actual, el CPC máximo ` +
        `admisible es €${f2(breakEvenCpc)}. El techo actual de €${f2(m.cpcCeiling)} está ` +
        `${m.cpcCeiling > breakEvenCpc ? 'por encima' : 'dentro'} de ese límite.`
      )
    }
    reasoning.push(
      `Se recomienda bajar el techo de €${f2(m.cpcCeiling)} a €${f2(suggested)} ` +
      `para forzar pujas más eficientes y mejorar el ROAS.`
    )
    if (dist) {
      reasoning.push(
        `La mediana de CPCs reales es €${f2(dist.stats.medianCpc)} — ` +
        `el 50% de las subastas ganadoras se resuelven por debajo de esa cifra. ` +
        `Se usa como suelo para no cortar conversiones actuales.`
      )
    }
    if (m.cpcUsagePct !== null) {
      reasoning.push(
        `El CPC medio ocupa el ${f2(m.cpcUsagePct)}% del techo actual — ` +
        `hay margen técnico para reducirlo sin bloquear el volumen existente.`
      )
    }
    // Tendencia refuerza o modera la señal
    if (trend && trend.dataPoints >= 3) {
      if (trend.direction === 'up') {
        reasoning.push(
          `⚠ Tendencia: el CPC medio ha subido un ${Math.abs(trend.cpcChangePct)}% ` +
          `en los últimos ${trend.periodDays} días (${trend.dataPoints} capturas). ` +
          `La presión alcista refuerza la necesidad de ajustar el techo a la baja.`
        )
      } else if (trend.direction === 'down') {
        reasoning.push(
          `ℹ Tendencia: el CPC medio ha bajado un ${Math.abs(trend.cpcChangePct)}% ` +
          `en los últimos ${trend.periodDays} días — el mercado ya se está ajustando. ` +
          `Monitorizar antes de reducir el techo adicionalmente.`
        )
      }
    }

  // ── Bloque 2: sobrerendimiento + IS perdida ────────────────────
  //    Subdivisión: ¿el cuello de botella es el techo CPC o el presupuesto?

  } else if (overperforming && (isSaturated || isLosingIS)) {

    // Sub-caso 2b: la pérdida de IS es mayoritariamente por presupuesto, no por ranking
    if (isLosingIS && budgetIsDominantBottleneck && m.isLostBudget !== null && m.isLostRank !== null) {
      scenario = 'hold_budget_bottleneck'
      suggested = round2(m.cpcCeiling)   // no mover el techo

      if (efficiencyRatio !== null && m.realRoas && m.targetRoas) {
        const surplus = Math.round((efficiencyRatio - 1) * 100)
        reasoning.push(
          `ROAS real: ${f2(m.realRoas)} vs objetivo: ${f2(m.targetRoas)} — superávit del ${surplus}%. ` +
          `La campaña es rentable y tiene margen.`
        )
      }
      const isPct       = Math.round((m.isActual ?? 0) * 100)
      const budgetLostPct = Math.round(m.isLostBudget * 100)
      const rankLostPct   = Math.round(m.isLostRank * 100)
      reasoning.push(
        `IS del ${isPct}% — pérdida de impresiones: ${budgetLostPct}% por presupuesto vs ${rankLostPct}% por ranking. ` +
        `El cuello de botella es el presupuesto, no el techo de CPC. ` +
        `Subir el CPC no recuperaría estas impresiones; solo incrementaría el coste por clic pagado.`
      )
      reasoning.push(
        `Recomendación: mantener el techo CPC actual (€${f2(m.cpcCeiling)}) y valorar aumentar el presupuesto ` +
        `diario si el objetivo es capturar más volumen.`
      )
      if (lostImpressions) {
        reasoning.push(
          `Se estiman ~${lostImpressions.toLocaleString('es-ES')} impresiones perdidas por restricción de presupuesto.`
        )
      }

    } else {
      // Sub-caso 2a: pérdida de IS por ranking → el techo CPC limita el alcance
      scenario = 'raise_losing_traffic'
      const multiplier = Math.min(efficiencyRatio ?? 1.2, 1.35)
      suggested = round2(anchor * multiplier)

      if (efficiencyRatio !== null && m.realRoas && m.targetRoas) {
        const surplus = Math.round((efficiencyRatio - 1) * 100)
        reasoning.push(
          `ROAS real: ${f2(m.realRoas)} vs objetivo: ${f2(m.targetRoas)} — superávit del ${surplus}%. ` +
          `La campaña genera ${f2(m.realRoas)} € por cada € invertido, ${surplus}% más de lo requerido. ` +
          `Hay rentabilidad de sobra para absorber un CPC más alto.`
        )
      }
      // IS decomposition
      if (m.isLostRank !== null && m.isLostBudget !== null && totalIsLost > 0.01) {
        const rankLostPct   = Math.round(m.isLostRank * 100)
        const budgetLostPct = Math.round(m.isLostBudget * 100)
        reasoning.push(
          `IS del ${Math.round((m.isActual ?? 0) * 100)}% — ` +
          `${rankLostPct}% de IS perdida por ranking de puja (techo CPC insuficiente) vs ${budgetLostPct}% por presupuesto. ` +
          `El techo actual está limitando directamente el alcance en subastas competidas.`
        )
      } else if (isSaturated && m.cpcUsagePct !== null) {
        reasoning.push(
          `El CPC medio está al ${f2(m.cpcUsagePct)}% del techo — Google ya no puede pujar ` +
          `más en subastas que lo requieran. Esto limita el alcance en las franjas horarias ` +
          `y palabras clave más competidas.`
        )
      }
      if (isLosingIS && m.isActual !== null && !(m.isLostRank !== null)) {
        const isPct = Math.round(m.isActual * 100)
        reasoning.push(
          `Impression Share del ${isPct}%${lostImpressions ? ` — se estiman ~${lostImpressions.toLocaleString('es-ES')} impresiones perdidas` : ''}. ` +
          `Con una IS más alta captarías más clics del mismo tráfico de búsqueda sin aumentar el CPC real promedio, ` +
          `solo ampliar el rango de subastas en las que participas.`
        )
      }
      if (dist) {
        reasoning.push(
          `El p90 de CPCs pagados es €${f2(dist.stats.p90)} (ancla del cálculo). ` +
          `Subir el techo a €${f2(suggested)} (p90 × ${f2(multiplier)}) permitiría ` +
          `ganar las subastas del decil superior sin comprometer la rentabilidad media.`
        )
        if (cpcPercentileInDist !== null) {
          reasoning.push(
            `Tu CPC medio actual (€${f2(m.avgCpc)}) equivale al percentil ~${cpcPercentileInDist} ` +
            `de la distribución observada — hay recorrido real hacia arriba.`
          )
        }
      } else {
        reasoning.push(
          `Sin datos de distribución, el techo propuesto (€${f2(suggested)}) ` +
          `aplica un multiplicador de ×${f2(multiplier)} sobre el CPC medio.`
        )
      }
      // Tendencia IS refuerza la señal
      if (trend && trend.dataPoints >= 3 && trend.isDirection === 'down') {
        reasoning.push(
          `⚠ Tendencia: la IS ha bajado un ${Math.abs(trend.isChangePct ?? 0)}% ` +
          `en los últimos ${trend.periodDays} días — la pérdida de cobertura se está acelerando. ` +
          `Actuar antes de que el algoritmo pierda más señal de conversión.`
        )
      }
    }

  // ── Bloque 3: techo saturado, ROAS aceptable ──────────────────

  } else if (isSaturated && !underperforming) {
    scenario = 'raise_constrained'
    suggested = round2(anchor * 1.08)

    if (m.cpcUsagePct !== null) {
      reasoning.push(
        `El CPC medio ocupa el ${f2(m.cpcUsagePct)}% del techo — las pujas están siendo ` +
        `cortadas activamente. Google Smart Bidding necesita margen para optimizar; ` +
        `un techo demasiado ajustado restringe su capacidad de reacción.`
      )
    }
    if (dist) {
      reasoning.push(
        `El techo propuesto de €${f2(suggested)} equivale al p90 (€${f2(dist.stats.p90)}) + 8%. ` +
        `Esto abre el acceso al decil superior de subastas sin un salto agresivo de presupuesto.`
      )
      if (cpcVariability !== null) {
        const label = cpcVariability > 0.3 ? 'alta' : cpcVariability > 0.15 ? 'moderada' : 'baja'
        reasoning.push(
          `La variabilidad de CPCs es ${label} (coef. variación: ${Math.round(cpcVariability * 100)}%). ` +
          `${cpcVariability > 0.3
            ? 'Dispersión alta → los precios de subasta varían mucho; un techo más holgado es importante.'
            : 'Dispersión contenida → el mercado es estable, el ajuste es de precisión.'
          }`
        )
      }
    } else {
      reasoning.push(
        `Se propone subir el techo a €${f2(suggested)} (+8% sobre el CPC medio) ` +
        `para dar margen al algoritmo de Google sin exposición relevante.`
      )
    }
    if (efficiencyRatio !== null) {
      reasoning.push(
        `ROAS en rango objetivo (${f2(m.realRoas)} vs ${f2(m.targetRoas)}) — ` +
        `el ajuste es conservador para mantener la eficiencia actual.`
      )
    }
    // IS decomposition en bloque 3
    if (m.isLostRank !== null && m.isLostBudget !== null && totalIsLost > 0.01) {
      const rankLostPct   = Math.round(m.isLostRank * 100)
      const budgetLostPct = Math.round(m.isLostBudget * 100)
      reasoning.push(
        `IS decomposición: ${rankLostPct}% perdida por ranking de puja vs ${budgetLostPct}% por presupuesto. ` +
        `${rankIsDominantBottleneck
          ? 'El techo CPC es el principal freno — la subida es especialmente oportuna.'
          : 'El presupuesto también limita la IS — considerar revisarlo en paralelo.'
        }`
      )
    }
    // Tendencia CPC
    if (trend && trend.dataPoints >= 3 && trend.direction === 'up') {
      reasoning.push(
        `ℹ Tendencia: el CPC medio lleva ${trend.periodDays} días subiendo (+${trend.cpcChangePct}%). ` +
        `Si la tendencia continúa, el techo actual se quedará pequeño antes de lo previsto.`
      )
    }

  // ── Bloque 4: situación estable ───────────────────────────────

  } else {
    scenario = 'hold_stable'
    suggested = round2(m.cpcCeiling)

    reasoning.push(
      `El techo actual (€${f2(m.cpcCeiling)}) está bien calibrado respecto a los patrones de puja.`
    )
    if (m.cpcUsagePct !== null) {
      reasoning.push(
        `CPC medio al ${f2(m.cpcUsagePct)}% del techo — hay margen activo de ` +
        `€${f2(m.cpcCeiling - m.avgCpc)} entre el CPC real y el límite. ` +
        `Google puede pujar libremente sin restricciones.`
      )
    }
    if (efficiencyRatio !== null && m.realRoas && m.targetRoas) {
      const pctLabel = efficiencyRatio >= 1
        ? `${Math.round((efficiencyRatio - 1) * 100)}% por encima del objetivo`
        : `${Math.round((1 - efficiencyRatio) * 100)}% por debajo del objetivo`
      reasoning.push(
        `ROAS: ${f2(m.realRoas)} vs objetivo ${f2(m.targetRoas)} (${pctLabel}). ` +
        `Dentro del rango aceptable — no hay señal de ajuste necesario.`
      )
    }
    if (m.isActual !== null) {
      reasoning.push(
        `Impression Share del ${Math.round(m.isActual * 100)}% — ` +
        `${m.isActual >= 0.85
          ? 'cobertura muy alta, la campaña captura la mayoría del tráfico disponible.'
          : 'cobertura razonable para el CPC actual.'
        }`
      )
    }
    if (dist) {
      reasoning.push(
        `CPC medio (€${f2(m.avgCpc)}) vs rango estadístico [€${f2(dist.stats.p25)}–€${f2(dist.stats.p75)}] ` +
        `(rango intercuartil). El CPC actual se comporta dentro de la distribución histórica normal.`
      )
    }
    // Tendencia estable o bajista refuerza el hold
    if (trend && trend.dataPoints >= 3) {
      if (trend.direction === 'stable') {
        reasoning.push(
          `Tendencia: CPC estable en los últimos ${trend.periodDays} días ` +
          `(variación < 5% en ${trend.dataPoints} capturas) — no hay presión de mercado que justifique un cambio.`
        )
      } else if (trend.direction === 'down') {
        reasoning.push(
          `ℹ Tendencia: el CPC medio ha bajado un ${Math.abs(trend.cpcChangePct)}% ` +
          `en los últimos ${trend.periodDays} días — el mercado se está relajando. ` +
          `Buen momento para mantener el techo y dejar que el algoritmo optimice.`
        )
      } else if (trend.direction === 'up') {
        reasoning.push(
          `ℹ Tendencia: el CPC medio ha subido un ${trend.cpcChangePct}% en ${trend.periodDays} días. ` +
          `Todavía dentro del rango aceptable, pero vigilar si la tendencia continúa.`
        )
      }
    }
  }

  // ── Bloque 5: guardrails ──────────────────────────────────────

  const maxAllowed = round2(m.cpcCeiling * 2)
  const minAllowed = dist ? dist.stats.minCpc : round2(m.avgCpc * 0.5)

  if (suggested > maxAllowed) {
    reasoning.push(`⚠ Ajustado al máximo permitido (2× techo actual = €${f2(maxAllowed)}) para evitar saltos bruscos.`)
    suggested = maxAllowed
  }
  if (suggested < minAllowed) {
    reasoning.push(`⚠ Ajustado al mínimo observado (€${f2(minAllowed)}) para no eliminar conversiones actuales.`)
    suggested = minAllowed
  }

  // ── Bloque 6: confianza ───────────────────────────────────────

  let confidence: ExpertRecommendation['confidence']
  const hasRoas = m.realRoas !== null && m.targetRoas !== null
  const hasIS   = m.isActual !== null
  const hasDist = dist !== null
  const hasTrend = trend !== null && trend.dataPoints >= 3

  if (m.clicks >= MIN_CLICKS_HIGH_CONFIDENCE && hasRoas && hasIS && hasDist) {
    confidence = hasTrend ? 'high' : 'high'
  } else if (m.clicks >= MIN_CLICKS_MEDIUM_CONFIDENCE && (hasRoas || hasDist)) {
    confidence = 'medium'
  } else {
    confidence = 'low'
    reasoning.push(
      `Muestra insuficiente (${m.clicks} clics). Se necesitan al menos ${MIN_CLICKS_MEDIUM_CONFIDENCE} ` +
      `clics para una recomendación fiable — tratar como orientativa.`
    )
  }

  // ── Resultado ─────────────────────────────────────────────────

  const delta        = round2(suggested - m.cpcCeiling)
  const deltaPercent = round2((delta / m.cpcCeiling) * 100)

  return { suggestedCeiling: suggested, currentCeiling: m.cpcCeiling, delta, deltaPercent, confidence, scenario, reasoning }
}

// ── Helpers ───────────────────────────────────────────────────

function round2(n: number): number { return Math.round(n * 100) / 100 }
function f2(n: number | null | undefined): string { return n != null ? n.toFixed(2) : '—' }

/** Percentil aproximado de un valor dentro de la distribución observada */
function approxPercentile(value: number, dist: CpcDistributionData): number {
  const sorted = [
    dist.stats.p10,
    dist.stats.p25,
    dist.stats.medianCpc,
    dist.stats.p75,
    dist.stats.p90,
  ]
  const thresholds = [10, 25, 50, 75, 90]
  for (let i = 0; i < sorted.length; i++) {
    if (value <= sorted[i]) return thresholds[i]
  }
  return 95
}
