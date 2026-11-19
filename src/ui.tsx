import { useState, type FormEvent, type ReactNode } from 'react'
import { copy, type Copy } from './i18n'
import { itemMatches, mapsQuery, orderItems, visibleCells } from './parse'
import type { Draft, Item, Lang, Plan } from './types'

function RichText({ text }: { text: string }) {
  const re = /https?:\/\/[^\s<>]+/g
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const trail = match[0].match(/[),.;，。、]+$/)
    const href = trail ? match[0].slice(0, -trail[0].length) : match[0]
    nodes.push(<a key={i++} href={href} target="_blank" rel="noreferrer">{href}</a>)
    if (trail) nodes.push(trail[0])
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

function MapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function showDate(iso: string, lang: Lang) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en', {
    year: 'numeric', month: 'short', day: 'numeric', weekday: 'short',
  })
}

export function PlanForm({
  s, busy, initial, submitLabel, onSubmit, onCancel,
}: {
  s: Copy
  busy: boolean
  initial?: Draft
  submitLabel: string
  onSubmit: (draft: Draft) => Promise<boolean>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title || '')
  const [tripDate, setTripDate] = useState(initial?.tripDate || '')
  const [sheetUrl, setSheetUrl] = useState(initial?.sheetUrl || '')
  return (
    <form className="panel" onSubmit={async (e: FormEvent) => {
      e.preventDefault()
      if (!title.trim() || !tripDate) return
      await onSubmit({ title: title.trim(), tripDate, sheetUrl: sheetUrl.trim() })
    }}>
      <label>{s.title}
        <input required maxLength={80} value={title} placeholder={s.titlePh} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>{s.tripDate}
        <input type="date" required value={tripDate} onChange={(e) => setTripDate(e.target.value)} />
      </label>
      <label>{s.sheetUrl}
        <input maxLength={1000} value={sheetUrl} placeholder={s.urlPh} onChange={(e) => setSheetUrl(e.target.value)} />
      </label>
      <p className="hint">{s.sheetHint}</p>
      <div className="actions">
        <button className="btn" disabled={busy} type="submit">{busy ? s.saving : submitLabel}</button>
        <button className="btn ghost" type="button" onClick={onCancel}>{s.cancel}</button>
      </div>
    </form>
  )
}

export function LoginCard({
  ready, missing, s, busy, onSignIn, onDemo,
}: {
  ready: boolean
  missing: string[]
  s: Copy
  busy: boolean
  onSignIn: () => void
  onDemo: () => void
}) {
  return (
    <section>
      <p className="lead">{s.tagline}</p>
      {!ready && (
        <div className="panel">
          <p>{s.setup}</p>
          <ul>{missing.map((key) => <li key={key}><code>{key}</code></li>)}</ul>
        </div>
      )}
      <div className="actions">
        <button className="btn" type="button" disabled={!ready || busy} onClick={onSignIn}>{busy ? s.saving : s.signIn}</button>
        <button className="btn ghost" type="button" onClick={onDemo}>{s.demo}</button>
      </div>
    </section>
  )
}

export function PlanList({
  plans, lang, s, busy, creating, onToggle, onCreate, onOpen,
}: {
  plans: Plan[]
  lang: Lang
  s: Copy
  busy: boolean
  creating: boolean
  onToggle: () => void
  onCreate: (draft: Draft) => Promise<boolean>
  onOpen: (id: string) => void
}) {
  const groups: { date: string; plans: Plan[] }[] = []
  for (const plan of plans) {
    const prev = groups[groups.length - 1]
    if (!prev || prev.date !== plan.tripDate) groups.push({ date: plan.tripDate, plans: [plan] })
    else prev.plans.push(plan)
  }
  return (
    <section>
      <div className="row">
        <h1>{s.mine}</h1>
        <button className="btn" type="button" onClick={onToggle}>{s.newPlan}</button>
      </div>
      {creating && (
        <PlanForm s={s} busy={busy} submitLabel={s.create} onSubmit={onCreate} onCancel={onToggle} />
      )}
      {!plans.length && !creating && <p className="empty">{s.noPlans}</p>}
      {groups.map((group) => (
        <section key={group.date} className="day">
          <h2>{showDate(group.date, lang)}</h2>
          {group.plans.map((plan) => (
            <button className="plancard" type="button" key={plan.id} onClick={() => onOpen(plan.id)}>
              <strong>{plan.title}</strong>
              <span>{plan.items.length} {s.cards}</span>
            </button>
          ))}
        </section>
      ))}
    </section>
  )
}

