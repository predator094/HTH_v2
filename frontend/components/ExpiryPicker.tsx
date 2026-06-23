'use client'

const PRESETS = [
  { label: '1 hour', seconds: 3_600 },
  { label: '12 hours', seconds: 43_200 },
  { label: '24 hours', seconds: 86_400 },
  { label: '7 days', seconds: 604_800 },
  { label: '30 days', seconds: 2_592_000 },
]

interface Props {
  value: number
  onChange: (seconds: number) => void
}

export default function ExpiryPicker({ value, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-1.5">Expires in</label>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.seconds}
            type="button"
            onClick={() => onChange(p.seconds)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              value === p.seconds
                ? 'bg-indigo-500 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
