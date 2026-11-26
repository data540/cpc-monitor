'use client'

// Selector del modelo de IA (ChatGPT / Claude vía OpenRouter).
// Las opciones vienen de /api/ai/models: siempre la última versión de cada familia.
import { useEffect, useState } from 'react'
import type { ModelOption } from '@/lib/ai/models'

const STORAGE_KEY = 'ai_model_family'

export interface ModelChoice {
  options: ModelOption[]
  family:  string
  setFamily: (f: string) => void
  model:   string | null      // id de OpenRouter a enviar a la API
  current: ModelOption | null
}

export function useModelChoice(): ModelChoice {
  const [options, setOptions] = useState<ModelOption[]>([])
  const [family, setFamilyState] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/ai/models').then(r => (r.ok ? r.json() : null)).then(j => {
      if (!alive || !j) return
      setOptions(j.models ?? [])
      let saved = ''
      try { saved = localStorage.getItem(STORAGE_KEY) ?? '' } catch { /* sin almacenamiento */ }
      const valid = (j.models ?? []).some((m: ModelOption) => m.family === saved)
      setFamilyState(valid ? saved : j.defaultFamily)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const setFamily = (f: string) => {
    setFamilyState(f)
    try { localStorage.setItem(STORAGE_KEY, f) } catch { /* sin almacenamiento */ }
  }
  const current = options.find(o => o.family === family) ?? null
  return { options, family, setFamily, model: current?.id ?? null, current }
}

const price = (o: ModelOption) =>
  o.priceIn === null ? '' : `$${o.priceIn.toLocaleString('es-ES')} / $${o.priceOut?.toLocaleString('es-ES')} por M tokens`

export function ModelPicker({ choice, disabled }: { choice: ModelChoice; disabled?: boolean }) {
  if (!choice.options.length) {
    return <p className="num text-[11px] text-text-soft">Cargando modelos…</p>
  }
  const groups = (['ChatGPT', 'Claude'] as const).map(p => [p, choice.options.filter(o => o.provider === p)] as const)
  return (
    <div className="space-y-2">
      {groups.map(([provider, opts]) => (
        <div key={provider} className="flex items-center gap-2 flex-wrap">
          <span className="num text-[10px] text-text-soft tracking-widest uppercase w-14">{provider}</span>
          {opts.map(o => (
            <button key={o.family} type="button" disabled={disabled} onClick={() => choice.setFamily(o.family)}
              title={`${o.name} · ${o.hint}${o.priceIn !== null ? ' · ' + price(o) : ''}`}
              className={`num text-[11px] px-3 py-1.5 rounded border tracking-wider transition-colors disabled:opacity-50 ${
                choice.family === o.family
                  ? 'bg-cyan-DEFAULT/10 text-cyan-DEFAULT border-cyan-DEFAULT/40'
                  : 'text-text-secondary border-bg-border hover:text-text-primary'}`}>
              {o.label}
            </button>
          ))}
        </div>
      ))}
      {choice.current && (
        <p className="num text-[11px] text-text-soft">
          <span className="text-text-secondary">{choice.current.name}</span> · {choice.current.hint}
          {choice.current.priceIn !== null && <> · {price(choice.current)}</>}
          {!choice.current.live && <> · <span className="text-amber-DEFAULT">catálogo de OpenRouter no disponible, versión por defecto</span></>}
        </p>
      )}
    </div>
  )
}
