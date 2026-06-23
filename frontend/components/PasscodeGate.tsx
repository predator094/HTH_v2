'use client'

import { useState } from 'react'

interface Props {
  onSubmit: (passcode: string) => Promise<void>
  error?: string
  lockedUntil?: string
}

export default function PasscodeGate({ onSubmit, error, lockedUntil }: Props) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim() || loading) return
    setLoading(true)
    try {
      await onSubmit(value.trim())
    } finally {
      setLoading(false)
    }
  }

  if (lockedUntil) {
    const until = new Date(lockedUntil).toLocaleTimeString()
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center space-y-2">
        <p className="text-red-400 font-semibold">Share locked</p>
        <p className="text-sm text-zinc-400">
          Too many wrong attempts. Try again after <span className="text-zinc-200">{until}</span>.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
        <p className="text-sm text-zinc-400">This share is protected. Enter the passcode to continue.</p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Passcode"
          autoFocus
          className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-md transition-colors"
        >
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </form>
  )
}
