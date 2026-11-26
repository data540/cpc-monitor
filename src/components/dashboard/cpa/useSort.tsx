'use client'

// Ordenación de tablas: clic en la cabecera alterna descendente / ascendente.
import { useMemo, useState } from 'react'

export interface SortState<T> {
  sorted: T[]
  key:    keyof T
  dir:    1 | -1
  toggle: (k: keyof T) => void
}

export function useSort<T>(rows: T[], initialKey: keyof T, initialDir: 1 | -1 = -1): SortState<T> {
  const [key, setKey] = useState<keyof T>(initialKey)
  const [dir, setDir] = useState<1 | -1>(initialDir)

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const x = a[key] as unknown, y = b[key] as unknown
    // Vacíos siempre al final, en cualquier sentido
    const ex = x === null || x === undefined || x === '', ey = y === null || y === undefined || y === ''
    if (ex && ey) return 0
    if (ex) return 1
    if (ey) return -1
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'es', { sensitivity: 'base' }) * dir
    return ((x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0) * dir
  }), [rows, key, dir])

  const toggle = (k: keyof T) => {
    if (k === key) { setDir(d => (d === 1 ? -1 : 1)); return }
    setKey(k)
    // Textos empiezan A→Z; números, de mayor a menor
    const sample = rows.find(r => r[k] !== null && r[k] !== undefined)?.[k]
    setDir(typeof sample === 'string' ? 1 : -1)
  }
  return { sorted, key, dir, toggle }
}

export function SortTh<T>({ s, k, label, align = 'right', title, className = '' }: {
  s: SortState<T>; k: keyof T; label: string; align?: 'left' | 'right'; title?: string; className?: string
}) {
  const active = s.key === k
  return (
    <th onClick={() => s.toggle(k)} title={title ?? 'Ordenar'}
      className={`py-2 px-2 cursor-pointer select-none whitespace-nowrap transition-colors hover:text-text-primary ${align === 'left' ? 'text-left' : 'text-right'} ${active ? 'text-cyan-DEFAULT' : ''} ${className}`}>
      {label}
      <span className={`ml-1 ${active ? '' : 'opacity-40'}`}>{active ? (s.dir === -1 ? '↓' : '↑') : '↕'}</span>
    </th>
  )
}
