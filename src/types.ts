export type Lang = 'zh' | 'en'
export type ColKind = 'date' | 'time' | 'place' | 'event' | 'note' | 'meta' | 'other'
export type Cell = { header: string; kind: ColKind; value: string }
export type Item = { id: string; day: string; cells: Cell[] }
export type Placement = Record<string, { pos: 'top' | 'bottom'; at: number }>
export type Plan = {
  id: string
  title: string
  tripDate: string
  sheetUrl: string
  spreadsheetId: string
  placement: Placement
  items: Item[]
  fetchedAt: number
}
export type Draft = { title: string; tripDate: string; sheetUrl: string }
