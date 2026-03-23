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
    <main className="min-h-screen flex items-center justify-center bg-bg-base overflow-hidden">

      {/* Grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(0,212,255,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-[380px] px-6 flex flex-col items-center">

        {/* App icon */}
        <div className="mb-6">
          <img
            src="/icon.svg"
            alt="CPC Monitor"
            width={88}
            height={88}
            className="rounded-2xl"
            style={{ filter: 'drop-shadow(0 0 24px rgba(0,212,255,0.25))' }}
          />
        </div>

        {/* Title */}
        <h1 className="num text-3xl font-bold text-text-primary tracking-tight mb-1 text-center">
          CPC Monitor
        </h1>
        <p className="num text-xs text-text-tertiary tracking-[0.2em] uppercase mb-8 text-center">
          Google Ads CPC Dashboard
        </p>

        {/* Card */}
        <div className="w-full bg-bg-card border border-bg-border rounded-xl p-6">

          {/* Feature list */}
          <div className="mb-6 space-y-3">
            {[
              { icon: '◎', text: 'CPC actual vs límite en tiempo real' },
              { icon: '↗', text: 'Evolución histórica por campaña' },
              { icon: '⚠', text: 'Alertas automáticas por umbral' },
              { icon: '▦', text: 'Soporte para estrategias MCC' },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-cyan-DEFAULT text-sm w-4 flex-shrink-0">{icon}</span>
                <span className="num text-xs text-text-secondary tracking-wide">{text}</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-bg-border mb-5" />

          {/* CTA button */}
          <button
            onClick={handleLogin}
            disabled={loading || status === 'loading'}
            className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: loading ? 'rgba(0,212,255,0.15)' : '#00D4FF',
              color: loading ? '#00D4FF' : '#0a0a0a',
              boxShadow: loading ? 'none' : '0 0 20px rgba(0,212,255,0.3)',
            }}
            onMouseEnter={e => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#33DDFF'
            }}
            onMouseLeave={e => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#00D4FF'
            }}
          >
            {loading ? (
              <span className="num text-xs tracking-widest animate-pulse">CONECTANDO...</span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span className="num tracking-widest text-xs font-bold">CONECTAR CON GOOGLE</span>
              </>
            )}
          </button>

          <p className="mt-4 text-[10px] text-text-tertiary text-center leading-relaxed num tracking-wide">
            Acceso de lectura a Google Ads · Datos no compartidos
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 num text-[10px] text-text-tertiary tracking-[0.2em] uppercase">
          v0.1 · Air Europa MCC
        </p>
      </div>
    </main>
  )
}
