import { SheetError } from './errors'
import { TOKEN_KEY, googleToken } from './firebase'

export interface TextSegment {
  text: string
  url?: string
}

export type RichCell = TextSegment[]

interface TextFormatRun {
  startIndex?: number
  format?: {
    link?: {
      uri?: string
    }
  }
}

interface CellData {
  formattedValue?: string
  hyperlink?: string
  textFormatRuns?: TextFormatRun[]
}

interface SheetResponse {
  sheets?: {
    properties?: { title?: string }
    data?: {
      rowData?: {
        values?: CellData[]
      }[]
    }[]
  }[]
  values?: unknown[][]
  error?: { message?: string; status?: string }
}

export function spreadsheetId(input: string): string | null {
  const text = input.trim()
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text
  return null
}

function rangeOf(title: string) {
  return encodeURIComponent(`'${title.replace(/'/g, "''")}'`)
}

function normalizeSpaces(raw: string): string {
  return raw.replace(/\u00a0/g, ' ')
}

function trimEdgeSegments(segments: TextSegment[]): TextSegment[] {
  const out = segments.map((seg) => ({ ...seg, text: normalizeSpaces(seg.text) }))
  if (out.length > 0) {
    out[0].text = out[0].text.replace(/^\s+/, '')
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '')
  }
  return out.filter((seg) => seg.text.length > 0)
}

function parseCell(cell?: CellData): RichCell {
  if (!cell) return []

  const fullText = String(cell.formattedValue ?? '')
  if (!fullText) return []

  const runs = Array.isArray(cell.textFormatRuns) ? cell.textFormatRuns : []

  if (runs.length === 0) {
    return trimEdgeSegments([{ text: fullText, url: cell.hyperlink || undefined }])
  }

  const segments: TextSegment[] = []
  for (let i = 0; i < runs.length; i++) {
    const startIndex = runs[i].startIndex ?? 0
    const endIndex = i + 1 < runs.length ? (runs[i + 1].startIndex ?? fullText.length) : fullText.length

    if (i === 0 && startIndex > 0) {
      segments.push({ text: fullText.slice(0, startIndex) })
    }

    const url = runs[i].format?.link?.uri || undefined
    segments.push({
      text: fullText.slice(startIndex, endIndex),
      url,
    })
  }

  return trimEdgeSegments(segments)
}

async function getJson(url: string, token: string): Promise<SheetResponse> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
    const body = (await res.json().catch(() => ({}))) as SheetResponse
    if (res.ok) return body
    const msg = body.error?.message || ''
    const status = body.error?.status || ''
    let code: SheetError['code'] = 'fetch'
    if (res.status === 401 || /UNAUTHENTICATED|ACCESS_TOKEN_SCOPE|insufficient authentication/i.test(`${status} ${msg}`)) code = 'auth'
    else if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) code = 'api'
    else if (res.status === 404) code = 'missing'
    else if (res.status === 403) code = 'permission'
    throw new SheetError(code, msg)
  } catch (e) {
    if (e instanceof SheetError) throw e
    throw new SheetError('fetch')
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchFirstSheet(token: string, id: string) {
  const meta = await getJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`, token)
  const title = meta.sheets?.[0]?.properties?.title
  if (!title) throw new SheetError('missing')

  const fields = encodeURIComponent('sheets.data.rowData.values(formattedValue,hyperlink,textFormatRuns)')
  const data = await getJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?ranges=${rangeOf(title)}&includeGridData=true&fields=${fields}`,
    token,
  )

  const rowData = data.sheets?.[0]?.data?.[0]?.rowData || []
  if (!rowData.length) return { headers: [] as string[], rows: [] as RichCell[][] }

  const table: RichCell[][] = rowData.map((row) =>
    (Array.isArray(row?.values) ? row.values : []).map(parseCell),
  )

  const headers = (table[0] || []).map((cell) => cell.map((seg) => seg.text).join(' ').trim())
  const rows = table.slice(1)

  return { headers, rows }
}

export async function withSheet<T>(run: (token: string) => Promise<T>) {
  const cached = sessionStorage.getItem(TOKEN_KEY)
  const token = cached || (await googleToken(false))
  try {
    return await run(token)
  } catch (e) {
    if (e instanceof SheetError && e.code === 'auth') {
      sessionStorage.removeItem(TOKEN_KEY)
      return run(await googleToken(true))
    }
    throw e
  }
}
