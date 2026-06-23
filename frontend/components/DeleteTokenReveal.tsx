'use client'

import { useState } from 'react'

interface Props {
  token: string
  shareUrl: string
  expiresAt: string
  onDismiss: () => void
}

export default function DeleteTokenReveal({ token, shareUrl, expiresAt, onDismiss }: Props) {
  const [tokenCopied, setTokenCopied] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const copy = async (text: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Share URL */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
        <p className="text-sm text-zinc-400">Share this link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm text-indigo-300 bg-zinc-950 rounded px-3 py-2 break-all">
            {shareUrl}
          </code>
          <button
            onClick={() => copy(shareUrl, setUrlCopied)}
            className="shrink-0 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
          >
            {urlCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-zinc-600">
          Expires {new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>

      {/* Delete token — critical warning */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-amber-400 text-lg leading-none">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-300">Save your delete token now</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              This is shown only once and cannot be recovered. You need it to delete the share early.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-amber-200 bg-zinc-950 rounded px-3 py-2 break-all font-mono">
            {token}
          </code>
          <button
            onClick={() => copy(token, setTokenCopied)}
            className="shrink-0 px-3 py-2 text-sm bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-md transition-colors"
          >
            {tokenCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-indigo-500"
          />
          <span className="text-sm text-zinc-300">I have saved the delete token</span>
        </label>
      </div>

      <button
        disabled={!confirmed}
        onClick={onDismiss}
        className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
      >
        Done — share another
      </button>
    </div>
  )
}
