import { searchVerses, type VerseRow, type WorkerReply, type WorkerRequest } from '../../../shared/search'

let verses: VerseRow[] = []

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'init') {
    verses = msg.verses
    return
  }
  const reply: WorkerReply = { id: msg.id, result: searchVerses(verses, msg.query) }
  self.postMessage(reply)
}
