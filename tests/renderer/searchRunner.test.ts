import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchRunner, TIMEOUT_NOTE, type SearchState, type WorkerLike } from '../../src/renderer/src/control/searchRunner'
import type { SearchHit, SearchQuery, SearchResult, VerseRow, WorkerReply, WorkerRequest } from '../../src/shared/search'

class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = []
  sent: WorkerRequest[] = []
  terminated = false
  onmessage: ((e: { data: WorkerReply }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(msg: WorkerRequest) {
    this.sent.push(msg)
  }
  terminate() {
    this.terminated = true
  }
  searches() {
    return this.sent.filter((m): m is Extract<WorkerRequest, { type: 'search' }> => m.type === 'search')
  }
  reply(id: number, result: SearchResult) {
    this.onmessage?.({ data: { id, result } })
  }
}

const VERSES: VerseRow[] = [[19, 23, 2, 'beside the still waters']]
const HIT: SearchHit = { bookId: 19, chapter: 23, verse: 2, text: 'beside the still waters', marks: [] }
const q = (text: string): SearchQuery => ({ text, mode: 'all', scope: 'bible' })
const ok = (hits: SearchHit[]): SearchResult => ({ kind: 'ok', total: hits.length, hits })

let states: SearchState[]
const last = () => states[states.length - 1]
const worker = () => FakeWorker.all[FakeWorker.all.length - 1]
const newRunner = () => new SearchRunner(() => new FakeWorker(), s => states.push(s))
const ready = () => {
  const r = newRunner()
  r.setVerses(VERSES)
  return r
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.all = []
  states = []
})
afterEach(() => vi.useRealTimers())

describe('SearchRunner', () => {
  it('sends the verses to a new worker and waits idle', () => {
    ready()
    expect(FakeWorker.all).toHaveLength(1)
    expect(worker().sent).toEqual([{ type: 'init', verses: VERSES }])
    expect(last().status).toBe('idle')
  })

  it('searches 250 ms after the last change', () => {
    const r = ready()
    r.setQuery(q('st'))
    vi.advanceTimersByTime(200)
    r.setQuery(q('still'))
    vi.advanceTimersByTime(200)
    expect(worker().searches()).toHaveLength(0)
    vi.advanceTimersByTime(50)
    expect(worker().searches().map(s => s.query.text)).toEqual(['still'])
    expect(last().status).toBe('searching')
  })

  it('reports results', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    worker().reply(worker().searches()[0].id, ok([HIT]))
    expect(last()).toEqual({ status: 'done', total: 1, hits: [HIT], note: null })
  })

  it('restarts the worker when a new search starts before the last one answers', () => {
    const r = ready()
    r.setQuery(q('a'))
    vi.advanceTimersByTime(250)
    r.setQuery(q('b'))
    vi.advanceTimersByTime(250)
    expect(FakeWorker.all).toHaveLength(2)
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(worker().sent[0]).toEqual({ type: 'init', verses: VERSES })
    expect(worker().searches().map(s => s.query.text)).toEqual(['b'])
  })

  it('ignores replies to older searches', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    worker().reply(999, ok([HIT]))
    expect(last().status).toBe('searching')
  })

  it('gives up after 1.5 s, restarts the worker, and says so', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250 + 1500)
    expect(FakeWorker.all).toHaveLength(2)
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(last()).toMatchObject({ status: 'done', note: TIMEOUT_NOTE })
  })

  it('treats a worker crash like a timeout', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    FakeWorker.all[0].onerror?.(new Error('boom'))
    expect(FakeWorker.all).toHaveLength(2)
    expect(last().note).toBe(TIMEOUT_NOTE)
  })

  it('keeps the previous results when the pattern is invalid', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    worker().reply(worker().searches()[0].id, ok([HIT]))
    r.setQuery(q('(still'))
    vi.advanceTimersByTime(250)
    worker().reply(worker().searches()[1].id, { kind: 'error', message: 'Invalid pattern: Unterminated group' })
    expect(last()).toEqual({ status: 'done', total: 1, hits: [HIT], note: 'Invalid pattern: Unterminated group' })
  })

  it('clears results for an empty query without searching', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    worker().reply(worker().searches()[0].id, ok([HIT]))
    r.setQuery(q('   '))
    vi.advanceTimersByTime(1000)
    expect(worker().searches()).toHaveLength(1)
    expect(last()).toEqual({ status: 'idle', total: 0, hits: [], note: null })
  })

  it('waits for the verses before searching, then searches at once', () => {
    const r = newRunner()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(300)
    expect(FakeWorker.all).toHaveLength(0)
    r.setVerses(VERSES)
    expect(worker().searches().map(s => s.query.text)).toEqual(['still'])
  })

  it('reports loading and unavailable', () => {
    const r = newRunner()
    r.setLoading()
    expect(last().status).toBe('loading')
    r.setUnavailable()
    expect(last().status).toBe('unavailable')
  })

  it('stops the worker and timers when disposed', () => {
    const r = ready()
    r.setQuery(q('still'))
    r.dispose()
    vi.advanceTimersByTime(5000)
    expect(worker().terminated).toBe(true)
    expect(worker().searches()).toHaveLength(0)
  })
})

describe('SearchRunner worker failures', () => {
  it('does not restart forever when every worker errors', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(300)
    for (let i = 0; i < 10; i++) worker().onerror?.({})
    expect(FakeWorker.all.length).toBeLessThanOrEqual(3)
    expect(last().status).toBe('unavailable')
    expect(worker().terminated).toBe(true)
  })

  it('ignores an error from a replaced worker', () => {
    const r = ready()
    const old = worker()
    r.setVerses(VERSES)
    const count = FakeWorker.all.length
    old.onerror?.({})
    expect(FakeWorker.all).toHaveLength(count)
    expect(last().status).toBe('idle')
  })

  it('does not show the timeout note for an idle worker error', () => {
    ready()
    worker().onerror?.({})
    expect(last().note).toBeNull()
    expect(last().status).not.toBe('unavailable')
  })

  it('resets the failure count after a successful reply, and on setVerses', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(300)
    worker().onerror?.({})
    r.setQuery(q('waters'))
    vi.advanceTimersByTime(300)
    worker().reply(worker().searches()[0].id, ok([HIT]))
    worker().onerror?.({})
    expect(last().status).not.toBe('unavailable')
    worker().onerror?.({})
    expect(last().status).toBe('unavailable')
    r.setVerses(VERSES)
    expect(last().status).toBe('searching')
    worker().onerror?.({})
    expect(last().status).not.toBe('unavailable')
  })

  it('goes unavailable when the worker constructor throws', () => {
    const states2: SearchState[] = []
    const r = new SearchRunner(() => { throw new Error('SecurityError') }, s => states2.push(s))
    expect(() => r.setVerses(VERSES)).not.toThrow()
    expect(states2[states2.length - 1].status).toBe('unavailable')
  })
})
