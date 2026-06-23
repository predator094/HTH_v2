export interface FileMetadataIn {
  name: string
  size: number
  mime?: string
}

export interface UploadUrlItem {
  file_id: number
  url: string
  expires_in: number
}

export interface InitUploadResponse {
  share_id: string
  delete_token: string
  upload_urls: UploadUrlItem[]
}

export interface TextShareResponse {
  share_id: string
  delete_token: string
  url: string
  expires_at: string
}

export interface ConfirmUploadResponse {
  share_id: string
  url: string
  expires_at: string
}

export interface FileMetaOut {
  file_id: number
  name: string
  size: number
  mime?: string
}

export interface ShareMeta {
  type: 'files' | 'text'
  expires_at: string
  requires_passcode: boolean
  one_time: boolean
  files: FileMetaOut[]
}

export interface ShareResult {
  shareId: string
  deleteToken: string
  shareUrl: string
  expiresAt: string
  passcode: string  // auto-generated 6-char code, always present
}

export interface PasscodeLookupResult {
  share_id: string
  share_url: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const resp = await fetch(url, options)
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: resp.statusText }))
    const msg =
      typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    throw new ApiError(resp.status, msg, body.detail)
  }
  return resp
}

// ── upload helpers ────────────────────────────────────────────────────────────

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 upload failed: ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.send(file)
  })
}

// ── passcode ──────────────────────────────────────────────────────────────────

// Unambiguous alphanumeric chars (no 0/O, 1/I/L)
const _PC_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePasscode(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => _PC_CHARS[b % _PC_CHARS.length]).join('')
}

// ── public API ────────────────────────────────────────────────────────────────

export async function uploadShare(
  files: File[],
  opts: { expiresIn: number; oneTime: boolean },
  onProgress: (fileIndex: number, fraction: number) => void,
): Promise<ShareResult> {
  const passcode = generatePasscode()

  const initResp = await apiFetch('/api/shares/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'files',
      file_metadata: files.map((f) => ({
        name: f.name,
        size: f.size,
        mime: f.type || undefined,
      })),
      expires_in: opts.expiresIn,
      passcode,
      one_time: opts.oneTime,
    }),
  })
  const init: InitUploadResponse = await initResp.json()

  await Promise.all(
    init.upload_urls.map((item, idx) =>
      uploadWithProgress(item.url, files[idx], (p) => onProgress(idx, p)),
    ),
  )

  const confirmResp = await apiFetch(`/api/shares/${init.share_id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_ids: init.upload_urls.map((u) => u.file_id) }),
  })
  const confirm: ConfirmUploadResponse = await confirmResp.json()

  return {
    shareId: init.share_id,
    deleteToken: init.delete_token,
    shareUrl: confirm.url,
    expiresAt: confirm.expires_at,
    passcode,
  }
}

export async function createTextShare(
  content: string,
  opts: { expiresIn: number; oneTime: boolean },
): Promise<ShareResult> {
  const passcode = generatePasscode()

  const resp = await apiFetch('/api/shares/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      expires_in: opts.expiresIn,
      passcode,
      one_time: opts.oneTime,
    }),
  })
  const data: TextShareResponse = await resp.json()
  return {
    shareId: data.share_id,
    deleteToken: data.delete_token,
    shareUrl: data.url,
    expiresAt: data.expires_at,
    passcode,
  }
}

export async function lookupShareByPasscode(code: string): Promise<PasscodeLookupResult> {
  const resp = await apiFetch(`/api/shares/by-passcode/${encodeURIComponent(code.trim().toUpperCase())}`)
  return resp.json()
}

export async function getShareMeta(
  shareId: string,
  passcode?: string,
): Promise<ShareMeta> {
  const headers: Record<string, string> = {}
  if (passcode) headers['X-Passcode'] = passcode
  const resp = await apiFetch(`/api/shares/${shareId}`, { headers })
  return resp.json()
}

export async function getDownloadUrl(
  shareId: string,
  fileId: number,
  passcode?: string,
): Promise<string> {
  const headers: Record<string, string> = {}
  if (passcode) headers['X-Passcode'] = passcode
  const resp = await apiFetch(`/api/shares/${shareId}/files/${fileId}/download-url`, { headers })
  const data: { url: string } = await resp.json()
  return data.url
}

export async function getTextContent(
  shareId: string,
  passcode?: string,
): Promise<string> {
  const headers: Record<string, string> = {}
  if (passcode) headers['X-Passcode'] = passcode
  const resp = await apiFetch(`/api/shares/${shareId}/text`, { headers })
  const data: { content: string } = await resp.json()
  return data.content
}

export async function deleteShare(shareId: string, deleteToken: string): Promise<void> {
  await apiFetch(`/api/shares/${shareId}`, {
    method: 'DELETE',
    headers: { 'X-Delete-Token': deleteToken },
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatExpiry(isoDate: string): string {
  return new Date(isoDate).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
