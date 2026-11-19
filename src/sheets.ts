import { SheetError } from './errors'
import { TOKEN_KEY, googleToken } from './firebase'

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

async function getJson(url: string, token: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
    const body = (await res.json().catch(() => ({}))) as {
      sheets?: { properties?: { title?: string } }[]
      values?: unknown[][]
      error?: { message?: string; status?: string }
    }
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
  const data = await getJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${rangeOf(title)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    token,
  )
  const values = data.values || []
  if (!values.length) return { headers: [] as string[], rows: [] as string[][] }
  const table = values.map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').replace(/\u00a0/g, ' ').trim()))
  return { headers: table[0], rows: table.slice(1) }
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
