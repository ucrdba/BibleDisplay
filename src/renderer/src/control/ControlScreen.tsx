import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY_SELECTION, clickSelection, contextSelection, joinSelected, type ListSelection } from '../../../shared/listSelection'
import { parseReferences } from '../../../shared/parser'
import { stepScale, type Styles } from '../../../shared/styles'
import type { DisplayGroup, DisplayInfo, RefError, RefGroup, VerseRange } from '../../../shared/types'
import './control.css'
import { HelpPanel } from './HelpPanel'
import { ImportedList } from './ImportedList'
import { keyToAction } from './keys'
import { MonitorSelect } from './MonitorSelect'
import { PreviewPanel } from './PreviewPanel'
import { RecentList } from './RecentList'
import { ReferenceInput } from './ReferenceInput'
import type { ClickMods } from './SelectableList'
import { SelectedList } from './SelectedList'
import { StylePanel } from './StylePanel'
import { useBibleIndex } from './useBibleIndex'

const api = () => window.bible.control

export function ControlScreen() {
  const index = useBibleIndex()
  const [input, setInput] = useState('')
  const [errors, setErrors] = useState<RefError[]>([])
  const [refGroups, setRefGroups] = useState<RefGroup[]>([])
  const [groups, setGroups] = useState<DisplayGroup[]>([])
  const [blank, setBlank] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [imported, setImported] = useState<string[]>([])
  const [listSel, setListSel] = useState<{ list: 'imported' | 'recent'; sel: ListSelection }>({
    list: 'imported',
    sel: EMPTY_SELECTION,
  })
  const [importError, setImportError] = useState<string | null>(null)
  const [styles, setStyles] = useState<Styles | null>(null)
  const [fonts, setFonts] = useState<string[]>([])
  const [info, setInfo] = useState<DisplayInfo>({
    width: 1920,
    height: 1080,
    secondMonitor: true,
    monitors: [],
    chosenMonitorId: null,
    activeMonitorId: null,
  })
  const [helpOpen, setHelpOpen] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [selection, setSelection] = useState<VerseRange[]>([])

  const importedSelected = listSel.list === 'imported' ? listSel.sel.selected : []
  const recentSelected = listSel.list === 'recent' ? listSel.sel.selected : []
  const resetListSel = () => setListSel({ list: 'imported', sel: EMPTY_SELECTION })

  useEffect(() => {
    const a = api()
    void a.getStyles().then(setStyles)
    void a.listRecent().then(setRecent)
    void a.listImported().then(setImported)
    void a.listFonts().then(setFonts)
    void a.getDisplayInfo().then(setInfo)
    const offs = [a.onDisplayInfo(setInfo), a.onScrollPos(setScrollTop)]
    return () => offs.forEach(off => off())
  }, [])

  const present = useCallback(async (next: RefGroup[], nextBlank: boolean) => {
    const loaded = await api().loadGroups(next)
    setRefGroups(next)
    setGroups(loaded)
    setSelection([])
    api().present({ groups: loaded, blank: nextBlank })
  }, [])

  const show = async (text: string, recordRecent = true) => {
    if (!index) return
    const result = parseReferences(text, index)
    setErrors(result.errors)
    if (result.groups.length === 0) return
    await present(result.groups, blank)
    if (!recordRecent) return
    resetListSel()
    await api().addRecent(text)
    setRecent(await api().listRecent())
  }

  const clear = () => {
    setInput('')
    setErrors([])
    resetListSel()
    void present([], blank)
  }

  const removeGroup = (i: number) => void present(refGroups.filter((_, j) => j !== i), blank)

  const toggleBlank = () => {
    const next = !blank
    setBlank(next)
    api().present({ groups, blank: next })
  }

  const updateStyles = (next: Styles) => {
    setStyles(next)
    void api().setStyles(next)
  }

  const highlight = async (color: string) => {
    if (selection.length === 0) return
    await api().addHighlights(selection, color)
    window.getSelection()?.removeAllRanges()
    await present(refGroups, blank)
  }

  const removeHighlight = async () => {
    if (selection.length === 0) return
    await api().removeHighlights(selection)
    window.getSelection()?.removeAllRanges()
    await present(refGroups, blank)
  }

  const importList = async () => {
    const result = await api().importList()
    if (result.kind === 'canceled') return
    if (result.kind === 'error') {
      setImportError(result.message)
      return
    }
    resetListSel()
    setImportError(null)
    setImported(result.lines)
  }

  const clearImported = async () => {
    await api().clearImported()
    setImported([])
    resetListSel()
    setImportError(null)
  }

  type ListName = 'imported' | 'recent'
  const itemsOf = (list: ListName) => (list === 'imported' ? imported : recent)
  const baseSel = (list: ListName) => (listSel.list === list ? listSel.sel : EMPTY_SELECTION)

  const clickList = (list: ListName, index: number, mods: ClickMods) => {
    const next = clickSelection(baseSel(list), index, mods)
    setListSel({ list, sel: next })
    if (next.selected.length === 0) return
    const text = joinSelected(itemsOf(list), next.selected)
    setInput(text)
    setErrors([])
    void show(text, false)
  }

  const contextList = (list: ListName, index: number) => setListSel({ list, sel: contextSelection(baseSel(list), index) })

  const deleteFromList = async (list: ListName) => {
    const sel = baseSel(list).selected
    if (sel.length === 0) return
    if (list === 'imported') {
      await api().removeImported(sel)
      setImported(await api().listImported())
    } else {
      await api().removeRecent(sel.map(i => recent[i]))
      setRecent(await api().listRecent())
    }
    setListSel({ list, sel: EMPTY_SELECTION })
  }

  const importProblems = useMemo(
    () =>
      imported.map(line =>
        index ? parseReferences(line, index).errors.map(e => e.message).join('; ') || null : null,
      ),
    [imported, index],
  )

  const latest = useRef({ styles, toggleBlank, updateStyles, clear, helpOpen, setHelpOpen })
  latest.current = { styles, toggleBlank, updateStyles, clear, helpOpen, setHelpOpen }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The book menu handles its own keys (e.g. Esc closes it) and marks them handled.
      if (e.defaultPrevented) return
      const el = document.activeElement
      const inputFocused = !!el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
      const action = keyToAction({ key: e.key, ctrlKey: e.ctrlKey, inputFocused })
      const cur = latest.current
      if (cur.helpOpen) {
        if (action && (action.type === 'clear' || action.type === 'help')) {
          e.preventDefault()
          cur.setHelpOpen(false)
        }
        return
      }
      if (!action) return
      e.preventDefault()
      if (action.type === 'scroll') api().scroll(action.cmd)
      else if (action.type === 'scale') {
        if (cur.styles) cur.updateStyles({ ...cur.styles, scale: stepScale(cur.styles.scale, action.dir) })
      } else if (action.type === 'clear') cur.clear()
      else if (action.type === 'help') cur.setHelpOpen(true)
      else cur.toggleBlank()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="control">
      {!info.secondMonitor && info.chosenMonitorId === null && (
        <div className="banner">No second monitor detected — the display is showing in a window on this screen.</div>
      )}
      <div className="control__bar">
        <button type="button" className="btn help-btn" title="Help (F1)" onClick={() => setHelpOpen(true)}>
          ? Help
        </button>
      </div>
      <div className="control__panels">
        <aside className="panel panel--left">
          <h3 className="panel__title">Enter verses</h3>
          <ReferenceInput
            value={input}
            onChange={v => {
              setInput(v)
              setErrors([])
            }}
            onSubmit={() => void show(input)}
            errors={errors}
            index={index}
          />
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={() => void show(input)}>
              Show ▶
            </button>
            <button type="button" className="btn" onClick={clear}>
              Clear
            </button>
          </div>
          <SelectedList groups={refGroups} onRemove={removeGroup} />
          <ImportedList
            items={imported}
            problems={importProblems}
            selected={importedSelected}
            error={importError}
            onClick={(i, mods) => clickList('imported', i, mods)}
            onContext={i => contextList('imported', i)}
            onDelete={() => void deleteFromList('imported')}
            onImport={() => void importList()}
            onClear={() => void clearImported()}
          />
          <RecentList
            items={recent}
            selected={recentSelected}
            onClick={(i, mods) => clickList('recent', i, mods)}
            onContext={i => contextList('recent', i)}
            onDelete={() => void deleteFromList('recent')}
          />
        </aside>

        <main className="panel panel--middle">
          <h3 className="panel__title">Live preview</h3>
          {styles && (
            <PreviewPanel
              groups={groups}
              styles={styles}
              blank={blank}
              info={info}
              scrollTop={scrollTop}
              onScroll={cmd => api().scroll(cmd)}
              onSelect={setSelection}
              hasSelection={selection.length > 0}
              onHighlight={c => void highlight(c)}
              onRemoveHighlight={() => void removeHighlight()}
            />
          )}
        </main>

        <aside className="panel panel--right">
          <MonitorSelect monitors={info.monitors} chosenId={info.chosenMonitorId} onChange={id => void api().setDisplayMonitor(id)} />
          {styles && (
            <StylePanel
              styles={styles}
              fonts={fonts}
              onChange={updateStyles}
              blank={blank}
              onToggleBlank={toggleBlank}
              hasSelection={selection.length > 0}
              onHighlight={c => void highlight(c)}
              onRemoveHighlight={() => void removeHighlight()}
            />
          )}
        </aside>
      </div>
      {helpOpen && <HelpPanel version={__APP_VERSION__} onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
