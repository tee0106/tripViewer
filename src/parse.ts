import type { Cell, ColKind, Item, Placement, RichCell, TextSegment } from './types'

const NOT_PLACE = /^(集合|解散|參觀|逛街|購物|午餐|晚餐|早餐|宵夜|自由活動|休息|移動|返回|入住|退房)$/i
const ACTIVITY = /早餐|午餐|晚餐|宵夜|集合|解散|移動|返回|入住|退房|自由活動|休息|出發|抵達|前往|搭乘|步行|開車|參觀|逛街|購物|check-?in|check-?out|lunch|dinner|breakfast|transfer/i

export function kindOf(header: string): ColKind {
  const h = header.trim().toLowerCase().replace(/\s+/g, '')
  if (!h) return 'other'
  if (h.includes('日期') || h.includes('行程日') || h === 'date' || h === 'day' || h === 'datetime') return 'date'
  if (h.includes('時間') || h.includes('時刻') || h === 'time' || h === 'start' || h === 'end') return 'time'
  if (/備註|備注|备注|註解|說明|連結|網址/.test(h) || ['note', 'memo', 'remark', 'link', 'url'].includes(h)) return 'note'
  if (/交通|費用|票價|預算|金額/.test(h) || ['cost', 'price', 'fee', 'budget'].includes(h)) return 'meta'
  if (/地點|地点|景點|地址|位置|店名|餐廳|住宿|飯店|酒店/.test(h) || ['location', 'place', 'venue', 'address', 'spot', 'hotel', 'restaurant'].some((w) => h === w || h.endsWith(w))) return 'place'
  if (/事件|活動|項目|安排|內容|名稱|行程|待辦/.test(h) || ['event', 'activity', 'title'].includes(h)) return 'event'
  return 'other'
}

export function mapsQuery(kind: ColKind, value: string): string | null {
  const t = value.trim()
  if (!t || kind === 'date' || kind === 'time' || kind === 'note' || kind === 'meta') return null
  if (/^https?:\/\//i.test(t) || /^\d{1,2}:\d{2}/.test(t) || /^[\d\s.,:+\-/¥$￥元]+$/.test(t)) return null
  if (NOT_PLACE.test(t)) return null
  if (kind === 'place') return t.length <= 80 ? t : null
  if (t.length < 2 || t.length > 50 || /[。！？!?]/.test(t) || /[，,]/.test(t) || ACTIVITY.test(t)) return null
  if (!/[\p{Script=Han}A-Za-z]/u.test(t)) return null
  return t
}

function hash(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

function normalizeRichCell(rawCell: RichCell | undefined): { value: string; segments?: TextSegment[] } {
  const list = Array.isArray(rawCell) ? rawCell : []
  const cleanedSegments = list
    .map((seg) => ({
      text: String(seg?.text ?? '').replace(/\u00a0/g, ' '),
      ...(seg?.url ? { url: seg.url } : {}),
    }))
    .filter((seg) => seg.text.length > 0)

  if (cleanedSegments.length > 0) {
    cleanedSegments[0].text = cleanedSegments[0].text.replace(/^\s+/, '')
    cleanedSegments[cleanedSegments.length - 1].text = cleanedSegments[cleanedSegments.length - 1].text.replace(/\s+$/, '')
  }

  const nonEmptySegments = cleanedSegments.filter((seg) => seg.text.length > 0)
  const value = nonEmptySegments.map((seg) => seg.text).join('').trim()
  const hasLink = nonEmptySegments.some((seg) => Boolean(seg.url))

  return {
    value,
    segments: hasLink ? nonEmptySegments : undefined,
  }
}

export function parseItems(headers: string[], rows: RichCell[][]): Item[] {
  let seenDate = false
  const kinds = headers.map((header) => {
    let kind = kindOf(header)
    if (kind === 'date') {
      if (seenDate) kind = 'other'
      seenDate = true
    }
    return kind
  })
  const dateIdx = kinds.indexOf('date')
  const contentIdx = kinds.map((kind, i) => (kind === 'place' || kind === 'event' ? i : -1)).filter((i) => i >= 0)
  const items: Item[] = []
  const seen = new Map<string, number>()
  let day = ''

  for (const row of rows) {
    const safeRow = Array.isArray(row) ? row : []
    const parsedCells = headers.map((_, i) => normalizeRichCell(safeRow[i]))
    const values = parsedCells.map((c) => c.value)

    if (values.every((value) => !value)) continue
    if (dateIdx >= 0 && values[dateIdx]) day = values[dateIdx]

    const hasContent = contentIdx.length
      ? contentIdx.some((i) => values[i])
      : values.some((value, i) => value && kinds[i] !== 'date')
    if (!hasContent) continue

    const base = hash(`${day}\u001f${values.join('\u001f')}`)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)

    items.push({
      id: n ? `${base}_${n}` : base,
      day,
      cells: headers.map((header, i) => ({
        header: header.trim(),
        kind: kinds[i],
        value: parsedCells[i].value,
        ...(parsedCells[i].segments ? { segments: parsedCells[i].segments } : {}),
      })),
    })
  }
  return items
}

export function visibleCells(item: Item): Cell[] {
  return item.cells.filter((cell) => cell.kind !== 'date' && cell.value.trim())
}

export function orderItems(items: Item[], placement: Placement): Item[] {
  const days: string[] = []
  const map = new Map<string, Item[]>()
  for (const item of items) {
    if (!map.has(item.day)) {
      map.set(item.day, [])
      days.push(item.day)
    }
    map.get(item.day)!.push(item)
  }
  const out: Item[] = []
  for (const day of days) {
    const rows = map.get(day)!
    const top = rows.filter((row) => placement[row.id]?.pos === 'top').sort((a, b) => (placement[b.id]?.at ?? 0) - (placement[a.id]?.at ?? 0))
    const mid = rows.filter((row) => !placement[row.id])
    const bot = rows.filter((row) => placement[row.id]?.pos === 'bottom').sort((a, b) => (placement[a.id]?.at ?? 0) - (placement[b.id]?.at ?? 0))
    out.push(...top, ...mid, ...bot)
  }
  return out
}

export function itemMatches(item: Item, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [item.day, ...item.cells.flatMap((cell) => [cell.header, cell.value])].join('\n').toLowerCase().includes(needle)
}
