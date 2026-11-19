import assert from 'node:assert/strict'
import { demoPlan } from '../src/demo.ts'
import { itemMatches, mapsQuery, orderItems, parseItems, visibleCells } from '../src/parse.ts'
import type { RichCell } from '../src/types.ts'

assert.equal(demoPlan.items.length, 6)
assert.equal(demoPlan.items.filter((item) => item.day === '11/20').length, 4)
assert.equal(demoPlan.items.filter((item) => item.day === '11/21').length, 2)
assert.ok(!demoPlan.items.some((item) => item.cells.some((cell) => cell.value.includes('不該出現'))))

const yasaka = demoPlan.items.find((item) => item.cells.some((cell) => cell.value === '八坂神社'))!
assert.equal(yasaka.day, '11/20')
assert.ok(!visibleCells(yasaka).some((cell) => cell.kind === 'date' || cell.header === '費用' || cell.header === '事件'))

const lunch = demoPlan.items.find((item) => item.cells.some((cell) => cell.value === '午餐'))!
assert.ok(visibleCells(lunch).some((cell) => cell.value === '500'))
assert.equal(mapsQuery('event', '午餐'), null)
assert.equal(mapsQuery('event', '參觀'), null)
assert.equal(mapsQuery('event', '千本鳥居'), '千本鳥居')
assert.equal(mapsQuery('place', '清水寺'), '清水寺')
assert.equal(mapsQuery('note', '官網 https://www.kiyomizudera.or.jp/'), null)
assert.equal(mapsQuery('meta', '500'), null)
assert.equal(mapsQuery('time', '08:30'), null)
assert.ok(itemMatches(lunch, '500'))
assert.equal(itemMatches(lunch, '八坂'), false)

const kiyomi = demoPlan.items.find((item) => item.cells.some((cell) => cell.value === '清水寺'))!
const day = orderItems(demoPlan.items, { [kiyomi.id]: { pos: 'bottom', at: 1 } }).filter((item) => item.day === '11/20')
assert.equal(day.at(-1)?.id, kiyomi.id)
const top = orderItems(demoPlan.items, {
  [kiyomi.id]: { pos: 'top', at: 1 },
  [yasaka.id]: { pos: 'top', at: 2 },
}).filter((item) => item.day === '11/20')
assert.equal(top[0].id, yasaka.id)
assert.equal(top[1].id, kiyomi.id)

const skipped = parseItems(['日期', '地點', '備註'], [[{ text: '5/1' } as unknown as RichCell, { text: '' } as unknown as RichCell, { text: '' } as unknown as RichCell], [{ text: '' } as unknown as RichCell, { text: '' } as unknown as RichCell, { text: '只有備註' } as unknown as RichCell], [{ text: '' } as unknown as RichCell, { text: '美術館' } as unknown as RichCell, { text: '' } as unknown as RichCell]])
assert.equal(skipped.length, 1)
assert.equal(skipped[0].day, '5/1')
assert.equal(skipped[0].cells.find((cell) => cell.kind === 'place')?.value, '美術館')

const early = parseItems(['日期', '地點'], [[{ text: '' } as unknown as RichCell, { text: '機場' } as unknown as RichCell], [{ text: '5/2' } as unknown as RichCell, { text: '美術館' } as unknown as RichCell]])
assert.equal(early[0].day, '')
assert.equal(early[1].day, '5/2')

const dups = parseItems(['地點'], [[{ text: '車站' } as unknown as RichCell], [{ text: '車站' } as unknown as RichCell]])
assert.equal(dups.length, 2)
assert.notEqual(dups[0].id, dups[1].id)

console.log('ok')
