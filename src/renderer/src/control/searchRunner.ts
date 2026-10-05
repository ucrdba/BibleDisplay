import type { SearchHit, SearchQuery, VerseRow, WorkerReply, WorkerRequest } from '../../../shared/search'

/** The parts of a Web Worker the runner uses; tests pass a fake. */
export interface WorkerLike {
  postMessage(msg: WorkerRequest): void
  terminate(): void
  onmessage: ((e: { data: WorkerReply }) => void) | null
  onerror: ((e: unknown) => void) | null
}

export type SearchStatus = 'loading' | 'idle' | 'searching' | 'done' | 'unavailable'

export interface SearchState {
  status: SearchStatus
  total: number
  hits: SearchHit[]
  note: string | null
}

export const INITIAL_SEARCH_STATE: SearchState = { status: 'loading', total: 0, hits: [], note: null }
export const TIMEOUT_NOTE = 'Search took too long \u2014 try a simpler pattern'

/**
 * Runs searches in a worker: waits for typing to pause, and stops a search that is
 * superseded or runs too long by terminating the worker and starting a fresh one.
 */
export class SearchRunner {
  private verses: VerseRow[] | null = null
  private worker: WorkerLike | null = null
  private query: SearchQuery | null = null
  private nextId = 0
  private inFlight: number | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private timeout: ReturnType<typeof setTimeout> | null = null
  private state: SearchState = INITIAL_SEARCH_STATE

  constructor(
    private readonly makeWorker: () => WorkerLike,
    private readonly onState: (state: SearchState) => void,
    private readonly debounceMs = 250,
    private readonly timeoutMs = 1500,
  ) {}

  setLoading(): void {
    this.emit({ status: 'loading', total: 0, hits: [], note: null })
  }

  setUnavailable(): void {
    this.emit({ status: 'unavailable', total: 0, hits: [], note: null })
  }

  setVerses(verses: VerseRow[]): void {
    this.verses = verses
    this.inFlight = null
    this.clearTimeout()
    this.startWorker()
    if (this.hasText()) this.run()
    else this.emit({ status: 'idle', total: 0, hits: [], note: null })
  }

  setQuery(query: SearchQuery): void {
    this.query = query
    this.clearDebounce()
    if (!this.verses) return
    if (!this.hasText()) {
      this.cancel()
      this.emit({ status: 'idle', total: 0, hits: [], note: null })
      return
    }
    this.debounce = setTimeout(() => this.run(), this.debounceMs)
  }

  dispose(): void {
    this.clearDebounce()
    this.clearTimeout()
    this.worker?.terminate()
    this.worker = null
  }

  private hasText(): boolean {
    return !!this.query && this.query.text.trim() !== ''
  }

  private run(): void {
    this.debounce = null
    if (!this.query || !this.worker) return
    if (this.inFlight !== null) this.startWorker()
    const id = ++this.nextId
    this.inFlight = id
    this.worker.postMessage({ type: 'search', id, query: this.query })
    this.clearTimeout()
    this.timeout = setTimeout(() => this.fail(), this.timeoutMs)
    this.emit({ ...this.state, status: 'searching' })
  }

  private onReply(reply: WorkerReply): void {
    if (reply.id !== this.inFlight) return
    this.inFlight = null
    this.clearTimeout()
    const result = reply.result
    if (result.kind === 'ok') this.emit({ status: 'done', total: result.total, hits: result.hits, note: null })
    else this.emit({ ...this.state, status: 'done', note: result.message })
  }

  private fail(): void {
    this.inFlight = null
    this.clearTimeout()
    this.startWorker()
    this.emit({ ...this.state, status: 'done', note: TIMEOUT_NOTE })
  }

  private cancel(): void {
    if (this.inFlight === null) return
    this.inFlight = null
    this.clearTimeout()
    this.startWorker()
  }

  private startWorker(): void {
    this.worker?.terminate()
    const w = this.makeWorker()
    w.onmessage = e => this.onReply(e.data)
    w.onerror = () => this.fail()
    w.postMessage({ type: 'init', verses: this.verses ?? [] })
    this.worker = w
  }

  private clearDebounce(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
  }

  private clearTimeout(): void {
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = null
  }

  private emit(state: SearchState): void {
    this.state = state
    this.onState(state)
  }
}
