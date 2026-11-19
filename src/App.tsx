import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { demoPlan } from './demo'
import { errorCode, SheetError } from './errors'
import { auth, db, googleToken, logOut, missingEnv, ready } from './firebase'
import { copy, errorText } from './i18n'
import { parseItems } from './parse'
import { fetchFirstSheet, spreadsheetId, withSheet } from './sheets'
import type { Draft, Lang, Plan } from './types'
import { LoginCard, PlanDetail, PlanList } from './ui'

function asPlan(id: string, data: Record<string, unknown>): Plan {
  return {
    id,
    title: String(data.title || ''),
    tripDate: String(data.tripDate || ''),
    sheetUrl: String(data.sheetUrl || ''),
    spreadsheetId: String(data.spreadsheetId || ''),
    placement: data.placement && typeof data.placement === 'object' ? data.placement as Plan['placement'] : {},
    items: Array.isArray(data.items) ? data.items as Plan['items'] : [],
    fetchedAt: typeof data.fetchedAt === 'number' ? data.fetchedAt : 0,
  }
}

function maskEmail(email: string | null) {
  if (!email || !email.includes('@')) return email || ''

  const [localPart, domain] = email.split('@')
  const visible = localPart.slice(0, 3)
  return `${visible}******@${domain}`
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('tv_lang') === 'en' ? 'en' : 'zh'))
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [user, setUser] = useState<User | null | undefined>(ready ? undefined : null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [demo, setDemo] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ code: string; detail?: string } | null>(null)
  const [dbErr, setDbErr] = useState('')
  const s = copy[lang]
  const current = plans.find((plan) => plan.id === openId) || null
  const opened = demo || current

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en'
    localStorage.setItem('tv_theme', theme)
    localStorage.setItem('tv_lang', lang)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171614' : '#f3efe6')
  }, [theme, lang])

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (next) => setUser(next))
  }, [])

  useEffect(() => {
    if (!db || !user) return
    return onSnapshot(collection(db, 'users', user.uid, 'plans'), (snap) => {
      const next = snap.docs.map((item) => asPlan(item.id, item.data() as Record<string, unknown>))
      next.sort((a, b) => b.tripDate.localeCompare(a.tripDate) || a.title.localeCompare(b.title, lang === 'zh' ? 'zh-Hant' : 'en'))
      setPlans(next)
      setDbErr('')
    }, (error) => setDbErr(error.code === 'permission-denied' ? 'dbRules' : 'fetch'))
  }, [user, lang])

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try {
      await task()
      return true
    } catch (e) {
      const code = errorCode(e)
      if (code !== 'popupClosed') setErr({ code, detail: e instanceof SheetError ? e.detail : undefined })
      return false
    } finally {
      setBusy(false)
    }
  }

  function home() {
    setDemo(null)
    setOpenId(null)
    setCreating(false)
    setErr(null)
  }

  async function createDraft(draft: Draft) {
    if (!user || !db) return
    const sid = spreadsheetId(draft.sheetUrl)
    if (!draft.title || !draft.tripDate) return
    if (!sid) throw new SheetError('badUrl')
    const id = crypto.randomUUID()
    const pulled = await withSheet((token) => fetchFirstSheet(token, sid))
    await setDoc(doc(db, 'users', user.uid, 'plans', id), {
      title: draft.title,
      tripDate: draft.tripDate,
      sheetUrl: draft.sheetUrl,
      spreadsheetId: sid,
      placement: {},
      items: parseItems(pulled.headers, pulled.rows),
      fetchedAt: Date.now(),
      updatedAt: serverTimestamp(),
    })
    setCreating(false)
    setOpenId(id)
  }

  async function saveDraft(draft: Draft) {
    if (demo) {
      setDemo({ ...demo, title: draft.title, tripDate: draft.tripDate, sheetUrl: draft.sheetUrl })
      return
    }
    if (!user || !db || !current) return
    const sid = spreadsheetId(draft.sheetUrl)
    if (!draft.title || !draft.tripDate) return
    if (!sid) throw new SheetError('badUrl')
    const ref = doc(db, 'users', user.uid, 'plans', current.id)
    const same = sid === current.spreadsheetId
    if (same) {
      await updateDoc(ref, { title: draft.title, tripDate: draft.tripDate, sheetUrl: draft.sheetUrl, updatedAt: serverTimestamp() })
      return
    }
    const pulled = await withSheet((token) => fetchFirstSheet(token, sid))
    await updateDoc(ref, {
      title: draft.title,
      tripDate: draft.tripDate,
      sheetUrl: draft.sheetUrl,
      spreadsheetId: sid,
      items: parseItems(pulled.headers, pulled.rows),
      placement: {},
      fetchedAt: Date.now(),
      updatedAt: serverTimestamp(),
    })
  }

  async function refresh() {
    if (!user || !db || !current) return
    if (!current.spreadsheetId) throw new SheetError('badUrl')
    const pulled = await withSheet((token) => fetchFirstSheet(token, current.spreadsheetId))
    await updateDoc(doc(db, 'users', user.uid, 'plans', current.id), {
      items: parseItems(pulled.headers, pulled.rows),
      fetchedAt: Date.now(),
      updatedAt: serverTimestamp(),
    })
  }

  async function move(id: string, pos: 'top' | 'bottom' | 'clear') {
    const source = demo ?? current
    if (!source) return
    const placement = { ...source.placement }
    if (pos === 'clear') delete placement[id]
    else placement[id] = { pos, at: Date.now() }
    if (demo) {
      setDemo({ ...demo, placement })
      return
    }
    if (!user || !db || !current) return
    await updateDoc(doc(db, 'users', user.uid, 'plans', current.id), { placement, updatedAt: serverTimestamp() })
  }

  async function remove() {
    if (!user || !db || !current) return
    await deleteDoc(doc(db, 'users', user.uid, 'plans', current.id))
    setOpenId(null)
  }

  const brand = (
    <>
      <span className="mark" aria-hidden="true" />
      tripViewer
    </>
  )

  return (
    <>
      <header className="topbar">
        <div className="wrap bar">
          {!user && !demo ? <h1 className="brand">{brand}</h1> : <button className="brand" type="button" onClick={home}>{brand}</button>}
          <div className="pills">
            {user && <span className="who">{maskEmail(user.email)}</span>}
            {user && <button className="textbtn" type="button" onClick={() => void logOut()}>{s.signOut}</button>}
            <button className="textbtn" type="button" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{s.lang}</button>
            <button className="textbtn" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? s.toLight : s.toDark}</button>
          </div>
        </div>
      </header>
      <main className="wrap">
        {dbErr && <p className="banner" role="alert">{errorText(lang, dbErr)}</p>}
        {err && <p className="banner" role="alert">{errorText(lang, err.code)}{err.detail && <small>{err.detail}</small>}</p>}
        {ready && user === undefined && <p className="muted">{s.loading}</p>}
        {!user && !demo && user !== undefined && (
          <LoginCard ready={ready} missing={missingEnv} s={s} busy={busy} onDemo={() => setDemo(structuredClone(demoPlan))} onSignIn={() => void run(() => googleToken(false).then(() => undefined))} />
        )}
        {user && !opened && (
          <PlanList
            plans={plans}
            lang={lang}
            s={s}
            busy={busy}
            creating={creating}
            onToggle={() => { setCreating((v) => !v); setErr(null) }}
            onOpen={setOpenId}
            onCreate={(draft) => run(() => createDraft(draft))}
          />
        )}
        {opened && (
          <PlanDetail
            plan={opened}
            demoMode={!!demo}
            lang={lang}
            busy={busy}
            onBack={home}
            onRefresh={() => void run(refresh)}
            onDelete={() => { if (confirm(s.deleteAsk)) void run(remove) }}
            onMove={(id, pos) => void run(() => move(id, pos))}
            onSave={(draft) => run(() => saveDraft(draft))}
          />
        )}
      </main>
    </>
  )
}
