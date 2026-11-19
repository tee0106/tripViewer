import { parseItems } from './parse'
import type { Plan, RichCell } from './types'

export const demoHeaders = ['日期', '時間', '地點', '事件', '備註', '費用']
export const demoRows = [
  ['11/20', '08:30', '京都車站', '集合', '', ''],
  ['', '09:30', '清水寺', '參觀', '官網 https://www.kiyomizudera.or.jp/', ''],
  ['', '', '', '', '這列不該出現', ''],
  ['', '12:30', '', '午餐', '自行解決', '500'],
  ['', '14:00', '八坂神社', '', '', ''],
  ['11/21', '10:00', '伏見稻荷大社', '千本鳥居', '', ''],
  ['', '16:00', 'Nishiki Market', '逛街', '', ''],
]

export const demoPlan: Plan = {
  id: 'demo',
  title: '京都週末',
  tripDate: '2026-11-20',
  sheetUrl: '',
  spreadsheetId: '',
  placement: {},
  items: parseItems(demoHeaders, demoRows.map(row => row.map(cell => ({ text: cell } as unknown as RichCell)))),
  fetchedAt: 0,
}
