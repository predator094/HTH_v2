'use client'

import { useState, useEffect } from 'react'

const SITE_PASSCODE = process.env.NEXT_PUBLIC_SITE_PASSCODE

export default function SiteGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // If no passcode configured, skip the gate entirely
  if (!SITE_PASSCODE) return <>{children}</>

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim() || loading) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 300)) // brief delay to prevent instant brute-force
    if (value.trim() === SITE_PASSCODE) {
      setUnlocked(true)
    } else {
      setError('Wrong passcode.')
      setValue('')
    }
    setLoading(false)
  }

  if (unlocked) return <>{children}</>

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#09090b',
      padding: '1rem',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🤝</div>
          <h1 style={{ color: '#f4f4f5', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
            H2H — Hand to Hand
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Enter the passcode to continue
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <input
              type="password"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError('') }}
              placeholder="Passcode"
              autoFocus
              style={{
                background: '#09090b',
                border: `1px solid ${error ? '#f87171' : '#3f3f46'}`,
                borderRadius: '0.375rem',
                padding: '0.625rem 0.75rem',
                color: '#f4f4f5',
                fontSize: '1rem',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !value.trim()}
              style={{
                background: loading || !value.trim() ? '#3f3f46' : '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.625rem',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: loading || !value.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Checking…' : 'Enter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
