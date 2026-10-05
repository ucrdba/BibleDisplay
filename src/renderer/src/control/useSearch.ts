import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchQuery, WorkerReply } from '../../../shared/search'
import SearchWorker from './search.worker?worker'
import { INITIAL_SEARCH_STATE, SearchRunner, type SearchState, type WorkerLike } from './searchRunner'

function realWorker(): WorkerLike {
  const w = new SearchWorker()
  const like: WorkerLike = {
    postMessage: msg => w.postMessage(msg),
    terminate: () => w.terminate(),
    onmessage: null,
    onerror: null,
  }
  w.onmessage = e => like.onmessage?.({ data: e.data as WorkerReply })
  w.onerror = e => like.onerror?.(e)
  return like
}

/** Searches the Bible text in a worker; `retry` reloads the text after a failure. */
export function useSearch(query: SearchQuery): SearchState & { retry(): void } {
  const [state, setState] = useState<SearchState>(INITIAL_SEARCH_STATE)
  const runner = useRef<SearchRunner | null>(null)

  const load = useCallback(() => {
    const r = runner.current
    if (!r) return
    r.setLoading()
    window.bible.control.allVerses().then(
      verses => {
        if (runner.current === r) r.setVerses(verses)
      },
      () => {
        if (runner.current === r) r.setUnavailable()
      },
    )
  }, [])

  useEffect(() => {
    const r = new SearchRunner(realWorker, setState)
    runner.current = r
    load()
    return () => {
      r.dispose()
      runner.current = null
    }
  }, [load])

  useEffect(() => {
    runner.current?.setQuery({ text: query.text, mode: query.mode, scope: query.scope })
  }, [query.text, query.mode, query.scope])

  return { ...state, retry: load }
}
