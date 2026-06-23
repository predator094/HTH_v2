'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  uploadShare, createTextShare, lookupShareByPasscode,
  getShareMeta, getDownloadUrl, getTextContent,
  deleteShare,
  ApiError, formatBytes,
  type ShareResult, type ShareMeta, type FileMetaOut,
} from '@/lib/api'

// ── types ─────────────────────────────────────────────────────────────────────
type View    = 'upload' | 'success' | 'received'
type Mode    = 'send'   | 'receive'
type Tab     = 'files'  | 'text'
type Mascot  = 'idle' | 'ready' | 'carrying' | 'success' | 'arrived' | 'sleepy' | 'eating' | 'stretch' | 'lookaround' | 'questioning' | 'wrong' | 'handoff' | 'sad'
type Theme   = 'day' | 'dusk' | 'night'
type Expiry  = '1h' | '1d' | '7d'
interface FI { file: File; name: string; sz: string }

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtSz = (b: number) =>
  b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB'

// DOM animation helpers (bypass React for perf)
const sa = (el: Element | null, a: string) => { if (el) (el as HTMLElement).style.animation  = a || 'none' }
const st = (el: Element | null, t: string) => { if (el) (el as HTMLElement).style.transform  = t || 'none' }
const so = (el: Element | null, o: number) => { if (el) (el as HTMLElement).style.opacity    = String(o) }

// Cast arbitrary object to React.CSSProperties (for CSS vars + calc() strings)
const S = (o: Record<string, unknown>) => o as React.CSSProperties

const THEMES: Record<Theme, Record<string, string>> = {
  day:   {'--bg1':'#f7efdd','--bg2':'#e7d9bd','--parch':'#fdf8ee','--ink':'#4a4133','--soft':'#8a7d66','--line':'rgba(74,65,51,.12)','--hill1':'#cdd0a0','--hill2':'#aebb83','--hill3':'#8a9c62','--tree':'#6f8350','--tree2':'#5b6f43','--foliage':'#7d8e5b','--sun':'rgba(247,224,170,.7)','--rock1':'#c9b79a','--rock2':'#ad9a7c','--rock3':'#8b7960','--mist':'rgba(253,248,238,.6)','--t-day':'1','--t-dusk':'0','--t-night':'0','--sundisc':'#ffe2a0','--mtn':'#d9d7bb'},
  dusk:  {'--bg1':'#f6d9b4','--bg2':'#d99a6a','--parch':'#fbf1e0','--ink':'#4a382c','--soft':'#9b7c5d','--line':'rgba(74,56,44,.14)','--hill1':'#ecc89a','--hill2':'#d9a673','--hill3':'#bd8155','--tree':'#9c6f49','--tree2':'#7e5838','--foliage':'#b07e52','--sun':'rgba(255,212,150,.78)','--rock1':'#cda980','--rock2':'#b58e66','--rock3':'#946f4d','--mist':'rgba(251,241,224,.5)','--t-day':'0','--t-dusk':'1','--t-night':'0','--sundisc':'#ff9a52','--mtn':'#e7c29c'},
  night: {'--bg1':'#2c3050','--bg2':'#1d2036','--parch':'#363c58','--ink':'#efe7d4','--soft':'#a9afc9','--line':'rgba(239,231,212,.13)','--hill1':'#3b4168','--hill2':'#2f3557','--hill3':'#262b49','--tree':'#222848','--tree2':'#1a1f37','--foliage':'#2a3053','--sun':'rgba(150,170,220,.5)','--rock1':'#454a6e','--rock2':'#373b5a','--rock3':'#2a2d47','--mist':'rgba(54,60,88,.45)','--t-day':'0','--t-dusk':'0','--t-night':'1','--sundisc':'#ffd98a','--mtn':'#333a5e'},
}
const EXPIRY: Record<Expiry, number> = { '1h': 3600, '1d': 86400, '7d': 604800 }
const CAPTIONS: Record<Mascot, string> = {
  idle:'Kit watches you · give it a pet', ready:'Kit perks up — ready!',
  carrying:'Kit is running it over', success:'Delivered with a little hop',
  arrived:'Kit arrived, guarding the bundle', questioning:'Kit tilts its head…',
  wrong:'a gentle no', handoff:'handing it over',
  sad:"Kit searches, but it's gone", sleepy:'Kit dozes off… zzz',
  eating:'Kit found a little berry', stretch:'Kit has a big stretch',
  lookaround:'Kit looks around the valley',
}

