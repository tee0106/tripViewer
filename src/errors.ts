export type SheetCode = 'auth' | 'permission' | 'api' | 'missing' | 'fetch' | 'badUrl'

export class SheetError extends Error {
  code: SheetCode
  detail?: string
  constructor(code: SheetCode, detail?: string) {
    super(detail || code)
    this.name = 'SheetError'
    this.code = code
    this.detail = detail
  }
}

export function errorCode(e: unknown): string {
  if (e instanceof SheetError) return e.code
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : ''
  if (code.includes('popup-closed') || code.includes('cancelled')) return 'popupClosed'
  if (code.includes('popup-blocked')) return 'popup'
  if (code === 'permission-denied') return 'dbRules'
  return 'fetch'
}
