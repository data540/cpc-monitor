'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { CpcDistributionData, CampaignMetrics } from '@/types'
import clsx from 'clsx'

interface CampaignDetailModalProps {
  campaign: CampaignMetrics | null
  customerId: string
  onClose: () => void
}

type DatePreset = '7days' | '30days' | '90days' | 'custom'

export function CampaignDetailModal({
  campaign,
  customerId,
  onClose,
}: CampaignDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'distribution' | 'hourly'>('distribution')
  const [datePreset, setDatePreset] = useState<DatePreset>('30days')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [data, setData] = useState<CpcDistributionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calcular rango de fechas
  const getDateRange = () => {
    const end = new Date()
    let start = new Date()

    switch (datePreset) {
      case '7days':
        start.setDate(start.getDate() - 7)
        break
      case '30days':
        start.setDate(start.getDate() - 30)
        break
      case '90days':
        start.setDate(start.getDate() - 90)
        break
      case 'custom':
        if (!customStart || !customEnd) return null
        start = new Date(customStart)
        end.setDate(new Date(customEnd).getDate() + 1)
        break
    }

    const fmt = (d: Date) => d.toISOString().split('T')[0]
    return { start: fmt(start), end: fmt(end) }
  }

  // Fetch datos de distribución
  useEffect(() => {
    if (!campaign) return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        const dateRange = getDateRange()
        if (!dateRange) {
          setError('Selecciona rango de fechas válido')
          setLoading(false)
          return
        }

        const params = new URLSearchParams({
          customerId,
          startDate: dateRange.start,
          endDate: dateRange.end,
        })

        const res = await fetch(
          `/api/campaigns/${campaign.campaignId}/cpc-distribution?${params}`,
          { method: 'GET' }
        )

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error ?? `HTTP ${res.status}`)
        }

        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error fetching data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [campaign, customerId, datePreset, customStart, customEnd])

  if (!campaign) return null

  const isOpen = !!campaign

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Modal */}
      <div
        className={clsx(
          'fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-[#0f0f0f] shadow-lg',
          'transform transition-transform duration-300 overflow-hidden flex flex-col',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="border-b border-[#2a2a2a] p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">{campaign.campaignName}</h2>
            <p className="text-xs text-[#999] mt-1">
              Análisis de distribución de CPC por hora
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#999] hover:text-white transition text-xl"
          >
            ✕
          </button>
        </div>

        {/* Date Range Selector */}
        <div className="border-b border-[#2a2a2a] p-6 space-y-3">
          <div className="flex gap-2">
            {(['7days', '30days', '90days'] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  setDatePreset(preset)
                  setCustomStart('')
                  setCustomEnd('')
                }}
                className={clsx(
                  'px-3 py-1 rounded text-xs font-medium transition',
                  datePreset === preset
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#2a2a2a] text-[#ccc] hover:bg-[#333]'
                )}
              >
                {preset === '7days' ? '7 días' : preset === '30days' ? '30 días' : '90 días'}
              </button>
            ))}
            <button
              onClick={() => setDatePreset('custom')}
              className={clsx(
                'px-3 py-1 rounded text-xs font-medium transition',
                datePreset === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#2a2a2a] text-[#ccc] hover:bg-[#333]'
              )}
            >
              Personalizado
            </button>
          </div>

          {datePreset === 'custom' && (
            <div className="flex gap-2 mt-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <p className="text-[#999]">Cargando análisis...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {data && !loading && (
            <>
              {/* Estadísticas Resumen */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Estadísticas</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">Min CPC</p>
                    <p className="text-white font-mono">€{data.stats.minCpc.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">Max CPC</p>
                    <p className="text-white font-mono">€{data.stats.maxCpc.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">Promedio</p>
                    <p className="text-white font-mono">€{data.stats.avgCpc.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">Mediana (p50)</p>
                    <p className="text-white font-mono">€{data.stats.medianCpc.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">P10</p>
                    <p className="text-white font-mono">€{data.stats.p10.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">P25</p>
                    <p className="text-white font-mono">€{data.stats.p25.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">P75</p>
                    <p className="text-white font-mono">€{data.stats.p75.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">P90</p>
                    <p className="text-white font-mono">€{data.stats.p90.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">Desv. Estándar</p>
                    <p className="text-white font-mono">€{data.stats.stdDev.toFixed(3)}</p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
                    <p className="text-[#999] mb-1">Total Clics</p>
                    <p className="text-white font-mono">{data.stats.totalClicks}</p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div>
                <div className="flex gap-2 border-b border-[#2a2a2a] mb-4">
                  <button
                    onClick={() => setActiveTab('distribution')}
                    className={clsx(
                      'px-4 py-2 text-sm font-medium transition border-b-2',
                      activeTab === 'distribution'
                        ? 'text-white border-blue-500'
                        : 'text-[#999] border-transparent hover:text-white'
                    )}
                  >
                    Distribución
                  </button>
                  <button
                    onClick={() => setActiveTab('hourly')}
                    className={clsx(
                      'px-4 py-2 text-sm font-medium transition border-b-2',
                      activeTab === 'hourly'
                        ? 'text-white border-blue-500'
                        : 'text-[#999] border-transparent hover:text-white'
                    )}
                  >
                    {data.temporalMode === 'weekly' ? 'Análisis Semanal' : 'Análisis Horario'}
                  </button>
                </div>

                {/* Distribution Chart */}
                {activeTab === 'distribution' && (
                  <div className="h-80 -mx-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.distribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis
                          dataKey="priceRangeMin"
                          tickFormatter={(val) => `€${Number(val).toFixed(2)}`}
                          stroke="#999"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis stroke="#999" tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                          formatter={(val: any) => [val, 'Clics']}
                          labelFormatter={(label) => `€${Number(label).toFixed(3)}`}
                        />
                        <Legend wrapperStyle={{ color: '#ccc' }} />
                        <Bar dataKey="clickCount" fill="#3b82f6" name="Clics" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Hourly / Weekly Chart */}
                {activeTab === 'hourly' && (
                  <div className="h-80 -mx-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis
                          dataKey="label"
                          stroke="#999"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis stroke="#999" tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                          formatter={(val: any) => [`€${Number(val).toFixed(3)}`, 'CPC Promedio']}
                        />
                        <Legend wrapperStyle={{ color: '#ccc' }} />
                        <Line
                          type="monotone"
                          dataKey="avgCpc"
                          stroke="#10b981"
                          name="CPC Promedio"
                          strokeWidth={2}
                          dot={data.temporalMode === 'weekly'}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