// ── component ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [view,        setView]        = useState<View>('upload')
  const [mode,        setMode]        = useState<Mode>('send')
  const [tab,         setTab]         = useState<Tab>('files')
  const [mascot,      setMascot]      = useState<Mascot>('idle')
  const [theme,       setTheme]       = useState<Theme>('day')
  const [spirit,      setSpirit]      = useState(false)
  const [files,       setFiles]       = useState<FI[]>([])
  const [text,        setText]        = useState('')
  const [expiry,      setExpiry]      = useState<Expiry>('1d')
  const [sending,     setSending]     = useState(false)
  const [pct,         setPct]         = useState(0)
  const [drag,        setDrag]        = useState(false)
  const [result,      setResult]      = useState<ShareResult | null>(null)
  const [copied,      setCopied]      = useState<'link'|'code'|'token'|''>('')
  const [error,       setError]       = useState('')
  // receive mode — code entry
  const [entryCode,   setEntryCode]   = useState('')
  const [entryErr,    setEntryErr]    = useState('')
  const [entryBusy,   setEntryBusy]   = useState(false)
  // receive mode — fetched share
  const [rxMeta,      setRxMeta]      = useState<ShareMeta | null>(null)
  const [rxContent,   setRxContent]   = useState<string | null>(null)
  const [rxPasscode,  setRxPasscode]  = useState('')
  const [rxShareId,   setRxShareId]   = useState('')
  const [rxDlId,      setRxDlId]      = useState<number | null>(null)
  const [rxDlPct,     setRxDlPct]     = useState(0)
  const [rxCopied,    setRxCopied]    = useState(false)
  // receive sub-tab
  const [rxTab,       setRxTab]       = useState<'collect' | 'revoke'>('collect')
  // revoke form
  const [revokeUrl,   setRevokeUrl]   = useState('')
  const [revokeToken, setRevokeToken] = useState('')
  const [revokeErr,   setRevokeErr]   = useState('')
  const [revokeBusy,  setRevokeBusy]  = useState(false)
  const [revokeOk,    setRevokeOk]    = useState(false)

  // SVG / DOM refs
  const rootRef           = useRef<HTMLDivElement>(null)
  const foxFloatRef       = useRef<SVGGElement>(null)
  const foxStateRef       = useRef<SVGGElement>(null)
  const foxTailRef        = useRef<SVGGElement>(null)
  const foxBodyRef        = useRef<SVGGElement>(null)
  const foxHeadRef        = useRef<SVGGElement>(null)
  const foxEarLRef        = useRef<SVGGElement>(null)
  const foxEarRRef        = useRef<SVGGElement>(null)
  const foxEyesRef        = useRef<SVGGElement>(null)
  const foxOrbWrapRef     = useRef<SVGGElement>(null)
  const foxOrbRef         = useRef<SVGGElement>(null)
  const foxSparkleRef     = useRef<SVGGElement>(null)
  const foxZzzRef         = useRef<SVGGElement>(null)
  const foxFoodRef        = useRef<SVGGElement>(null)
  const foxGlowEyesRef    = useRef<SVGGElement>(null)
  const foxGlowTailRef    = useRef<SVGGElement>(null)
  const foxGlowBodyRef    = useRef<SVGGElement>(null)
  const foxGlowPartsRef   = useRef<SVGGElement>(null)
  const foxFireRef        = useRef<SVGGElement>(null)
  const foxGazeRef        = useRef<SVGGElement>(null)
  const fileInputRef      = useRef<HTMLInputElement>(null)
  const progressBarRef    = useRef<HTMLDivElement>(null)

  // Internal refs (avoid stale closures)
  const mascotRef  = useRef<Mascot>('idle')
  const viewRef    = useRef<View>('upload')
  const ptrRef     = useRef({ x: 0, y: 0, has: false })
  const calmRef    = useRef(true)
  const headBRef   = useRef('none')
  const rafRef     = useRef<number | null>(null)
  const idleTRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revertTRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const petTRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cpTRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { mascotRef.current = mascot }, [mascot])
  useEffect(() => { viewRef.current   = view   }, [view])

  // ── animation ────────────────────────────────────────────────────────────────
  const applyMascot = useCallback((s: Mascot) => {
    const earsF = () => {
      sa(foxEarLRef.current,'none'); st(foxEarLRef.current,'rotate(-9deg) translateY(-1px)')
      sa(foxEarRRef.current,'none'); st(foxEarRRef.current,'rotate(9deg) translateY(-1px)')
    }
    const showOrb = () => { so(foxOrbWrapRef.current,1); sa(foxOrbRef.current,'h2h-orbfloat 2.4s ease-in-out infinite') }

    calmRef.current = s==='idle'||s==='ready'||s==='arrived'
    headBRef.current = 'none'
    // reset to idle defaults
    sa(foxFloatRef.current,  'h2h-floatsoft 5s ease-in-out infinite')
    sa(foxEyesRef.current,   'h2h-blink 5.5s ease-in-out infinite')
    sa(foxEarLRef.current,   'h2h-ear 6s ease-in-out infinite');   st(foxEarLRef.current,'none')
    sa(foxEarRRef.current,   'h2h-ear 6.7s ease-in-out infinite'); st(foxEarRRef.current,'none')
    sa(foxBodyRef.current,   'h2h-breathe 4.2s ease-in-out infinite')
    sa(foxTailRef.current,   'h2h-tail 3.4s ease-in-out infinite')
    sa(foxHeadRef.current,   'none'); st(foxHeadRef.current,'none')
    sa(foxStateRef.current,  'none'); st(foxStateRef.current,'none')
    sa(foxOrbRef.current,    'none')
    so(foxOrbWrapRef.current, 0); so(foxSparkleRef.current, 0)
    so(foxZzzRef.current,     0); so(foxFoodRef.current,    0)
    st(foxEyesRef.current, 'none')

    switch (s) {
      case 'ready':
        earsF(); headBRef.current='translateY(-3px)'; st(foxHeadRef.current,'translateY(-3px)')
        sa(foxTailRef.current,'h2h-tailfast 1.3s ease-in-out infinite'); break
      case 'carrying':
        earsF(); sa(foxStateRef.current,'h2h-trot .5s ease-in-out infinite')
        sa(foxBodyRef.current,'h2h-breathe 1.1s ease-in-out infinite')
        sa(foxTailRef.current,'h2h-tailfast .55s ease-in-out infinite'); showOrb(); break
      case 'success':
        sa(foxStateRef.current,'h2h-hop 1.1s ease-in-out 2')
        sa(foxTailRef.current,'h2h-spin 1.1s ease-in-out 2')
        so(foxSparkleRef.current,1); break
      case 'arrived': earsF(); showOrb(); break
      case 'sleepy':
        so(foxZzzRef.current,1)
        sa(foxEyesRef.current,'none'); st(foxEyesRef.current,'scaleY(0.14) translateY(3px)')
        sa(foxHeadRef.current,'h2h-doze 3.2s ease-in-out infinite')
        sa(foxBodyRef.current,'h2h-breathe 5.6s ease-in-out infinite')
        sa(foxTailRef.current,'h2h-tail 6s ease-in-out infinite')
        sa(foxEarLRef.current,'none'); st(foxEarLRef.current,'rotate(16deg)')
        sa(foxEarRRef.current,'none'); st(foxEarRRef.current,'rotate(-16deg)')
        sa(foxFloatRef.current,'h2h-floatsoft 6.5s ease-in-out infinite'); break
      case 'eating':
        so(foxFoodRef.current,1); earsF()
        sa(foxHeadRef.current,'h2h-nibble .65s ease-in-out infinite')
        sa(foxTailRef.current,'h2h-tail 2.4s ease-in-out infinite'); break
      case 'stretch':
        sa(foxStateRef.current,'h2h-stretch 2.6s ease-in-out 1')
        sa(foxTailRef.current,'h2h-tailfast 1.1s ease-in-out infinite'); earsF(); break
      case 'lookaround':
        sa(foxHeadRef.current,'h2h-lookaround 3s ease-in-out 1')
        sa(foxEarLRef.current,'h2h-ear 1.4s ease-in-out infinite')
        sa(foxEarRRef.current,'h2h-ear 1.6s ease-in-out infinite'); break
      case 'questioning': sa(foxHeadRef.current,'h2h-tiltosc 3s ease-in-out infinite'); break
      case 'wrong': sa(foxHeadRef.current,'h2h-shake .5s ease-in-out 2'); break
      case 'handoff':
        earsF(); so(foxOrbWrapRef.current,1)
        sa(foxOrbRef.current,'h2h-handoff 1s ease-in forwards'); break
      case 'sad':
        sa(foxStateRef.current,'h2h-sad 4.5s ease-in-out infinite')
        st(foxHeadRef.current,'translateY(5px) rotate(-3deg)')
        sa(foxEarLRef.current,'none'); st(foxEarLRef.current,'rotate(20deg)')
        sa(foxEarRRef.current,'none'); st(foxEarRRef.current,'rotate(-20deg)')
        sa(foxTailRef.current,'h2h-tail 6s ease-in-out infinite')
        sa(foxBodyRef.current,'h2h-breathe 5.5s ease-in-out infinite'); break
    }
  }, [])

  const applySpirit = useCallback((on: boolean) => {
    const v = on ? '1' : '0'
    ;[foxGlowEyesRef, foxGlowTailRef, foxGlowBodyRef, foxGlowPartsRef, foxFireRef].forEach(r => {
      if (r.current) r.current.style.opacity = v
    })
    if (foxStateRef.current) {
      foxStateRef.current.style.filter = on
        ? 'saturate(.22) brightness(1.32) hue-rotate(8deg) drop-shadow(0 0 9px rgba(140,205,250,.7)) drop-shadow(0 0 24px rgba(175,225,255,.5))'
        : 'none'
    }
  }, [])

  const updateGaze = useCallback(() => {
    const g = foxGazeRef.current; if (!g) return
    if (!calmRef.current || !ptrRef.current.has) { g.style.transform='translate(0px,0px)'; return }
    const fl = foxFloatRef.current; if (!fl) return
    const r = fl.getBoundingClientRect()
    const dx = ptrRef.current.x - (r.left + r.width/2)
    const dy = ptrRef.current.y - (r.top  + r.height*0.4)
    const tx = Math.max(-6, Math.min(6, dx*0.02))
    const ty = Math.max(-4, Math.min(4, dy*0.02))
    g.style.transform = `translate(${tx}px,${ty}px)`
    if (foxHeadRef.current) {
      const rot  = Math.max(-5, Math.min(5, dx*0.013))
      const base = headBRef.current !== 'none' ? headBRef.current + ' ' : ''
      foxHeadRef.current.style.transform = base + `rotate(${rot}deg)`
    }
  }, [])

  const scheduleIdle = useCallback(() => {
    if (idleTRef.current) clearTimeout(idleTRef.current)
    idleTRef.current = setTimeout(() => {
      if (mascotRef.current==='idle' && !document.hidden && viewRef.current==='upload') {
        const opts: Mascot[] = ['sleepy','eating','stretch','lookaround','lookaround']
        const pick = opts[Math.floor(Math.random()*opts.length)]
        const dur: Record<string,number> = {sleepy:5000,eating:4200,stretch:2600,lookaround:3000}
        setMascot(pick)
        if (revertTRef.current) clearTimeout(revertTRef.current)
        revertTRef.current = setTimeout(() => {
          if (mascotRef.current===pick) setMascot('idle')
        }, dur[pick]||3000)
      }
      scheduleIdle()
    }, 7000 + Math.random()*8000)
  }, [])

  // mount
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      ptrRef.current = { x: e.clientX, y: e.clientY, has: true }
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => { rafRef.current=null; updateGaze() })
    }
    window.addEventListener('pointermove', onMove)
    applyMascot('idle')
    applySpirit(false)
    scheduleIdle()
    return () => {
      window.removeEventListener('pointermove', onMove)
      ;[idleTRef, revertTRef, petTRef, cpTRef].forEach(r => { if (r.current) clearTimeout(r.current) })
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [applyMascot, applySpirit, scheduleIdle, updateGaze])

  useEffect(() => { applyMascot(mascot) }, [mascot, applyMascot])
  useEffect(() => { applySpirit(spirit) }, [spirit, applySpirit])

  useEffect(() => {
    const r = rootRef.current; if (!r) return
    for (const [k,v] of Object.entries(THEMES[theme])) r.style.setProperty(k, v)
  }, [theme])

  useEffect(() => {
    if (progressBarRef.current) progressBarRef.current.style.width = pct + '%'
  }, [pct])

  // ── handlers ─────────────────────────────────────────────────────────────────
  const onPet = useCallback(() => {
    const cur = mascotRef.current
    if (cur==='carrying'||cur==='success'||cur==='handoff') return
    if (revertTRef.current) clearTimeout(revertTRef.current)
    const hop = () => {
      const stG = foxStateRef.current
      if (stG) { stG.style.animation='none'; void (stG as unknown as HTMLElement).offsetWidth; stG.style.animation='h2h-hop 0.7s ease-in-out 1' }
      if (foxTailRef.current)    foxTailRef.current.style.animation    = 'h2h-tailfast 0.28s ease-in-out 5'
      if (foxSparkleRef.current) foxSparkleRef.current.style.opacity   = '1'
      if (petTRef.current) clearTimeout(petTRef.current)
      petTRef.current = setTimeout(() => applyMascot(mascotRef.current), 850)
    }
    if (cur!=='idle'&&cur!=='ready'&&cur!=='arrived') { setMascot('idle'); requestAnimationFrame(hop) }
    else hop()
  }, [applyMascot])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const arr = Array.from(list).map(f => ({ file: f, name: f.name, sz: fmtSz(f.size) }))
    if (arr.length) setFiles(prev => [...prev, ...arr])
  }

  const startSend = async () => {
    const canSend = !sending && ((tab==='files'&&files.length>0)||(tab==='text'&&text.trim().length>0))
    if (!canSend) return
    setError(''); setSending(true); setPct(0); setMascot('carrying')
    try {
      let r: ShareResult
      if (tab==='files') {
        r = await uploadShare(
          files.map(f => f.file),
          { expiresIn: EXPIRY[expiry], oneTime: false },
          (_i, frac) => setPct(Math.round(frac*100))
        )
      } else {
        r = await createTextShare(text, { expiresIn: EXPIRY[expiry], oneTime: false })
      }
      setResult(r); setSending(false); setView('success'); setMascot('success')
      setTimeout(() => { if (mascotRef.current==='success') setMascot('idle') }, 2600)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
      setSending(false); setMascot('idle')
    }
  }

  const doCopy = (val: string, which: 'link'|'code'|'token') => {
    try { navigator.clipboard?.writeText(val) } catch {}
    setCopied(which)
    if (cpTRef.current) clearTimeout(cpTRef.current)
    cpTRef.current = setTimeout(() => setCopied(''), 1600)
  }

  const reset = () => {
    setView('upload'); setMode('send'); setTab('files'); setFiles([]); setText(''); setExpiry('1d')
    setSending(false); setPct(0); setResult(null); setError(''); setMascot('idle')
    setEntryCode(''); setEntryErr(''); setEntryBusy(false)
    setRxMeta(null); setRxContent(null); setRxPasscode(''); setRxShareId('')
    setRxTab('collect'); setRevokeUrl(''); setRevokeToken(''); setRevokeErr(''); setRevokeBusy(false); setRevokeOk(false)
  }

  const doLookup = async () => {
    const code = entryCode.trim().toUpperCase()
    if (code.length !== 6) { setEntryErr('Enter your 6-character code.'); return }
    setEntryErr(''); setEntryBusy(true); setMascot('carrying')
    try {
      const { share_id } = await lookupShareByPasscode(code)
      const meta = await getShareMeta(share_id, code)
      setRxMeta(meta); setRxPasscode(code); setRxShareId(share_id)
      if (meta.type === 'text') {
        const content = await getTextContent(share_id, code)
        setRxContent(content)
      }
      setView('received'); setMascot('arrived')
      setTimeout(() => { if (mascotRef.current === 'arrived') setMascot('idle') }, 2600)
    } catch {
      setEntryErr('No active share found for that code — it may have expired.')
      setMascot('idle')
    } finally {
      setEntryBusy(false)
    }
  }

  const doRxDownload = async (file: FileMetaOut) => {
    setRxDlId(file.file_id); setRxDlPct(0)
    try {
      const url = await getDownloadUrl(rxShareId, file.file_id, rxPasscode)
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
        if (total) setRxDlPct(Math.round(received / total * 100))
      }
      const blob = new Blob(chunks)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file.name
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setRxDlId(null); setRxDlPct(0)
    }
  }

  const doRxCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text) } catch {}
    setRxCopied(true)
    setTimeout(() => setRxCopied(false), 2000)
  }

  const doRevoke = async () => {
    const ref = revokeUrl.trim()
    const token = revokeToken.trim()
    if (!ref) { setRevokeErr('Paste the share link or 6-character code.'); return }
    if (!token) { setRevokeErr('Enter your recall token.'); return }
    setRevokeErr(''); setRevokeBusy(true); setMascot('carrying')
    try {
      // resolve share ID — accept full URL (/s/<id>) or bare 6-char passcode
      let shareId: string
      const linkMatch = ref.match(/\/s\/([^/?#\s]+)/)
      if (linkMatch) {
        shareId = linkMatch[1]
      } else if (/^[A-Z2-9]{6}$/i.test(ref)) {
        const result = await lookupShareByPasscode(ref.toUpperCase())
        shareId = result.share_id
      } else {
        setRevokeErr('Enter the share link (…/s/abc123) or the 6-character code.')
        setRevokeBusy(false); setMascot('idle'); return
      }
      await deleteShare(shareId, token)
      setRevokeOk(true); setMascot('success')
      setTimeout(() => { if (mascotRef.current === 'success') setMascot('idle') }, 2600)
    } catch (err) {
      setRevokeErr(err instanceof ApiError ? err.message : 'Could not revoke — check the link/code and token.')
      setMascot('wrong')
      setTimeout(() => { if (mascotRef.current === 'wrong') setMascot('idle') }, 1200)
    } finally {
      setRevokeBusy(false)
    }
  }

  // ── derived styles ────────────────────────────────────────────────────────────
  const canSend   = !sending && ((tab==='files'&&files.length>0)||(tab==='text'&&text.trim().length>0))
  const themeSeq: Theme[] = ['day','dusk','night']
  const themeIcon = { day: '☀️', dusk: '🌅', night: '🌙' }[theme]

  const tabBase = { flex:1, border:'none', cursor:'pointer', fontFamily:"'Fredoka',sans-serif", fontWeight:600, fontSize:'14.5px', padding:'9px', borderRadius:'10px', transition:'all .2s' }
  const tabOn   = { ...tabBase, background:'var(--parch)', color:'var(--ink)', boxShadow:'0 2px 7px -2px rgba(74,65,51,.25)' }
  const tabOff  = { ...tabBase, background:'transparent', color:'var(--soft)' }

  const sendBase = { width:'100%', marginTop:'18px', border:'none', fontFamily:"'Fredoka',sans-serif", fontWeight:600, fontSize:'16px', color:'#fff', borderRadius:'15px', padding:'14px', transition:'all .2s' }
  const sendStyle = S(canSend
    ? { ...sendBase, cursor:'pointer', background:'linear-gradient(150deg,#d98f54,#b96f4c)', boxShadow:'0 10px 22px -8px rgba(185,111,76,.6)' }
    : { ...sendBase, cursor:'not-allowed', background:'rgba(122,139,90,.22)', color:'var(--parch)' })

  const dropBase  = { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', cursor:'pointer', borderRadius:'18px', padding:'26px 18px', transition:'all .2s' }
  const dropStyle = S(drag
    ? { ...dropBase, border:'2px dashed #d98f54', background:'rgba(217,143,84,.12)', transform:'scale(1.01)' }
    : { ...dropBase, border:'2px dashed rgba(122,139,90,.4)', background:'rgba(122,139,90,.06)' })

  const copyBase    = { flex:'none', border:'none', cursor:'pointer', fontFamily:"'Fredoka',sans-serif", fontWeight:600, fontSize:'13px', padding:'9px 14px', borderRadius:'11px', transition:'all .2s' }
  const copyLinkSt  = S({ ...copyBase, background:'rgba(217,143,84,.16)', color:'#b96f4c' })
  const copyTokenSt = S({ ...copyBase, background:'#b96f4c', color:'#fff' })

  const spiritSt = S({ display:'flex', alignItems:'center', gap:'8px',
    border: spirit ? '1px solid rgba(120,185,235,.55)' : '1px solid var(--line)',
    background: spirit ? 'linear-gradient(150deg,#7cc3ef,#4a93cf)' : 'var(--parch)',
    borderRadius:'13px', padding:'8px 14px', cursor:'pointer',
    fontFamily:"'Fredoka',sans-serif", fontWeight:600, fontSize:'13.5px',
    color: spirit ? '#fff' : 'var(--ink)',
    boxShadow:'0 5px 16px -10px rgba(74,65,51,.5)', transition:'background .3s ease,color .3s ease',
  })

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={rootRef}
      className="h2h-root"
      style={S({
        position:'relative', minHeight:'100vh', width:'100%', overflow:'hidden',
        background:'radial-gradient(120% 90% at 78% 8%, var(--bg1) 0%, var(--bg2) 100%)',
        fontFamily:"'Nunito',sans-serif", color:'var(--ink)',
        // initial day vars
        '--bg1':'#f7efdd','--bg2':'#e7d9bd','--parch':'#fdf8ee','--ink':'#4a4133',
        '--soft':'#8a7d66','--line':'rgba(74,65,51,.12)','--hill1':'#cdd0a0',
        '--hill2':'#aebb83','--hill3':'#8a9c62','--tree':'#6f8350','--tree2':'#5b6f43',
        '--foliage':'#7d8e5b','--sun':'rgba(247,224,170,.7)','--rock1':'#c9b79a',
        '--rock2':'#ad9a7c','--rock3':'#8b7960','--mist':'rgba(253,248,238,.6)',
        '--t-day':'1','--t-dusk':'0','--t-night':'0','--sundisc':'#ffe2a0','--mtn':'#d9d7bb',
      })}
    >

      {/* ── BACKGROUND SVG ──────────────────────────────────────────────────── */}
      <div aria-hidden="true" className="h2h-bg" style={{position:'absolute',inset:0,zIndex:0,pointerEvents:'none',overflow:'hidden'}}>
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
          <defs>
            <radialGradient id="h2hSun" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--sun)"/>
              <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
            </radialGradient>
            <filter id="h2h-sglow" x="-180%" y="-180%" width="460%" height="460%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <circle cx="1180" cy="180" r="300" fill="url(#h2hSun)"/>
          <circle cx="1196" cy="168" r="58" fill="var(--sundisc)" style={S({opacity:'calc(var(--t-day) + var(--t-dusk))',transition:'opacity .6s ease,fill .6s ease'})}/>
          <g style={S({opacity:'var(--t-night)',transition:'opacity .6s ease'})}>
            <circle cx="1196" cy="168" r="60" fill="#e9edfb"/>
            <circle cx="1174" cy="154" r="10" fill="#d6ddf1"/>
            <circle cx="1216" cy="182" r="7.5" fill="#d6ddf1"/>
            <circle cx="1202" cy="150" r="5.5" fill="#d6ddf1"/>
          </g>
          <g style={S({opacity:'var(--t-night)',transition:'opacity .6s ease'})}>
            {[{cx:210,cy:120,r:2.4,d:'3.4s',dd:'0s'},{cx:380,cy:80,r:1.8,d:'4.2s',dd:'.6s'},{cx:560,cy:150,r:2,d:'3.8s',dd:'1.1s'},
              {cx:740,cy:70,r:1.6,d:'4.6s',dd:'.3s'},{cx:900,cy:130,r:2.2,d:'3.2s',dd:'1.6s'},{cx:1040,cy:60,r:1.7,d:'4.0s',dd:'.9s'},
              {cx:320,cy:220,r:1.6,d:'3.6s',dd:'2.1s'},{cx:660,cy:240,r:1.8,d:'4.4s',dd:'1.4s'},{cx:1330,cy:330,r:2,d:'3.9s',dd:'.5s'},{cx:1080,cy:250,r:1.6,d:'4.1s',dd:'1.9s'}
            ].map((s,i)=>(
              <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#fbf7ea" style={{animation:`h2h-twinkle ${s.d} ease-in-out infinite`,animationDelay:s.dd}}/>
            ))}
          </g>
          <g style={S({opacity:'calc(var(--t-day) + var(--t-dusk)*.9)',transition:'opacity .6s ease'})}>
            <g style={{animation:'h2h-drift 70s ease-in-out infinite'}}>
              <ellipse cx="300" cy="150" rx="78" ry="30" fill="#fffaf0" opacity=".9"/>
              <ellipse cx="360" cy="138" rx="58" ry="32" fill="#fffaf0" opacity=".9"/>
              <ellipse cx="252" cy="160" rx="48" ry="24" fill="#fff6e6" opacity=".85"/>
            </g>
            <g style={{animation:'h2h-drift 95s ease-in-out infinite',animationDelay:'-40s'}}>
              <ellipse cx="820" cy="108" rx="68" ry="25" fill="#fffaf0" opacity=".82"/>
              <ellipse cx="876" cy="98"  rx="50" ry="27" fill="#fffaf0" opacity=".82"/>
            </g>
            <g style={{animation:'h2h-drift 82s ease-in-out infinite',animationDelay:'-20s'}}>
              <ellipse cx="1130" cy="320" rx="60" ry="22" fill="#fff6e6" opacity=".68"/>
              <ellipse cx="1178" cy="312" rx="44" ry="23" fill="#fff6e6" opacity=".68"/>
            </g>
          </g>
          <g style={S({opacity:'var(--t-day)',transition:'opacity .6s ease'})}>
            <g style={{animation:'h2h-birds 46s linear infinite'}}>
              <path d="M0,0 Q9,-9 18,0 Q27,-9 36,0"   fill="none" stroke="#7c6f59" strokeWidth="2.4" strokeLinecap="round"/>
              <path d="M44,26 Q52,17 60,26 Q68,17 76,26" fill="none" stroke="#8a7d66" strokeWidth="2"   strokeLinecap="round"/>
              <path d="M92,8 Q99,0 106,8 Q113,0 120,8" fill="none" stroke="#7c6f59" strokeWidth="2.2" strokeLinecap="round"/>
            </g>
          </g>
          <polygon points="0,520 200,400 360,492 520,392 700,500 860,408 1040,500 1240,418 1440,498 1440,900 0,900" fill="var(--mtn)" opacity="0.62" style={{transition:'fill .6s ease'}}/>
          <polygon points="0,560 240,470 480,545 760,455 1040,545 1280,480 1440,540 1440,900 0,900" fill="var(--hill1)" opacity="0.85"/>
          <polygon points="0,690 280,615 540,680 840,605 1110,675 1330,625 1440,665 1440,900 0,900" fill="var(--hill2)" opacity="0.92"/>
          {[['556,470 576,470 566,446'],['612,484 634,484 623,456'],['980,492 1000,492 990,464'],['1310,476 1330,476 1320,450'],['430,548 452,548 441,520']].map((p,i)=>(
            <polygon key={i} points={p[0]} fill="var(--tree2)" opacity="0.8"/>
          ))}
          <g><rect x="172" y="735" width="14" height="48" fill="var(--tree2)"/><polygon points="116,762 244,762 180,688" fill="var(--tree)"/><polygon points="180,688 244,762 180,762" fill="var(--tree2)"/><polygon points="130,712 230,712 180,648" fill="var(--tree)"/><polygon points="180,648 230,712 180,712" fill="var(--tree2)"/><polygon points="144,668 216,668 180,612" fill="var(--tree)"/><polygon points="180,612 216,668 180,668" fill="var(--tree2)"/></g>
          <g><rect x="312" y="760" width="11" height="40" fill="var(--tree2)"/><polygon points="270,782 366,782 318,724" fill="var(--tree)"/><polygon points="318,724 366,782 318,782" fill="var(--tree2)"/><polygon points="282,740 354,740 318,692" fill="var(--tree)"/><polygon points="318,692 354,740 318,740" fill="var(--tree2)"/></g>
          <g><rect x="1262" y="748" width="13" height="44" fill="var(--tree2)"/><polygon points="1206,772 1330,772 1268,700" fill="var(--tree)"/><polygon points="1268,700 1330,772 1268,772" fill="var(--tree2)"/><polygon points="1220,724 1316,724 1268,662" fill="var(--tree)"/><polygon points="1268,662 1316,724 1268,724" fill="var(--tree2)"/><polygon points="1232,680 1304,680 1268,628" fill="var(--tree)"/><polygon points="1268,628 1304,680 1268,680" fill="var(--tree2)"/></g>
          <g><rect x="1112" y="772" width="10" height="36" fill="var(--tree2)"/><polygon points="1074,792 1160,792 1117,740" fill="var(--tree)"/><polygon points="1117,740 1160,792 1117,792" fill="var(--tree2)"/></g>
          <polygon points="0,808 300,748 600,806 900,756 1200,804 1440,766 1440,900 0,900" fill="var(--hill3)"/>
          <ellipse cx="120"  cy="912" rx="180" ry="120" fill="var(--foliage)" opacity="0.9"/>
          <ellipse cx="430"  cy="932" rx="220" ry="120" fill="var(--foliage)" opacity="0.8"/>
          <ellipse cx="900"  cy="932" rx="240" ry="120" fill="var(--foliage)" opacity="0.82"/>
          <ellipse cx="1320" cy="914" rx="210" ry="120" fill="var(--foliage)" opacity="0.9"/>
          <polygon points="250,860 258,800 266,860" fill="var(--tree)"/>
          <polygon points="268,862 276,812 284,862" fill="var(--tree2)"/>
          <polygon points="690,868 698,808 706,868" fill="var(--tree)"/>
          <polygon points="1040,866 1048,810 1056,866" fill="var(--tree2)"/>
          <polygon points="1180,870 1188,818 1196,870" fill="var(--tree)"/>
        </svg>
      </div>

      {/* ── PARTICLES ───────────────────────────────────────────────────────── */}
      <div aria-hidden="true" style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:1}}>
        {[{l:'8%',w:'13px',d:'0s',clr:'rgba(122,139,90,.5)',dur:'15s'},{l:'24%',w:'10px',d:'4s',clr:'rgba(217,143,84,.5)',dur:'19s'},{l:'62%',w:'12px',d:'8s',clr:'rgba(202,168,106,.55)',dur:'17s'},{l:'82%',w:'9px',d:'11s',clr:'rgba(122,139,90,.45)',dur:'21s'},{l:'44%',w:'11px',d:'15s',clr:'rgba(217,143,84,.4)',dur:'23s'}].map((lf,i)=>(
          <div key={i} style={{position:'absolute',left:lf.l,top:0,width:lf.w,height:lf.w,borderRadius:'60% 30% 60% 30%',background:lf.clr,animation:`h2h-leaf ${lf.dur} linear infinite`,animationDelay:lf.d}}/>
        ))}
        {[{l:'16%',t:'62%',d:'.4s'},{l:'70%',t:'40%',d:'1.8s'},{l:'88%',t:'70%',d:'3.2s'},{l:'34%',t:'30%',d:'2.5s'},{l:'52%',t:'56%',d:'4.1s'},{l:'9%',t:'46%',d:'5.3s'},{l:'26%',t:'74%',d:'2.0s'},{l:'60%',t:'18%',d:'6.0s'}].map((f,i)=>(
          <div key={i} style={{position:'absolute',left:f.l,top:f.t,width:'6px',height:'6px',borderRadius:'50%',background:'#e9c877',boxShadow:'0 0 10px 3px rgba(233,200,119,.7)',animation:`h2h-fly ${6+i*0.3}s ease-in-out infinite`,animationDelay:f.d}}/>
        ))}
        <div style={{position:'absolute',right:'12%',top:'-12%',width:'150px',height:'120vh',background:'linear-gradient(to bottom,rgba(247,224,170,.16),rgba(247,224,170,0))',transform:'rotate(16deg)',transformOrigin:'top center',filter:'blur(3px)'}}/>
        <div style={{position:'absolute',right:'30%',top:'-14%',width:'90px', height:'120vh',background:'linear-gradient(to bottom,rgba(247,224,170,.12),rgba(247,224,170,0))',transform:'rotate(13deg)',transformOrigin:'top center',filter:'blur(3px)'}}/>
      </div>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="h2h-header" style={{position:'relative',zIndex:3,display:'flex',alignItems:'center',justifyContent:'space-between',gap:'11px',padding:'22px 30px'}}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:'11px',textDecoration:'none'}}>
          <div style={{width:'34px',height:'34px',borderRadius:'11px',background:'linear-gradient(150deg,#d98f54,#b96f4c)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(185,111,76,.3)'}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 14c3-1 5-1 8 0M20 14c-3-1-5-1-8 0" stroke="#fdf8ee" strokeWidth="2.4" strokeLinecap="round"/>
              <circle cx="6.5"  cy="11.5" r="1.4" fill="#fdf8ee"/>
              <circle cx="17.5" cy="11.5" r="1.4" fill="#fdf8ee"/>
            </svg>
          </div>
          <div>
            <div style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'19px',letterSpacing:'.3px',lineHeight:1,color:'var(--ink)'}}>H2H</div>
            <div style={{fontSize:'11.5px',letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--soft)',marginTop:'2px'}}>hand to hand</div>
          </div>
        </a>
        <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
          <button onClick={() => setSpirit(s => !s)} title="Reveal Kit's spirit form" style={spiritSt}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 2.5l1.9 5.4 5.6.3-4.4 3.5 1.5 5.4L12 19.4 7 17.5l1.5-5.4L4.1 8.6l5.6-.3L12 2.5z" fill={spirit ? '#ffffff' : '#7ea6c4'}/>
            </svg>
            <span className="h2h-header-label">{spirit ? 'Spirit form' : 'Reveal spirit'}</span>
          </button>
          <button onClick={() => setTheme(t => themeSeq[(themeSeq.indexOf(t)+1)%3])} title="Change time of day"
            style={S({display:'flex',alignItems:'center',gap:'8px',border:'1px solid var(--line)',background:'var(--parch)',borderRadius:'13px',padding:'8px 14px',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'13.5px',color:'var(--ink)',boxShadow:'0 5px 16px -10px rgba(74,65,51,.5)',transition:'background .3s ease'})}>
            <span>{themeIcon}</span>
            <span className="h2h-header-label">{{day:'Day',dusk:'Dusk',night:'Night'}[theme]}</span>
          </button>
        </div>
      </header>

      {/* ── FOX MASCOT ──────────────────────────────────────────────────────── */}
      <div className="h2h-fox-wrap" style={{position:'absolute',left:0,bottom:0,zIndex:2,width:'620px',height:'600px',maxWidth:'80vw',pointerEvents:'none'}}>
        <svg viewBox="0 0 620 600" preserveAspectRatio="xMinYMax slice" width="100%" height="100%" style={{position:'absolute',inset:0,overflow:'visible'}}>
          {/* valley mist */}
          <ellipse cx="500" cy="528" rx="260" ry="80" fill="var(--mist)" opacity="0.5"/>
          <ellipse cx="430" cy="560" rx="200" ry="60" fill="var(--mist)" opacity="0.6"/>
          {/* cliff */}
          <polygon points="0,332 168,332 146,474 0,492"      fill="var(--rock1)"/>
          <polygon points="168,332 312,350 292,504 150,476"   fill="var(--rock1)"/>
          <polygon points="312,350 404,344 384,520 332,566 292,504" fill="var(--rock2)"/>
          <polygon points="380,366 404,344 388,548 360,544"   fill="var(--rock3)"/>
          <polygon points="0,492 150,476 150,566 112,600 0,600"    fill="var(--rock2)"/>
          <polygon points="150,476 292,504 332,566 256,600 150,566" fill="var(--rock3)"/>
          <polygon points="0,594 112,600 150,566 256,600 332,566 372,598 372,600 0,600" fill="var(--rock3)"/>
          {/* grass cap */}
          <polygon points="0,318 168,316 312,332 404,326 398,346 312,350 168,332 0,332" fill="var(--foliage)"/>
          <polygon points="0,300 124,280 258,286 372,318 404,326 312,332 168,316 0,318" fill="var(--hill2)"/>
          {/* grass blades + mushroom */}
          <polygon points="156,288 162,266 168,288" fill="var(--hill2)"/>
          <polygon points="208,292 214,270 220,292" fill="var(--foliage)"/>
          <polygon points="300,302 306,282 312,302" fill="var(--foliage)"/>
          <polygon points="346,312 352,294 358,312" fill="var(--hill2)"/>
          <rect x="96" y="270" width="6" height="12" rx="2" fill="#efe6d2"/>
          <polygon points="89,272 109,272 99,260" fill="#c06a4a"/>
          <circle cx="95" cy="267" r="1.6" fill="#f7efe0"/>
          <circle cx="103" cy="269" r="1.4" fill="#f7efe0"/>
          {/* shadow */}
          <ellipse cx="256" cy="302" rx="92" ry="15" fill="rgba(74,65,51,.18)"/>

          {/* FOX */}
          <g onClick={onPet} transform="translate(126,80)" style={{pointerEvents:'auto',cursor:'pointer'}}>
            <g ref={foxFloatRef}>
              <g ref={foxStateRef} style={{transformBox:'fill-box',transformOrigin:'50% 100%'}}>
                {/* TAIL */}
                <g ref={foxTailRef} style={{transformBox:'fill-box',transformOrigin:'8% 96%'}}>
                  <polygon points="158,150 214,150 226,108 168,132" fill="#d98f54"/>
                  <polygon points="168,132 226,108 220,82 182,110"  fill="#c87a45"/>
                  <polygon points="182,110 220,82 200,64 178,96"    fill="#f3ead8"/>
                  <polygon points="158,150 168,132 182,170"          fill="#c87a45"/>
                  <g ref={foxGlowTailRef} style={{opacity:0}}>
                    <ellipse cx="196" cy="84" rx="15" ry="11" fill="#b6e6ff" filter="url(#h2h-sglow)" opacity="0.62" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-spiritpulse 4.2s ease-in-out infinite',animationDelay:'.9s'}}/>
                  </g>
                </g>
                {/* BODY */}
                <g ref={foxBodyRef} style={{transformBox:'fill-box',transformOrigin:'50% 92%'}}>
                  <polygon points="96,124 164,124 178,212 82,212"   fill="#d98f54"/>
                  <polygon points="96,124 130,118 164,124 130,150"  fill="#e3a86b"/>
                  <polygon points="116,132 144,132 152,212 108,212" fill="#f3ead8"/>
                  <polygon points="86,168 104,168 100,214 80,214"   fill="#c87a45"/>
                  <polygon points="156,168 174,168 180,214 160,214" fill="#c87a45"/>
                  <polygon points="98,206 122,206 120,222 96,222"   fill="#f3ead8"/>
                  <polygon points="138,206 162,206 164,222 140,222" fill="#f3ead8"/>
                  <g ref={foxGlowBodyRef} style={{opacity:0}}>
                    <ellipse cx="130" cy="172" rx="13" ry="19" fill="#7ec8f5" filter="url(#h2h-sglow)" opacity="0.42" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-spiritpulse 4.2s ease-in-out infinite'}}/>
                    <ellipse cx="109" cy="216" rx="10" ry="6"  fill="#b6e6ff" filter="url(#h2h-sglow)" opacity="0.6"  style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-spiritpulse 4.2s ease-in-out infinite',animationDelay:'1.1s'}}/>
                    <ellipse cx="152" cy="216" rx="10" ry="6"  fill="#b6e6ff" filter="url(#h2h-sglow)" opacity="0.6"  style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-spiritpulse 4.2s ease-in-out infinite',animationDelay:'1.6s'}}/>
                  </g>
                </g>
                {/* ORB */}
                <g ref={foxOrbWrapRef} style={{opacity:0}}>
                  <g ref={foxOrbRef} style={{transformBox:'fill-box',transformOrigin:'50% 50%'}}>
                    <circle cx="130" cy="196" r="26" fill="rgba(233,200,119,.28)"/>
                    <circle cx="130" cy="196" r="16" fill="#e9c877"/>
                    <polygon points="130,180 144,196 130,212 116,196" fill="#f4e3a6"/>
                    <circle cx="124" cy="190" r="4" fill="#fff8df"/>
                  </g>
                </g>
                {/* HEAD */}
                <g ref={foxHeadRef} style={{transformBox:'fill-box',transformOrigin:'50% 96%'}}>
                  <g ref={foxEarLRef} style={{transformBox:'fill-box',transformOrigin:'60% 100%'}}>
                    <polygon points="92,88 76,28 124,66"  fill="#c87a45"/>
                    <polygon points="98,82 86,44 118,66"  fill="#5b6b8c"/>
                  </g>
                  <g ref={foxEarRRef} style={{transformBox:'fill-box',transformOrigin:'40% 100%'}}>
                    <polygon points="168,88 184,28 136,66" fill="#c87a45"/>
                    <polygon points="162,82 174,44 142,66" fill="#5b6b8c"/>
                  </g>
                  <polygon points="98,70 130,56 162,70 170,100 90,100"   fill="#d98f54"/>
                  <polygon points="98,70 130,56 162,70 130,94"           fill="#e3a86b"/>
                  <polygon points="90,100 76,116 116,128 110,102"        fill="#f3ead8"/>
                  <polygon points="170,100 184,116 144,128 150,102"      fill="#f3ead8"/>
                  <polygon points="106,102 130,142 154,102 130,120"      fill="#f7f0e0"/>
                  <polygon points="106,102 130,120 154,102"              fill="#e9dcc2"/>
                  <g ref={foxGazeRef} style={{transformBox:'fill-box'}}>
                    <polygon points="123,126 137,126 130,138" fill="#4a4133"/>
                    <g ref={foxEyesRef} style={{transformBox:'fill-box',transformOrigin:'50% 50%'}}>
                      <polygon points="108,100 121,97 119,109 107,107" fill="#3a3328"/>
                      <polygon points="152,100 139,97 141,109 153,107" fill="#3a3328"/>
                      <g ref={foxGlowEyesRef} style={{opacity:0}}>
                        <circle cx="113" cy="103" r="7" fill="#7ec8f5" filter="url(#h2h-sglow)" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-spiritpulse 4.2s ease-in-out infinite'}}/>
                        <circle cx="147" cy="103" r="7" fill="#7ec8f5" filter="url(#h2h-sglow)" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-spiritpulse 4.2s ease-in-out infinite',animationDelay:'.5s'}}/>
                      </g>
                      <circle cx="112" cy="101" r="1.7" fill="#fff"/>
                      <circle cx="148" cy="101" r="1.7" fill="#fff"/>
                    </g>
                  </g>
                </g>
                {/* SPARKLES */}
                <g ref={foxSparkleRef} style={{opacity:0}}>
                  <polygon points="70,70 74,82 86,86 74,90 70,102 66,90 54,86 66,82"     fill="#f4e3a6" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sparkle 1.5s ease-out infinite'}}/>
                  <polygon points="196,76 199,86 209,89 199,92 196,102 193,92 183,89 193,86" fill="#fff8df" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sparkle 1.5s ease-out infinite',animationDelay:'.35s'}}/>
                  <polygon points="120,34 123,44 133,47 123,50 120,60 117,50 107,47 117,44" fill="#f4e3a6" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sparkle 1.5s ease-out infinite',animationDelay:'.7s'}}/>
                  <polygon points="170,40 172,48 180,50 172,52 170,60 168,52 160,50 168,48" fill="#fff8df" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sparkle 1.5s ease-out infinite',animationDelay:'.2s'}}/>
                </g>
                {/* ZZZ */}
                <g ref={foxZzzRef} style={{opacity:0}}>
                  <text x="166" y="78"  fontFamily="Fredoka,sans-serif" fontWeight="600" fontSize="15" fill="#8b93c6" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-zzz 3.6s ease-out infinite',animationDelay:'0s'}}>z</text>
                  <text x="176" y="64"  fontFamily="Fredoka,sans-serif" fontWeight="600" fontSize="19" fill="#7c84ba" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-zzz 3.6s ease-out infinite',animationDelay:'1.2s'}}>z</text>
                  <text x="188" y="50"  fontFamily="Fredoka,sans-serif" fontWeight="600" fontSize="23" fill="#6e76ac" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-zzz 3.6s ease-out infinite',animationDelay:'2.4s'}}>z</text>
                </g>
                {/* FOOD */}
                <g ref={foxFoodRef} style={{opacity:0}}>
                  <g style={{transformBox:'fill-box',transformOrigin:'50% 100%',animation:'h2h-foodbob 1.9s ease-in-out infinite'}}>
                    <ellipse cx="130" cy="158" rx="15" ry="6" fill="rgba(74,65,51,.16)"/>
                    <circle  cx="124" cy="150" r="6.5" fill="#c0506a"/>
                    <circle  cx="135" cy="152" r="5.5" fill="#a8415a"/>
                    <circle  cx="130" cy="146" r="5"   fill="#cf6178"/>
                    <polygon points="124,143 128,135 132,143" fill="#7a8b5a"/>
                    <circle  cx="122" cy="148" r="1.3" fill="#f2c3cf"/>
                  </g>
                </g>
              </g>
              {/* FOXFIRE */}
              <g ref={foxFireRef} style={{opacity:0}}>
                <g style={{transformBox:'fill-box',transformOrigin:'50% 100%',animation:'h2h-foxfire 3.4s ease-in-out infinite'}}>
                  <path d="M62,66 C72,54 73,44 62,30 C51,44 52,54 62,66 Z" fill="#8fd2f5" filter="url(#h2h-sglow)" opacity="0.85"/>
                  <path d="M62,62 C68,53 69,46 62,38 C55,46 56,53 62,62 Z" fill="#e8fbff"/>
                </g>
                <g style={{transformBox:'fill-box',transformOrigin:'50% 100%',animation:'h2h-foxfire2 3.9s ease-in-out infinite',animationDelay:'1.1s'}}>
                  <path d="M210,58 C218,48 219,40 210,28 C201,40 202,48 210,58 Z" fill="#8fd2f5" filter="url(#h2h-sglow)" opacity="0.8"/>
                  <path d="M210,55 C215,47 216,42 210,35 C204,42 205,47 210,55 Z" fill="#e8fbff"/>
                </g>
                <g style={{transformBox:'fill-box',transformOrigin:'50% 100%',animation:'h2h-foxfire 4.6s ease-in-out infinite',animationDelay:'.5s'}}>
                  <path d="M36,118 C42,110 43,104 36,95 C29,104 30,110 36,118 Z" fill="#b6e6ff" filter="url(#h2h-sglow)" opacity="0.75"/>
                  <path d="M36,115 C40,109 41,105 36,99 C31,105 32,109 36,115 Z" fill="#e8fbff"/>
                </g>
              </g>
              {/* SPIRIT PARTICLES */}
              <g ref={foxGlowPartsRef} style={{opacity:0}}>
                <circle cx="108" cy="128" r="3"   fill="#7ec8f5" filter="url(#h2h-sglow)" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sp1 4.6s ease-out infinite'}}/>
                <circle cx="152" cy="128" r="2.5" fill="#b6e6ff" filter="url(#h2h-sglow)" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sp2 5.2s ease-out infinite',animationDelay:'1.3s'}}/>
                <circle cx="130" cy="116" r="3"   fill="#7ec8f5" filter="url(#h2h-sglow)" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sp3 4.8s ease-out infinite',animationDelay:'.7s'}}/>
                <circle cx="177" cy="122" r="2.5" fill="#b6e6ff" filter="url(#h2h-sglow)" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sp4 5.5s ease-out infinite',animationDelay:'2.1s'}}/>
                <circle cx="162" cy="112" r="2"   fill="#97d8f7" filter="url(#h2h-sglow)" style={{transformBox:'fill-box',transformOrigin:'50% 50%',animation:'h2h-sp5 4.2s ease-out infinite',animationDelay:'3.4s'}}/>
              </g>
            </g>
          </g>
        </svg>

        {/* Caption + pet button */}
        <div className="h2h-fox-caption" style={{position:'absolute',left:'22px',top:'54px',maxWidth:'188px',fontFamily:"'Fredoka',sans-serif",fontSize:'13.5px',lineHeight:1.35,color:'var(--soft)',letterSpacing:'.2px',pointerEvents:'none',textShadow:'0 1px 2px rgba(253,248,238,.8)'}}>
          {CAPTIONS[mascot]}
        </div>
        <button onClick={onPet} title="Give Kit a little pet" className="h2h-fox-pet"
          style={S({position:'absolute',left:'22px',top:'104px',pointerEvents:'auto',display:'flex',alignItems:'center',gap:'7px',border:'1px solid var(--line)',background:'var(--parch)',borderRadius:'13px',padding:'8px 14px',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'13px',color:'var(--ink)',boxShadow:'0 6px 18px -10px rgba(74,65,51,.55)'})}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <ellipse cx="12" cy="15.5" rx="5"  ry="4"   fill="#d98f54"/>
            <ellipse cx="6.5" cy="9.5" rx="2"  ry="2.6" fill="#c87a45"/>
            <ellipse cx="11"  cy="6.8" rx="2"  ry="2.8" fill="#c87a45"/>
            <ellipse cx="16"  cy="8"   rx="2"  ry="2.7" fill="#c87a45"/>
            <ellipse cx="19.5" cy="12" rx="1.8" ry="2.4" fill="#c87a45"/>
          </svg>
          Pet Kit
        </button>
      </div>

      {/* ── MAIN CARD ───────────────────────────────────────────────────────── */}
      <main className="h2h-main" style={{position:'relative',zIndex:3,display:'flex',justifyContent:'flex-end',alignItems:'center',minHeight:'calc(100vh - 92px)',margin:0,padding:'0 clamp(20px,6vw,84px) 64px',pointerEvents:'none'}}>
        <section style={{flex:'none',width:'min(460px, 92vw)',pointerEvents:'auto'}}>
          <div style={{background:'var(--parch)',borderRadius:'26px',boxShadow:'0 18px 50px -18px rgba(74,65,51,.32),0 2px 0 rgba(255,255,255,.6) inset',border:'1px solid var(--line)',overflow:'hidden'}}>

            {/* ── SEND / RECEIVE MODE TOGGLE (hidden in success view) ── */}
            {view === 'upload' && (
              <div style={{display:'flex',gap:'5px',background:'rgba(122,139,90,.1)',padding:'8px',borderBottom:'1px solid var(--line)'}}>
                <button onClick={() => setMode('send')} style={S(mode==='send'
                  ? {flex:1,border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'14px',padding:'8px',borderRadius:'10px',background:'var(--parch)',color:'var(--ink)',boxShadow:'0 2px 7px -2px rgba(74,65,51,.18)'}
                  : {flex:1,border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'14px',padding:'8px',borderRadius:'10px',background:'transparent',color:'var(--soft)'})}>
                  ↑ Send
                </button>
                <button onClick={() => setMode('receive')} style={S(mode==='receive'
                  ? {flex:1,border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'14px',padding:'8px',borderRadius:'10px',background:'var(--parch)',color:'var(--ink)',boxShadow:'0 2px 7px -2px rgba(74,65,51,.18)'}
                  : {flex:1,border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'14px',padding:'8px',borderRadius:'10px',background:'transparent',color:'var(--soft)'})}>
                  ↓ Receive
                </button>
              </div>
            )}

            {/* ── RECEIVE VIEW ── */}
            {view === 'upload' && mode === 'receive' && (
              <div style={{padding:'28px 30px 28px',animation:'h2h-viewin .35s ease both'}}>

                {/* Collect / Revoke sub-toggle */}
                <div style={{display:'flex',gap:'5px',background:'rgba(122,139,90,.1)',borderRadius:'12px',padding:'5px',marginBottom:'22px'}}>
                  <button
                    onClick={() => { setRxTab('collect'); setRevokeErr(''); setRevokeOk(false) }}
                    style={S(rxTab==='collect' ? tabOn : tabOff)}>
                    ↓ Collect
                  </button>
                  <button
                    onClick={() => { setRxTab('revoke'); setEntryErr('') }}
                    style={S(rxTab==='revoke'
                      ? {...tabOn, color:'#b96f4c'}
                      : tabOff)}>
                    ✕ Revoke
                  </button>
                </div>

                {/* Collect tab */}
                {rxTab === 'collect' && (
                  <>
                    <h1 style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'23px',margin:'0 0 4px',color:'var(--ink)'}}>Have a code?</h1>
                    <p style={{margin:'0 0 20px',fontSize:'14px',color:'var(--soft)',lineHeight:1.5}}>Type your 6-character code to collect your delivery — no link needed.</p>
                    <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                      <input
                        value={entryCode}
                        onChange={e => { setEntryCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'')); setEntryErr('') }}
                        onKeyDown={e => e.key==='Enter' && doLookup()}
                        maxLength={6}
                        placeholder="ABC123"
                        style={S({flex:1,border:`1.5px solid ${entryErr?'#c05050':'var(--line)'}`,borderRadius:'14px',background:'rgba(255,255,255,.55)',padding:'12px 16px',fontFamily:"'Fredoka',sans-serif",fontSize:'24px',letterSpacing:'6px',fontWeight:600,color:'var(--ink)',outline:'none',textTransform:'uppercase',textAlign:'center',boxSizing:'border-box'})}
                      />
                      <button
                        onClick={doLookup}
                        disabled={entryBusy}
                        style={S({flexShrink:0,border:'none',cursor:entryBusy?'wait':'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'15px',color:'#fff',background:'linear-gradient(150deg,#d98f54,#b96f4c)',borderRadius:'14px',padding:'13px 22px',boxShadow:'0 6px 16px -5px rgba(185,111,76,.5)',opacity:entryBusy?.65:1,transition:'opacity .2s'})}>
                        {entryBusy ? '…' : 'Go →'}
                      </button>
                    </div>
                    {entryErr && <p style={{margin:'12px 0 0',fontSize:'13px',color:'#c05050',lineHeight:1.4}}>{entryErr}</p>}
                  </>
                )}

                {/* Revoke tab */}
                {rxTab === 'revoke' && (
                  <>
                    <h1 style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'23px',margin:'0 0 4px',color:'var(--ink)'}}>Cancel a delivery</h1>
                    <p style={{margin:'0 0 20px',fontSize:'14px',color:'var(--soft)',lineHeight:1.5}}>Enter the share link or 6-character code, plus your recall token, to cancel the delivery.</p>

                    {revokeOk ? (
                      <div style={{textAlign:'center',padding:'28px 16px',borderRadius:'16px',background:'rgba(122,139,90,.12)',border:'1.5px solid rgba(122,139,90,.3)'}}>
                        <div style={{fontSize:'28px',marginBottom:'8px'}}>✓</div>
                        <p style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'17px',color:'#5e7045',margin:'0 0 4px'}}>Delivery cancelled</p>
                        <p style={{fontSize:'13px',color:'var(--soft)',margin:'0 0 18px',lineHeight:1.4}}>The share has been deleted. The link and code no longer work.</p>
                        <button
                          onClick={() => { setRevokeUrl(''); setRevokeToken(''); setRevokeOk(false) }}
                          style={S({border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'14px',color:'var(--ink)',background:'rgba(122,139,90,.18)',borderRadius:'12px',padding:'10px 22px'})}>
                          Revoke another
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{marginBottom:'12px'}}>
                          <label style={{display:'block',fontSize:'12px',letterSpacing:'1px',textTransform:'uppercase',color:'var(--soft)',fontWeight:700,marginBottom:'6px'}}>Share link or code</label>
                          <input
                            value={revokeUrl}
                            onChange={e => { setRevokeUrl(e.target.value); setRevokeErr('') }}
                            onKeyDown={e => e.key==='Enter' && doRevoke()}
                            placeholder="Paste link  —or—  type code (ABC123)"
                            style={S({width:'100%',border:`1.5px solid ${revokeErr&&!revokeToken?'#c05050':'var(--line)'}`,borderRadius:'14px',background:'rgba(255,255,255,.55)',padding:'11px 14px',fontFamily:"'Nunito',sans-serif",fontSize:'14px',color:'var(--ink)',outline:'none',boxSizing:'border-box'})}
                          />
                        </div>
                        <div style={{marginBottom:'16px'}}>
                          <label style={{display:'block',fontSize:'12px',letterSpacing:'1px',textTransform:'uppercase',color:'var(--soft)',fontWeight:700,marginBottom:'6px'}}>Recall token</label>
                          <input
                            value={revokeToken}
                            onChange={e => { setRevokeToken(e.target.value); setRevokeErr('') }}
                            onKeyDown={e => e.key==='Enter' && doRevoke()}
                            placeholder="Paste your recall token"
                            style={S({width:'100%',border:`1.5px solid ${revokeErr&&revokeUrl?'#c05050':'var(--line)'}`,borderRadius:'14px',background:'rgba(255,255,255,.55)',padding:'11px 14px',fontFamily:"'Nunito',sans-serif",fontSize:'14px',color:'var(--ink)',outline:'none',boxSizing:'border-box'})}
                          />
                        </div>
                        {revokeErr && <p style={{margin:'0 0 14px',fontSize:'13px',color:'#c05050',lineHeight:1.4}}>{revokeErr}</p>}
                        <button
                          onClick={doRevoke}
                          disabled={revokeBusy}
                          style={S({width:'100%',border:'none',cursor:revokeBusy?'wait':'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'15px',color:'#fff',background:'linear-gradient(150deg,#c05050,#9e3a3a)',borderRadius:'14px',padding:'13px',boxShadow:'0 6px 16px -5px rgba(160,58,58,.45)',opacity:revokeBusy?.65:1,transition:'opacity .2s'})}>
                          {revokeBusy ? 'Revoking…' : 'Revoke access'}
                        </button>
                      </>
                    )}
                  </>
                )}

              </div>
            )}

            {/* ── UPLOAD VIEW ── */}
            {view === 'upload' && mode === 'send' && (
              <div style={{padding:'30px 30px 28px',animation:'h2h-viewin .5s ease both'}}>
                <h1 style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'25px',margin:'0 0 4px',color:'var(--ink)'}}>What should Kit carry?</h1>
                <p style={{margin:'0 0 20px',fontSize:'14.5px',color:'var(--soft)',lineHeight:1.5}}>Hand off a file or a note. It travels once, then the trail fades.</p>

                {/* Tab switcher */}
                <div style={{display:'flex',gap:'6px',background:'rgba(122,139,90,.1)',borderRadius:'14px',padding:'5px',marginBottom:'18px'}}>
                  <button onClick={() => setTab('files')} style={S(tab==='files' ? tabOn : tabOff)}>Files</button>
                  <button onClick={() => setTab('text')}  style={S(tab==='text'  ? tabOn : tabOff)}>Text</button>
                </div>

                {/* Files tab */}
                {tab === 'files' && (
                  <>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); if (!drag) { setDrag(true); setMascot('ready') } }}
                      onDragLeave={e => { e.preventDefault(); setDrag(false); setMascot('idle') }}
                      onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); setMascot('idle') }}
                      style={dropStyle}
                    >
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{marginBottom:'8px'}}>
                        <path d="M12 16V6m0 0l-4 4m4-4l4 4" stroke="#d98f54" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M5 19h14" stroke="#caa86a" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <div style={{fontFamily:"'Fredoka',sans-serif",fontSize:'15.5px',color:'var(--ink)'}}>{files.length ? 'Add another file' : 'Hand Kit a file'}</div>
                      <div style={{fontSize:'12.5px',color:'var(--soft)',marginTop:'3px'}}>Drag it in, or click to browse · up to 200 MB</div>
                    </div>
                    <input ref={fileInputRef} type="file" multiple onChange={e => { addFiles(e.target.files); e.target.value='' }} style={{display:'none'}}/>
                    {files.map((f,i) => (
                      <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',background:'rgba(202,168,106,.12)',borderRadius:'12px',padding:'9px 12px',marginTop:'8px'}}>
                        <div style={{width:'30px',height:'30px',borderRadius:'8px',background:'rgba(217,143,84,.18)',display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14 3v5h5" stroke="#b96f4c" strokeWidth="2" strokeLinejoin="round"/><path d="M14 3H6v18h12V8l-4-5z" stroke="#b96f4c" strokeWidth="2" strokeLinejoin="round"/></svg>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'13.5px',fontWeight:600,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.name}</div>
                          <div style={{fontSize:'11.5px',color:'var(--soft)'}}>{f.sz}</div>
                        </div>
                        <button onClick={() => setFiles(prev => prev.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--soft)',fontSize:'18px',lineHeight:1,padding:'4px'}}>×</button>
                      </div>
                    ))}
                  </>
                )}

                {/* Text tab */}
                {tab === 'text' && (
                  <textarea
                    value={text} onChange={e => setText(e.target.value)}
                    placeholder="Write the note Kit should deliver…"
                    className="h2h-scroll"
                    style={S({width:'100%',minHeight:'128px',resize:'vertical',border:'1.5px solid var(--line)',borderRadius:'16px',background:'rgba(255,255,255,.5)',padding:'14px 15px',fontFamily:"'Nunito',sans-serif",fontSize:'14.5px',color:'var(--ink)',lineHeight:1.55,outline:'none'})}
                  />
                )}

                {/* Options row */}
                <div style={{display:'flex',flexWrap:'wrap',gap:'10px',marginTop:'16px'}}>
                  <div style={{flex:'1 1 130px',display:'flex',alignItems:'center',gap:'8px',background:'rgba(122,139,90,.1)',borderRadius:'13px',padding:'5px 6px 5px 13px'}}>
                    <span style={{fontSize:'13px',color:'var(--soft)'}}>Fades in</span>
                    <select value={expiry} onChange={e => setExpiry(e.target.value as Expiry)} style={S({flex:1,border:'none',background:'transparent',fontFamily:"'Nunito',sans-serif",fontSize:'13px',fontWeight:700,color:'var(--ink)',outline:'none',cursor:'pointer'})}>
                      <option value="1h">1 hour</option>
                      <option value="1d">1 day</option>
                      <option value="7d">7 days</option>
                    </select>
                  </div>
                </div>

                {/* Upload progress */}
                {sending && (
                  <div style={{marginTop:'18px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',color:'var(--soft)',marginBottom:'7px'}}>
                      <span style={{fontFamily:"'Fredoka',sans-serif",color:'var(--ink)'}}>Kit&apos;s on the way…</span>
                      <span style={{fontWeight:700,color:'#b96f4c'}}>{pct}%</span>
                    </div>
                    <div style={{height:'9px',borderRadius:'9px',background:'rgba(122,139,90,.16)',overflow:'hidden'}}>
                      <div ref={progressBarRef} style={{height:'100%',width:'0%',borderRadius:'9px',background:'linear-gradient(90deg,#caa86a,#d98f54)',transition:'width .18s ease'}}/>
                    </div>
                  </div>
                )}

                {error && <p style={{margin:'12px 0 0',fontSize:'13px',color:'#b96f4c'}}>{error}</p>}

                {!sending && (
                  <button onClick={startSend} style={sendStyle}>Send it off</button>
                )}
              </div>
            )}

            {/* ── SUCCESS VIEW ── */}
            {view === 'success' && result && (
              <div style={{padding:'30px',animation:'h2h-viewin .5s ease both'}}>
                <div style={{display:'inline-flex',alignItems:'center',gap:'7px',background:'rgba(122,139,90,.14)',color:'#5e7045',fontWeight:700,fontSize:'12.5px',padding:'6px 12px',borderRadius:'20px',marginBottom:'14px'}}>
                  <span style={{width:'7px',height:'7px',borderRadius:'50%',background:'#7a8b5a',display:'inline-block'}}/>
                  Delivered
                </div>
                <h1 style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'24px',margin:'0 0 4px',color:'var(--ink)'}}>Kit&apos;s waiting at the other end.</h1>
                <p style={{margin:'0 0 20px',fontSize:'14px',color:'var(--soft)',lineHeight:1.5}}>Give them this code. They type it on the home page to collect the delivery.</p>

                {/* Passcode — primary */}
                <div style={{textAlign:'center',borderRadius:'18px',padding:'20px 18px',background:'linear-gradient(150deg,rgba(122,139,90,.13),rgba(202,168,106,.16))',border:'2px solid rgba(122,139,90,.35)',marginBottom:'18px',animation:'h2h-reveal .55s ease both'}}>
                  <div style={{fontSize:'11px',letterSpacing:'2px',textTransform:'uppercase',color:'var(--soft)',marginBottom:'10px',fontWeight:700}}>Your access code</div>
                  <code style={S({display:'block',fontFamily:"'Fredoka',sans-serif",fontSize:'38px',letterSpacing:'10px',fontWeight:700,color:'var(--ink)',animation:'h2h-pulse 2.2s ease-in-out 3'})}>{result.passcode}</code>
                  <button onClick={() => doCopy(result.passcode, 'code')}
                    style={S({marginTop:'12px',border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'13px',padding:'8px 20px',borderRadius:'11px',background:copied==='code'?'#7a8b5a':'rgba(122,139,90,.2)',color:copied==='code'?'#fff':'var(--ink)',transition:'all .2s'})}>
                    {copied==='code' ? 'Copied ✓' : 'Copy code'}
                  </button>
                </div>

                {/* Share link — secondary */}
                <div style={{fontSize:'11.5px',letterSpacing:'1px',textTransform:'uppercase',color:'var(--soft)',marginBottom:'7px'}}>Or share the direct link</div>
                <div style={{display:'flex',gap:'8px',alignItems:'center',background:'rgba(122,139,90,.1)',borderRadius:'14px',padding:'6px 6px 6px 15px',marginBottom:'18px'}}>
                  <span style={{flex:1,minWidth:0,fontSize:'13px',fontWeight:600,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{result.shareUrl}</span>
                  <button onClick={() => doCopy(result.shareUrl, 'link')} style={copyLinkSt}>{copied==='link' ? 'Copied ✓' : 'Copy'}</button>
                </div>

                {/* Recall token */}
                <div style={{position:'relative',borderRadius:'16px',padding:'14px 16px',background:'linear-gradient(150deg,rgba(217,143,84,.10),rgba(202,168,106,.12))',border:'1.5px dashed rgba(185,111,76,.4)',animation:'h2h-reveal .7s .15s ease both',marginBottom:'20px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'7px',fontSize:'11px',letterSpacing:'1px',textTransform:'uppercase',color:'#b96f4c',fontWeight:700,marginBottom:'7px'}}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 20l-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 2z" fill="#caa86a"/></svg>
                    Recall token — keep it safe
                  </div>
                  <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                    <code style={S({flex:1,fontFamily:"'Fredoka',sans-serif",fontSize:'18px',letterSpacing:'2px',fontWeight:600,color:'#a85e3c',borderRadius:'8px',padding:'2px 4px'})}>{result.deleteToken}</code>
                    <button onClick={() => doCopy(result.deleteToken, 'token')} style={copyTokenSt}>{copied==='token' ? 'Copied ✓' : 'Copy'}</button>
                  </div>
                  <p style={{margin:'7px 0 0',fontSize:'12px',color:'var(--soft)',lineHeight:1.45}}>Shown once. The only way to cancel the delivery before it fades.</p>
                </div>

                <div style={{display:'flex',gap:'10px'}}>
                  <a href={result.shareUrl} target="_blank" rel="noreferrer"
                    style={S({flex:1,border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'15px',color:'#fff',background:'linear-gradient(150deg,#d98f54,#b96f4c)',borderRadius:'14px',padding:'13px',boxShadow:'0 8px 18px -6px rgba(185,111,76,.55)',display:'block',textAlign:'center',textDecoration:'none'})}>
                    Preview →
                  </a>
                  <button onClick={reset}
                    style={S({flexShrink:0,border:'1.5px solid var(--line)',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'15px',color:'var(--ink)',background:'transparent',borderRadius:'14px',padding:'13px 18px'})}>
                    Send another
                  </button>
                </div>
              </div>
            )}

            {/* ── RECEIVED VIEW ── */}
            {view === 'received' && rxMeta && (
              <div style={{padding:'30px',animation:'h2h-viewin .5s ease both'}}>
                <div style={{display:'inline-flex',alignItems:'center',gap:'7px',background:'rgba(122,139,90,.14)',color:'#5e7045',fontWeight:700,fontSize:'12.5px',padding:'6px 12px',borderRadius:'20px',marginBottom:'14px'}}>
                  <span style={{width:'7px',height:'7px',borderRadius:'50%',background:'#7a8b5a',display:'inline-block'}}/>
                  {rxMeta.type === 'files' ? `${rxMeta.files.length} file${rxMeta.files.length !== 1 ? 's' : ''} delivered` : 'Note delivered'}
                </div>
                <h1 style={{fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'24px',margin:'0 0 4px',color:'var(--ink)'}}>Kit brought you something.</h1>
                <p style={{margin:'0 0 18px',fontSize:'14px',color:'var(--soft)',lineHeight:1.5}}>
                  {rxMeta.type === 'files' ? "It carried these the whole way over. Take them when you're ready." : "A note, delivered. It's yours to keep."}
                </p>

                {/* Files */}
                {rxMeta.type === 'files' && rxMeta.files.map(f => (
                  <div key={f.file_id}>
                    <div style={{display:'flex',alignItems:'center',gap:'11px',background:'rgba(202,168,106,.12)',borderRadius:'13px',padding:'11px 13px',marginBottom:'6px'}}>
                      <div style={{width:'34px',height:'34px',borderRadius:'9px',background:'rgba(217,143,84,.18)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 3v5h5" stroke="#b96f4c" strokeWidth="2" strokeLinejoin="round"/><path d="M14 3H6v18h12V8l-4-5z" stroke="#b96f4c" strokeWidth="2" strokeLinejoin="round"/></svg>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'14px',fontWeight:600,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.name}</div>
                        <div style={{fontSize:'12px',color:'var(--soft)'}}>{formatBytes(f.size)}</div>
                      </div>
                      <button onClick={() => doRxDownload(f)} disabled={rxDlId === f.file_id}
                        style={S({flexShrink:0,border:'none',cursor:rxDlId===f.file_id?'default':'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'14px',color:'#fff',background:'linear-gradient(150deg,#7a8b5a,#5e7045)',borderRadius:'11px',padding:'9px 16px',opacity:rxDlId===f.file_id?.6:1,transition:'opacity .2s',minWidth:'84px'})}>
                        {rxDlId === f.file_id ? `${rxDlPct}%` : 'Download'}
                      </button>
                    </div>
                    {rxDlId === f.file_id && (
                      <div style={{height:'6px',borderRadius:'6px',background:'rgba(122,139,90,.16)',overflow:'hidden',marginBottom:'6px'}}>
                        <div style={{height:'100%',width:`${rxDlPct}%`,borderRadius:'6px',background:'linear-gradient(90deg,#7a8b5a,#5e7045)',transition:'width .15s ease'}}/>
                      </div>
                    )}
                  </div>
                ))}

                {/* Text */}
                {rxMeta.type === 'text' && rxContent !== null && (
                  <>
                    <div className="h2h-scroll" style={{maxHeight:'160px',overflow:'auto',background:'rgba(255,255,255,.5)',border:'1.5px solid var(--line)',borderRadius:'14px',padding:'14px 15px',fontSize:'14.5px',lineHeight:1.6,color:'var(--ink)',whiteSpace:'pre-wrap',marginBottom:'14px'}}>
                      {rxContent}
                    </div>
                    <button onClick={() => doRxCopy(rxContent)}
                      style={S({width:'100%',border:'none',cursor:'pointer',fontFamily:"'Fredoka',sans-serif",fontWeight:600,fontSize:'15px',color:'#fff',background:'linear-gradient(150deg,#7a8b5a,#5e7045)',borderRadius:'14px',padding:'13px',boxShadow:'0 8px 18px -6px rgba(94,112,69,.5)'})}>
                      {rxCopied ? 'Copied ✓' : 'Copy the note'}
                    </button>
                  </>
                )}

                <button onClick={reset}
                  style={S({display:'block',marginTop:'18px',background:'none',border:'none',cursor:'pointer',fontFamily:"'Nunito',sans-serif",fontSize:'13px',color:'var(--soft)',padding:0})}>
                  ← Back to home
                </button>
              </div>
            )}

          </div>
        </section>

      </main>

    </div>
  )
}