function CardView({ item, pinned, s, onMove }: { item: Item; pinned: boolean; s: Copy; onMove: (pos: 'top' | 'bottom' | 'clear') => void }) {
  return (
    <article className={pinned ? 'card pinned' : 'card'}>
      {visibleCells(item).map((cell, i) => {
        const query = mapsQuery(cell.kind, cell.value)
        return (
          <div className={'field ' + cell.kind} key={i}>
            {cell.header ? <span className="k">{cell.header}</span> : null}
            <span className="v">
              <RichText text={cell.value} />
              {query && (
                <a className="map" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer" aria-label={s.map} title={s.map}>
                  <MapIcon />
                </a>
              )}
            </span>
          </div>
        )
      })}
      <div className="cardfoot">
        <button type="button" onClick={() => onMove('top')}>{s.top}</button>
        <button type="button" onClick={() => onMove('bottom')}>{s.bottom}</button>
        {pinned && <button type="button" onClick={() => onMove('clear')}>{s.reset}</button>}
      </div>
    </article>
  )
}

export function PlanDetail({
  plan, demoMode, lang, busy, onBack, onRefresh, onDelete, onMove, onSave,
}: {
  plan: Plan
  demoMode: boolean
  lang: Lang
  busy: boolean
  onBack: () => void
  onRefresh: () => void
  onDelete: () => void
  onMove: (id: string, pos: 'top' | 'bottom' | 'clear') => void
  onSave: (draft: Draft) => Promise<boolean>
}) {
  const s = copy[lang]
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(false)
  const shown = orderItems(plan.items, plan.placement).filter((item) => itemMatches(item, q))
  const groups: { day: string; items: Item[] }[] = []
  for (const item of shown) {
    const prev = groups[groups.length - 1]
    if (!prev || prev.day !== item.day) groups.push({ day: item.day, items: [item] })
    else prev.items.push(item)
  }
  return (
    <section>
      <button className="textbtn" type="button" onClick={onBack}>{s.back}</button>
      <div className="row">
        <h1>{plan.title}</h1>
        <button className="btn ghost" type="button" onClick={() => setEditing((v) => !v)}>{s.edit}</button>
      </div>
      <p className="muted">{showDate(plan.tripDate, lang)}</p>
      {demoMode && <p className="note">{s.preview}</p>}
      {editing && (
        <PlanForm
          s={s}
          busy={busy}
          initial={plan}
          submitLabel={s.save}
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            const ok = await onSave(draft)
            if (ok) setEditing(false)
            return ok
          }}
        />
      )}
      <div className="actions">
        {!demoMode && <button className="btn" type="button" disabled={busy} onClick={onRefresh}>{busy ? s.saving : s.refresh}</button>}
        {plan.sheetUrl && <a className="btn ghost" href={plan.sheetUrl} target="_blank" rel="noreferrer">{s.openSheet}</a>}
      </div>
      {!!plan.fetchedAt && <p className="muted">{s.updated} {new Date(plan.fetchedAt).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en')}</p>}
      <input className="search" type="search" placeholder={s.search} value={q} onChange={(e) => setQ(e.target.value)} />
      {!plan.items.length && <p className="empty">{s.noItems}<br />{s.noItemsHint}</p>}
      {!!plan.items.length && !shown.length && <p className="empty">{s.searchEmpty}</p>}
      {groups.map((group) => (
        <section className="day" key={group.day || 'none'}>
          <div className="dayhead">
            <h2>{group.day || s.undated}</h2>
            <span>{group.items.length}</span>
          </div>
          <div className="track">
            {group.items.map((item) => (
              <CardView key={item.id} item={item} pinned={!!plan.placement[item.id]} s={s} onMove={(pos) => onMove(item.id, pos)} />
            ))}
          </div>
        </section>
      ))}
      {!demoMode && <button className="btn danger" type="button" onClick={onDelete}>{s.delete}</button>}
    </section>
  )
}
