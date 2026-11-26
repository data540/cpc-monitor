'use client'

// Desplegable con casillas (selección múltiple) o selección única, con buscador.
// Lista vacía en modo múltiple = "todas".
import { useEffect, useMemo, useRef, useState } from 'react'

export interface MsOption<T extends string> { v: T; l: string; count?: number }

interface BaseProps<T extends string> {
  options:   MsOption<T>[]
  allLabel?: string          // texto cuando no hay nada seleccionado (múltiple)
  noun?:     string          // "campañas", "estados"… para "3 campañas"
  className?: string
  width?:    string
}

type Props<T extends string> =
  | (BaseProps<T> & { multiple?: true;  value: T[]; onChange: (v: T[]) => void })
  | (BaseProps<T> & { multiple: false; value: T;   onChange: (v: T) => void })

export function MultiSelect<T extends string>(props: Props<T>) {
  const { options, allLabel = 'Todas', noun = 'seleccionadas', className = '', width = 'w-64' } = props
  const multiple = props.multiple !== false
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => { if (!open) setQ('') }, [open])

  const selected = useMemo(() => new Set<T>(multiple ? (props.value as T[]) : [props.value as T]), [multiple, props.value])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter(o => o.l.toLowerCase().includes(s)) : options
  }, [options, q])

  const label = (() => {
    if (!multiple) return options.find(o => o.v === props.value)?.l ?? allLabel
    const vals = props.value as T[]
    if (!vals.length) return allLabel
    if (vals.length === 1) return options.find(o => o.v === vals[0])?.l ?? vals[0]
    return `${vals.length} ${noun}`
  })()

  const toggle = (v: T) => {
    if (!multiple) { (props.onChange as (v: T) => void)(v); setOpen(false); return }
    const vals = props.value as T[]
    ;(props.onChange as (v: T[]) => void)(vals.includes(v) ? vals.filter(x => x !== v) : [...vals, v])
  }
  const setMany = (vals: T[]) => (props.onChange as (v: T[]) => void)(vals)
  const active = multiple && (props.value as T[]).length > 0

  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)} title={label}
        className={`num text-[12px] bg-bg-surface border rounded-md px-2.5 py-2 text-left flex items-center gap-2 max-w-full ${width} ${active ? 'border-cyan-DEFAULT/60 text-cyan-DEFAULT' : 'border-bg-line text-text-primary'} hover:border-text-soft`}>
        <span className="truncate flex-1">{label}</span>
        <span className="text-text-soft text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-full w-[min(420px,90vw)] bg-bg-surface border border-bg-line rounded-md shadow-xl shadow-black/50">
          {options.length > 6 && (
            <div className="p-2 border-b border-bg-line">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
                className="num text-[12px] w-full bg-bg-base border border-bg-line rounded px-2 py-1.5 text-text-primary placeholder:text-text-soft" />
            </div>
          )}
          {multiple && (
            <div className="flex items-center gap-3 px-3 py-1.5 border-b border-bg-line num text-[11px]">
              <button type="button" onClick={() => setMany([])} className="text-text-soft hover:text-text-primary">{allLabel}</button>
              <button type="button" onClick={() => setMany([...new Set([...(props.value as T[]), ...filtered.map(o => o.v)])])}
                className="text-text-soft hover:text-text-primary">Marcar {q ? 'visibles' : 'todas'}</button>
              {(props.value as T[]).length > 0 && (
                <button type="button" onClick={() => setMany([])} className="ml-auto text-cyan-DEFAULT hover:underline">Limpiar ({(props.value as T[]).length})</button>
              )}
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto py-1">
            {filtered.map(o => {
              const on = selected.has(o.v)
              return (
                <li key={o.v}>
                  <button type="button" onClick={() => toggle(o.v)}
                    className={`num text-[12px] w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-bg-hover ${on ? 'text-cyan-DEFAULT' : 'text-text-primary'}`}>
                    {multiple && (
                      <span className={`inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none ${on ? 'border-cyan-DEFAULT bg-cyan-DEFAULT/20' : 'border-text-soft'}`}>{on ? '✓' : ''}</span>
                    )}
                    <span className="break-all flex-1">{o.l}</span>
                    {o.count !== undefined && <span className="text-text-soft text-[11px]">{o.count}</span>}
                  </button>
                </li>
              )
            })}
            {!filtered.length && <li className="num text-[12px] text-text-soft px-3 py-2">Sin coincidencias</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
