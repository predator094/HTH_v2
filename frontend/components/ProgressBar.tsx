'use client'

import { formatBytes } from '@/lib/api'

interface FileProgress {
  name: string
  size: number
  fraction: number // 0-1
}

interface Props {
  files: FileProgress[]
}

export default function ProgressBar({ files }: Props) {
  return (
    <div className="space-y-3">
      {files.map((f, i) => (
        <div key={i}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-zinc-300 truncate max-w-xs">{f.name}</span>
            <span className="text-zinc-500 ml-2 shrink-0">
              {f.fraction < 1
                ? `${Math.round(f.fraction * 100)}%`
                : formatBytes(f.size)}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-150"
              style={{ width: `${Math.round(f.fraction * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
