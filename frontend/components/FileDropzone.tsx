'use client'

import { useCallback, useRef, useState } from 'react'
import { formatBytes } from '@/lib/api'

interface Props {
  files: File[]
  onChange: (files: File[]) => void
}

export default function FileDropzone({ files, onChange }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return
      const merged = [...files]
      for (const f of Array.from(incoming)) {
        if (!merged.some((x) => x.name === f.name && x.size === f.size)) {
          merged.push(f)
        }
      }
      onChange(merged)
    },
    [files, onChange],
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-indigo-400 bg-indigo-500/10'
            : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900'
        }`}
      >
        <p className="text-zinc-400">
          Drop files here or{' '}
          <span className="text-indigo-400 underline underline-offset-2">browse</span>
        </p>
        <p className="text-xs text-zinc-600 mt-1">Max 100 MB total</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {files.length > 0 && (
        <ul className="mt-3 space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm"
            >
              <span className="text-zinc-200 truncate max-w-xs">{f.name}</span>
              <span className="flex items-center gap-3 ml-2 shrink-0">
                <span className="text-zinc-500">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
