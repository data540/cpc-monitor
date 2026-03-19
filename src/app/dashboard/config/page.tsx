'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CpcConfig { campaignName: string; cpcCeiling: number }

export default function ConfigPage() {
  const [configs, setConfigs]   = useState<CpcConfig[]>([])
  const [newName, setNewName]   = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => setConfigs(d.configs ?? []))
  }, [])

  const save = async () => {
    if (!newName.trim() || !newValue) return
    setSaving(true)
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignName: newName.trim(), cpcCeiling: parseFloat(newValue) }),
    })
    if (res.ok) {
      const data = await res.json()
      setConfigs(prev => {
        const idx = prev.findIndex(c => c.campaignName === data.config.campaignName)
        if (idx >= 0) { const n = [...prev]; n[idx] = data.config; return n }
        return [...prev, data.config]
      })
      setNewName(''); setNewValue('')
      setMsg('Guardado correctamente')
      setTimeout(() => setMsg(''), 3000)
    }
    setSaving(false)
  }

  const remove = async (campaignName: string) => {
    await fetch(`/api/config?campaignName=${encodeURIComponent(campaignName)}`, { method: 'DELETE' })
    setConfigs(prev => prev.filter(c => c.campaignName !== campaignName))
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-bg-border bg-bg-surface">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="num text-xs text-text-tertiary hover:text-text-secondary transition-colors">
            ← Dashboard
          </Link>
          <div className="w-px h-4 bg-bg-border" />
          <span className="num text-sm font-medium tracking-wider uppercase text-text-primary">
            Configuración de techos CPC
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">

        <p className="text-sm text-text-secondary mb-8 leading-relaxed">
          Cuando las estrategias de cartera pertenecen al MCC, la API no puede leer el techo automáticamente.
          Introduce aquí el valor de <strong className="text-text-primary">Límite de puja máximo</strong> que
          ves en la plataforma de Google Ads para cada campaña.
        </p>

        {/* Tabla de configuraciones actuales */}
        {configs.length > 0 && (
          <div className="mb-8 bg-bg-card border border-bg-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-bg-border">
              <p className="num text-xs text-text-tertiary uppercase tracking-wider">Techos configurados</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-bg-border">
                  <th className="px-4 py-2 text-left num text-xs text-text-tertiary uppercase">Campaña</th>
                  <th className="px-4 py-2 text-right num text-xs text-text-tertiary uppercase">Techo CPC</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {configs.map(c => (
                  <tr key={c.campaignName} className="border-b border-bg-border last:border-0 hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 text-sm text-text-primary">{c.campaignName}</td>
                    <td className="px-4 py-3 num text-sm text-amber-DEFAULT text-right font-medium">
                      {c.cpcCeiling.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remove(c.campaignName)}
                        className="num text-xs text-text-tertiary hover:text-red-DEFAULT transition-colors"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Formulario para añadir */}
        <div className="bg-bg-card border border-bg-border rounded-lg p-6">
          <p className="num text-xs text-text-tertiary uppercase tracking-wider mb-4">
            Añadir / actualizar techo
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre exacto de la campaña"
              className="flex-1 num text-sm bg-bg-surface border border-bg-border focus:border-text-tertiary rounded px-3 py-2 text-text-primary placeholder-text-tertiary outline-none transition-colors"
            />
            <div className="relative w-32">
              <input
                type="number"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder="0.40"
                step="0.01"
                min="0"
                className="w-full num text-sm bg-bg-surface border border-bg-border focus:border-text-tertiary rounded px-3 py-2 pr-7 text-text-primary placeholder-text-tertiary outline-none transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 num text-xs text-text-tertiary">€</span>
            </div>
            <button
              onClick={save}
              disabled={saving || !newName.trim() || !newValue}
              className="num text-xs bg-amber-dim border border-amber-DEFAULT/40 text-amber-DEFAULT hover:bg-amber-DEFAULT/10 px-4 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          {msg && <p className="num text-xs text-green-DEFAULT mt-3">{msg}</p>}
        </div>
      </main>
    </div>
  )
}
