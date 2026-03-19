'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard')
  }, [status, router])

  const handleLogin = async () => {
    setLoading(true)
    await signIn('google', { callbackUrl: '/dashboard' })
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-base">

      {/* Grid de fondo */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-6">

        {/* Logo / título */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-amber-DEFAULT" />
            <span className="num text-xs tracking-[0.25em] text-text-secondary uppercase">
              CPC Monitor
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary leading-tight">
            Google Ads<br />CPC Dashboard
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Monitorización de límites CPC<br />con estrategia ROAS objetivo
          </p>
        </div>

        {/* Card de login */}
        <div className="bg-bg-card border border-bg-border rounded-lg p-6">

          <div className="mb-6 space-y-2">
            {[
              'CPC actual vs límite en tiempo real',
              'Evolución histórica por campaña',
              'Alertas automáticas por umbral',
              'Soporte para estrategias de cartera (MCC)',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2 text-sm text-text-secondary">
                <div className="w-1 h-1 rounded-full bg-green-DEFAULT flex-shrink-0" />
                {feat}
              </div>
            ))}
          </div>

          <button
            onClick={handleLogin}
            disabled={loading || status === 'loading'}
            className="
              w-full flex items-center justify-center gap-3
              bg-bg-surface hover:bg-bg-hover
              border border-bg-border hover:border-text-tertiary
              text-text-primary text-sm font-medium
              rounded-md px-4 py-3
              transition-all duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {loading ? (
              <span className="num text-xs text-text-secondary animate-pulse">
                Conectando...
              </span>
            ) : (
              <>
                {/* Google icon SVG */}
                <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
                  <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.4-7.7 19.4-19.3 0-1.3-.1-2.5-.4-3.7H43.6z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5.1l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-8H6.1C9.4 35.6 16.3 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 35.5 44 30.2 44 24c0-1.3-.1-2.5-.4-3.7z"/>
                </svg>
                Conectar con Google
              </>
            )}
          </button>

          <p className="mt-4 text-xs text-text-tertiary text-center leading-relaxed">
            Se solicitará acceso de lectura a Google Ads.
            Tus datos no se comparten con terceros.
          </p>
        </div>

        <p className="mt-6 text-center num text-xs text-text-tertiary">
          v0.1 · Air Europa MCC
        </p>
      </div>
    </main>
  )
}
