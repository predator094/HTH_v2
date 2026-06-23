'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import {
  getShareMeta, getDownloadUrl, getTextContent,
  ApiError, formatBytes, formatExpiry,
  type ShareMeta, type FileMetaOut,
} from '@/lib/api'

const S = (o: Record<string, unknown>) => o as React.CSSProperties

type State =
  | { kind: 'loading' }
  | { kind: 'passcode'; error?: string; lockedUntil?: string }
  | { kind: 'ready'; meta: ShareMeta; passcode?: string }
  | { kind: 'text_loading'; meta: ShareMeta; passcode?: string }
  | { kind: 'text'; meta: ShareMeta; content: string }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }

export default function RetrievePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params)
  const [state,           setState]           = useState<State>({ kind: 'loading' })
  const [downloadingId,   setDownloadingId]   = useState<number | null>(null)
  const [downloadPct,     setDownloadPct]     = useState(0)
  const [copied,          setCopied]          = useState(false)
  const [passInput,       setPassInput]       = useState('')

  async function fetchMeta(passcode?: string) {
    try {
      const meta = await getShareMeta(shareId, passcode)
      if (meta.type === 'text') {
        setState({ kind: 'text_loading', meta, passcode })
        const content = await getTextContent(shareId, passcode)
        setState({ kind: 'text', meta, content })
      } else {
        setState({ kind: 'ready', meta, passcode })
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) {
          setState({ kind: 'passcode', error: passcode ? 'Wrong passcode — try again?' : undefined })
          return
        }
        if (err.status === 423) {
          const d = err.detail as { locked_until?: string }
          setState({ kind: 'passcode', lockedUntil: d?.locked_until })
          return
        }
        if (err.status === 404) { setState({ kind: 'not_found' }); return }
      }
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  useEffect(() => {
    const stored = sessionStorage.getItem(`h2h_code_${shareId}`)
    if (stored) {
      sessionStorage.removeItem(`h2h_code_${shareId}`)
      setPassInput(stored)
      fetchMeta(stored)
    } else {
      fetchMeta()
    }
  }, [shareId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDownload(file: FileMetaOut, passcode?: string) {
    setDownloadingId(file.file_id)
    setDownloadPct(0)
    try {
      const url = await getDownloadUrl(shareId, file.file_id, passcode)
      const resp = await fetch(url)
      const total = Number(resp.headers.get('content-length') || 0)
      const reader = resp.body!.getReader()
      const chunks: BlobPart[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (total) setDownloadPct(Math.round(received / total * 100))
      }
      const blob = new Blob(chunks)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file.name
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setDownloadingId(null)
      setDownloadPct(0)
    }
  }

  async function handleCopy(content: string) {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function submitPass() {
    if (!passInput.trim()) return
    fetchMeta(passInput)
  }

  // ── shared page shell ──────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={S({
      position:'relative', minHeight:'100vh', width:'100%', overflow:'hidden',
      background:'radial-gradient(120% 90% at 78% 8%, #f7efdd 0%, #e7d9bd 100%)',
      fontFamily:"'Nunito',sans-serif", color:'#4a4133',
    })}>
      <div aria-hidden="true" style={{position:'absolute',inset:0,zIndex:0,pointerEvents:'none',overflow:'hidden'}}>
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
          <polygon points="0,560 240,470 480,545 760,455 1040,545 1280,480 1440,540 1440,900 0,900" fill="#cdd0a0" opacity="0.85"/>
          <polygon points="0,690 280,615 540,680 840,605 1110,675 1330,625 1440,665 1440,900 0,900" fill="#aebb83" opacity="0.92"/>
          <polygon points="0,808 300,748 600,806 900,756 1200,804 1440,766 1440,900 0,900" fill="#8a9c62"/>
          <ellipse cx="120"  cy="912" rx="180" ry="120" fill="#7d8e5b" opacity="0.9"/>
          <ellipse cx="430"  cy="932" rx="220" ry="120" fill="#7d8e5b" opacity="0.8"/>
          <ellipse cx="900"  cy="932" rx="240" ry="120" fill="#7d8e5b" opacity="0.82"/>
          <ellipse cx="1320" cy="914" rx="210" ry="120" fill="#7d8e5b" opacity="0.9"/>
        </svg>
      </div>
      <div style={{position:'absolute',right:'12%',top:'-12%',width:'150px',height:'120vh',background:'linear-gradient(to bottom,rgba(247,224,170,.16),rgba(247,224,170,0))',transform:'rotate(16deg)',transformOrigin:'top center',filter:'blur(3px)',pointerEvents:'none',zIndex:0}}/>

      <header style={{position:'relative',zIndex:3,display:'flex',alignItems:'center',gap:'11px',padding:'22px 30px'}}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:'11px',textDecoration:'none'}}>
          <div style={{width:'34px',height:'34px',borderRadius:'11px',background:'linear-gradient(150deg,#d98f54,#b96f4c)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(185,111,76,.3)'}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 14c3-1 5-1 8 0M20 14c-3-1-5-1-8 0" stroke="#fdf8ee" strokeWidth="2.4" strokeLinecap="round"/>
              <circle cx="6.5" cy="11.5" r="1.4" fill="#fdf8ee"/>
              <circle cx="17.5" cy="11.5" r="1.4" fill="#fdf8ee"/>
            </svg>
          </div>
          <div>
            <div style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'19px',letterSpacing:'.3px',lineHeight:1,color:'#4a4133'}}>H2H</div>
            <div style={{fontSize:'11.5px',letterSpacing:'1.2px',textTransform:'uppercase',color:'#8a7d66',marginTop:'2px'}}>hand to hand</div>
          </div>
        </a>
      </header>

      <main style={{position:'relative',zIndex:3,display:'flex',justifyContent:'center',alignItems:'center',minHeight:'calc(100vh - 92px)',padding:'0 20px 64px'}}>
        <section style={{width:'min(480px, 92vw)'}}>
          <div style={{background:'#fdf8ee',borderRadius:'26px',boxShadow:'0 18px 50px -18px rgba(74,65,51,.32),0 2px 0 rgba(255,255,255,.6) inset',border:'1px solid rgba(74,65,51,.12)',overflow:'hidden'}}>
            {children}
          </div>
        </section>
      </main>
    </div>
  )

  // ── states ────────────────────────────────────────────────────────────────
  if (state.kind === 'loading' || state.kind === 'text_loading') {
    return (
      <Shell>
        <div style={{padding:'48px 30px',textAlign:'center'}}>
          <div style={{width:'32px',height:'32px',borderRadius:'50%',border:'3px solid rgba(122,139,90,.3)',borderTopColor:'#7a8b5a',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{fontFamily:"'Fredoka',sans-serif",fontSize:'16px',color:'#8a7d66'}}>Kit is fetching your delivery…</p>
        </div>
      </Shell>
    )
  }

  if (state.kind === 'not_found') {
    return (
      <Shell>
        <div style={{padding:'36px 30px',textAlign:'center'}}>
          <h1 style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'23px',margin:'0 0 8px',color:'#4a4133'}}>The trail&apos;s gone cold.</h1>
          <p style={{margin:'0 auto 22px',maxWidth:'300px',fontSize:'14.5px',color:'#8a7d66',lineHeight:1.55}}>Kit looked everywhere, but this delivery has already faded — or was never here.</p>
          <a href="/" style={S({display:'inline-block',border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'15px',color:'#fff',background:'linear-gradient(150deg,#d98f54,#b96f4c)',borderRadius:'14px',padding:'13px 26px',boxShadow:'0 8px 18px -6px rgba(185,111,76,.5)',textDecoration:'none'})}>
            Send something new
          </a>
        </div>
      </Shell>
    )
  }

  if (state.kind === 'error') {
    return (
      <Shell>
        <div style={{padding:'30px'}}>
          <p style={{color:'#b96f4c',fontSize:'14px'}}>{state.message}</p>
          <a href="/" style={{color:'#7a8b5a',fontSize:'13px'}}>← Go home</a>
        </div>
      </Shell>
    )
  }

  if (state.kind === 'passcode') {
    return (
      <Shell>
        <div style={{animation:'h2h-viewin .5s ease both'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'13px 18px',background:'rgba(122,139,90,.1)',borderBottom:'1px solid rgba(74,65,51,.12)'}}>
            <span style={{width:'9px',height:'9px',borderRadius:'50%',background:'#caa86a',display:'inline-block'}}/>
            <span style={{fontSize:'12.5px',color:'#8a7d66',fontWeight:600,letterSpacing:'.3px'}}>Locked delivery</span>
          </div>
          <div style={{padding:'30px'}}>
            <h1 style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'23px',margin:'0 0 4px',color:'#4a4133'}}>Kit&apos;s holding it close.</h1>
            <p style={{margin:'0 0 20px',fontSize:'14px',color:'#8a7d66',lineHeight:1.5}}>This delivery is locked. What&apos;s the passcode?</p>
            <input
              value={passInput}
              onChange={e => setPassInput(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,''))}
              onKeyDown={e => e.key==='Enter' && submitPass()}
              placeholder="ABC123"
              maxLength={6}
              style={S({width:'100%',border:`1.5px solid ${state.error ? 'rgba(185,111,76,.55)' : 'rgba(91,107,140,.3)'}`,borderRadius:'14px',background:'rgba(255,255,255,.55)',padding:'13px 15px',fontFamily:"'Fredoka',sans-serif",fontSize:'22px',fontWeight:600,color:'#4a4133',outline:'none',letterSpacing:'5px',textAlign:'center',textTransform:'uppercase',boxSizing:'border-box'})}
            />
            {state.error && (
              <div style={{display:'flex',alignItems:'center',gap:'7px',marginTop:'10px',fontSize:'13px',color:'#b96f4c'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#b96f4c" strokeWidth="2"/><path d="M8 14c1-1 2-1.4 4-1.4S15 13 16 14" stroke="#b96f4c" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="10" r="1" fill="#b96f4c"/><circle cx="15" cy="10" r="1" fill="#b96f4c"/></svg>
                {state.error}
              </div>
            )}
            {state.lockedUntil && (
              <p style={{marginTop:'10px',fontSize:'13px',color:'#b96f4c'}}>Too many attempts. Try again after {formatExpiry(state.lockedUntil)}.</p>
            )}
            <button onClick={submitPass}
              style={S({width:'100%',marginTop:'18px',border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'15.5px',color:'#fff',background:'linear-gradient(150deg,#7a8b5a,#5e7045)',borderRadius:'14px',padding:'14px',boxShadow:'0 8px 18px -6px rgba(94,112,69,.5)'})}>
              Unlock
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  const meta     = state.kind === 'text' ? state.meta : (state as { meta: ShareMeta }).meta
  const passcode = state.kind === 'ready' ? state.passcode : undefined
  const label    = meta.type === 'files'
    ? `${meta.files.length} file${meta.files.length !== 1 ? 's' : ''} delivered`
    : 'Note delivered'

  return (
    <Shell>
      <div style={{animation:'h2h-viewin .5s ease both'}}>
        {/* status bar — no share ID, show type instead */}
        <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'13px 18px',background:'rgba(122,139,90,.1)',borderBottom:'1px solid rgba(74,65,51,.12)'}}>
          <span style={{width:'9px',height:'9px',borderRadius:'50%',background:'#7a8b5a',display:'inline-block'}}/>
          <span style={{fontSize:'12.5px',color:'#8a7d66',fontWeight:600,letterSpacing:'.3px'}}>{label}</span>
        </div>

        <div style={{padding:'28px 30px 30px'}}>
          <h1 style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'24px',margin:'0 0 4px',color:'#4a4133'}}>Kit brought you something.</h1>
          <p style={{margin:'0 0 18px',fontSize:'14px',color:'#8a7d66',lineHeight:1.5}}>
            {meta.type === 'files' ? "It carried these the whole way over. Take them when you're ready." : "A note, delivered. It's yours to keep."}
          </p>
          {meta.one_time && (
            <div style={{display:'inline-flex',alignItems:'center',gap:'6px',background:'rgba(217,143,84,.14)',color:'#b96f4c',fontSize:'12px',fontWeight:700,padding:'5px 10px',borderRadius:'20px',marginBottom:'14px',letterSpacing:'.3px'}}>
              ⚡ One-time — burns after access
            </div>
          )}

          {/* Files */}
          {state.kind === 'ready' && meta.type === 'files' && meta.files.map(f => (
            <div key={f.file_id}>
              <div style={{display:'flex',alignItems:'center',gap:'11px',background:'rgba(202,168,106,.12)',borderRadius:'13px',padding:'11px 13px',marginBottom:'9px'}}>
                <div style={{width:'34px',height:'34px',borderRadius:'9px',background:'rgba(217,143,84,.18)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 3v5h5" stroke="#b96f4c" strokeWidth="2" strokeLinejoin="round"/><path d="M14 3H6v18h12V8l-4-5z" stroke="#b96f4c" strokeWidth="2" strokeLinejoin="round"/></svg>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'14px',fontWeight:600,color:'#4a4133',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.name}</div>
                  <div style={{fontSize:'12px',color:'#8a7d66'}}>{formatBytes(f.size)}</div>
                </div>
                <button onClick={() => handleDownload(f, passcode)} disabled={downloadingId === f.file_id}
                  style={S({flexShrink:0,border:'none',cursor:downloadingId===f.file_id?'default':'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'14px',color:'#fff',background:'linear-gradient(150deg,#7a8b5a,#5e7045)',borderRadius:'11px',padding:'9px 16px',opacity:downloadingId===f.file_id?.6:1,transition:'opacity .2s'})}>
                  {downloadingId === f.file_id ? `${downloadPct}%` : 'Download'}
                </button>
              </div>
              {/* progress bar */}
              {downloadingId === f.file_id && (
                <div style={{height:'6px',borderRadius:'6px',background:'rgba(122,139,90,.16)',overflow:'hidden',marginTop:'-5px',marginBottom:'9px'}}>
                  <div style={{height:'100%',width:`${downloadPct}%`,borderRadius:'6px',background:'linear-gradient(90deg,#7a8b5a,#5e7045)',transition:'width .15s ease'}}/>
                </div>
              )}
            </div>
          ))}

          {/* Text */}
          {state.kind === 'text' && (
            <>
              <div className="h2h-scroll" style={{maxHeight:'180px',overflow:'auto',background:'rgba(255,255,255,.55)',border:'1.5px solid rgba(74,65,51,.12)',borderRadius:'14px',padding:'15px 16px',fontSize:'14.5px',lineHeight:1.6,color:'#4a4133',whiteSpace:'pre-wrap'}}>
                {state.content}
              </div>
              <button onClick={() => handleCopy(state.content)}
                style={S({width:'100%',marginTop:'16px',border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'15.5px',color:'#fff',background:'linear-gradient(150deg,#7a8b5a,#5e7045)',borderRadius:'14px',padding:'14px',boxShadow:'0 9px 20px -7px rgba(94,112,69,.5)'})}>
                {copied ? 'Copied to clipboard ✓' : 'Copy the note'}
              </button>
            </>
          )}

          <a href="/" style={{display:'block',marginTop:'20px',fontSize:'13px',color:'#8a7d66',textDecoration:'none'}}>← Send something new</a>
        </div>
      </div>
    </Shell>
  )
}
