import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toVerseList, toVerseText } from '../../../shared/exportVerses'
import { EMPTY_SELECTION, clickSelection, contextSelection, joinSelected, type ListSelection } from '../../../shared/listSelection'
import { parseReferences } from '../../../shared/parser'
import { buildPrintHtml } from '../../../shared/printHtml'
import { DEFAULT_SEARCH_PREFS, hitReference, parseSearchPrefix, type SearchPrefs, type SearchQuery } from '../../../shared/search'
import { toReferenceText, type Passage } from '../../../shared/pickerSelection'
import { stepScale, type Styles } from '../../../shared/styles'
import type { DisplayGroup, DisplayInfo, RefError, RefGroup, VerseRange } from '../../../shared/types'
import { BrowsePanel } from './BrowsePanel'
import './control.css'
import { HelpPanel } from './HelpPanel'
import { ImportedList } from './ImportedList'
import { keyToAction } from './keys'
import { ListTabs, type ListTab } from './ListTabs'
import { MonitorSelect } from './MonitorSelect'
import { PreviewPanel } from './PreviewPanel'
import { RecentList } from './RecentList'
import { ReferenceInput } from './ReferenceInput'
import type { ClickMods } from './SelectableList'
import { SearchPanel } from './SearchPanel'
import { SelectedList } from './SelectedList'
import { SidePanel } from './SidePanel'
import { StylePanel } from './StylePanel'
import { useBibleIndex } from './useBibleIndex'
import { useSearch } from './useSearch'

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
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [browseCollapsed, setBrowseCollapsed] = useState(false)
  // Bumped whenever verses are shown some way other than the picker, so the picker jumps to them.
  const [browseJump, setBrowseJump] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [selection, setSelection] = useState<VerseRange[]>([])
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const saveNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listTab, setListTab] = useState<ListTab>('imported')
  const [searchText, setSearchText] = useState('')
  const [searchPrefs, setSearchPrefs] = useState<SearchPrefs>(DEFAULT_SEARCH_PREFS)
  const [searchSel, setSearchSel] = useState<ListSelection>(EMPTY_SELECTION)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchQuery = useMemo<SearchQuery>(() => ({ text: searchText, ...searchPrefs }), [searchText, searchPrefs])
  const search = useSearch(searchQuery)

  const importedSelected = listSel.list === 'imported' ? listSel.sel.selected : []
  const recentSelected = listSel.list === 'recent' ? listSel.sel.selected : []
  const resetListSel = () => setListSel({ list: 'imported', sel: EMPTY_SELECTION })

  useEffect(() => {
    const a = api()
    void a.getStyles().then(setStyles)
    void a.getSearchPrefs().then(setSearchPrefs)
    void a.listRecent().then(setRecent)
    void a.listImported().then(setImported)
    void a.listFonts().then(setFonts)
    void a.getDisplayInfo().then(setInfo)
    void a.getPanelCollapsed('settings').then(setPanelCollapsed)
    void a.getPanelCollapsed('browse').then(setBrowseCollapsed)
    const offs = [a.onDisplayInfo(setInfo), a.onScrollPos(setScrollTop)]
    return () => offs.forEach(off => off())
  }, [])

  // New results invalidate the old selection.
  useEffect(() => setSearchSel(EMPTY_SELECTION), [search.hits])

  // Opening the Search tab retries loading the Bible text if it failed.
  useEffect(() => {
    if (listTab === 'search' && search.status === 'unavailable') search.retry()
  }, [listTab])

  const present = useCallback(async (next: RefGroup[], nextBlank: boolean) => {
    const loaded = await api().loadGroups(next)
    setRefGroups(next)
    setGroups(loaded)
    setSelection([])
    api().present({ groups: loaded, blank: nextBlank })
  }, [])

  const show = async (text: string, recordRecent = true, fromPicker = false) => {
    if (!index) return
    const result = parseReferences(text, index)
    setErrors(result.errors)
    if (result.groups.length === 0) return
    await present(result.groups, blank)
    if (!fromPicker) setBrowseJump(n => n + 1)
    if (!recordRecent) return
    resetListSel()
    await api().addRecent(text)
    setRecent(await api().listRecent())
  }

  const clear = () => {
    setInput('')
    setErrors([])
    resetListSel()
    void present([], blank).then(() => setBrowseJump(n => n + 1))
  }

  // Saves what is on screen (not the verse box text) as a Recent entry.
  const addShownToRecent = async () => {
    if (refGroups.length === 0) return
    await api().addRecent(toReferenceText(refGroups))
    setRecent(await api().listRecent())
  }

  const removeGroup = (i: number) => {
    void present(refGroups.filter((_, j) => j !== i), blank).then(() => setBrowseJump(n => n + 1))
  }

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

  const updateSearchPrefs = (patch: Partial<SearchPrefs>) => {
    const next = { ...searchPrefs, ...patch }
    setSearchPrefs(next)
    void api().setSearchPrefs(next)
  }

  const openSearch = (text?: string) => {
    if (text !== undefined) setSearchText(text)
    setListTab('search')
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }

  // The main box: `?words` or `/pattern/` opens Search; anything else is references.
  const submitInput = () => {
    const prefix = parseSearchPrefix(input)
    if (!prefix) {
      void show(input)
      return
    }
    updateSearchPrefs({ mode: prefix.mode })
    openSearch(prefix.text)
  }

  const showHits = (indices: number[]) => {
    const text = indices
      .map(i => search.hits[i])
      .filter(h => h !== undefined)
      .map(hitReference)
      .join(', ')
    if (!text) return
    resetListSel()
    setSearchSel(EMPTY_SELECTION)
    setInput(text)
    setErrors([])
    void show(text, false)
  }

  const clickSearch = (index: number, mods: ClickMods) => {
    const next = clickSelection(searchSel, index, mods)
    setSearchSel(next)
    showHits(next.selected)
  }

  const submitSearch = () => showHits(searchSel.selected.length > 0 ? searchSel.selected : [0])

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

  const notify = (message: string) => {
    if (saveNoticeTimer.current) clearTimeout(saveNoticeTimer.current)
    setSaveNotice(message)
    saveNoticeTimer.current = setTimeout(() => setSaveNotice(null), 4000)
  }

  const save = async (suggestedName: string, content: string) => {
    const result = await api().saveTextFile(suggestedName, content)
    if (result.kind === 'canceled') return
    notify(result.kind === 'saved' ? `Saved: ${result.fileName}` : `Could not save: ${result.message}`)
  }

  const saveList = () => void save('Verse list.txt', toVerseList(groups))
  const saveText = () => void save('Verse text.txt', toVerseText(groups))

  const print = async () => {
    if (!styles) return
    const html = buildPrintHtml(groups, { heading: styles.heading.font, verse: styles.verse.font })
    const result = await api().printHtml(html)
    if (result.kind === 'error') notify(`Could not print: ${result.message}`)
  }

  const togglePanel = () => {
    const next = !panelCollapsed
    setPanelCollapsed(next)
    void api().setPanelCollapsed('settings', next)
  }

  const toggleBrowse = () => {
    const next = !browseCollapsed
    setBrowseCollapsed(next)
    void api().setPanelCollapsed('browse', next)
  }

  // The picker produced a new selection: write it to the verse box and show it (not added to Recent).
  const pickVerses = (next: Passage[]) => {
    if (next.length === 0) {
      clear()
      return
    }
    const text = toReferenceText(next)
    resetListSel()
    setSearchSel(EMPTY_SELECTION)
    setInput(text)
    setErrors([])
    void show(text, false, true)
  }

  const clearRecent = async () => {
    await api().clearRecent()
    setRecent(await api().listRecent())
    if (listSel.list === 'recent') resetListSel()
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

  const latest = useRef({ styles, toggleBlank, updateStyles, clear, helpOpen, setHelpOpen, openSearch })
  latest.current = { styles, toggleBlank, updateStyles, clear, helpOpen, setHelpOpen, openSearch }

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
      else if (action.type === 'search') cur.openSearch()
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
      <div
        className={`control__panels${panelCollapsed ? ' control__panels--settings-collapsed' : ''}${
          browseCollapsed ? ' control__panels--browse-collapsed' : ''
        }`}
      >
        <aside className="panel panel--left">
          <h3 className="panel__title">Enter verses</h3>
          <ReferenceInput
            value={input}
            onChange={v => {
              setInput(v)
              setErrors([])
            }}
            onSubmit={submitInput}
            errors={errors}
            index={index}
          />
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={submitInput}>
              Show ▶
            </button>
            <button type="button" className="btn" onClick={clear}>
              Clear
            </button>
          </div>
          <SelectedList groups={refGroups} onRemove={removeGroup} />
          <ListTabs active={listTab} onChange={setListTab} />
          {listTab === 'imported' && (
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
          )}
          {listTab === 'recent' && (
            <RecentList
              items={recent}
              selected={recentSelected}
              onClick={(i, mods) => clickList('recent', i, mods)}
              onContext={i => contextList('recent', i)}
              onDelete={() => void deleteFromList('recent')}
              onClear={() => void clearRecent()}
            />
          )}
          {listTab === 'search' && (
            <SearchPanel
              inputRef={searchInputRef}
              text={searchText}
              mode={searchPrefs.mode}
              scope={searchPrefs.scope}
              state={search}
              selected={searchSel.selected}
              onText={setSearchText}
              onMode={mode => updateSearchPrefs({ mode })}
              onScope={scope => updateSearchPrefs({ scope })}
              onClick={clickSearch}
              onSubmit={submitSearch}
            />
          )}
        </aside>

        <SidePanel side="left" label="Browse" className="panel--browse" collapsed={browseCollapsed} onToggle={toggleBrowse}>
          <h3 className="panel__title">Browse</h3>
          <BrowsePanel index={index} passages={refGroups} jumpSignal={browseJump} onChange={pickVerses} />
        </SidePanel>

        <main className="panel panel--middle">
          <h3 className="panel__title">
            Live preview {saveNotice && <span className="save-notice">{saveNotice}</span>}
          </h3>
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
              canSave={groups.length > 0}
              onSaveList={saveList}
              onSaveText={saveText}
              onPrint={() => void print()}
              onAddRecent={() => void addShownToRecent()}
              onClear={clear}
            />
          )}
        </main>

        <SidePanel side="right" label="settings" className="panel--right" collapsed={panelCollapsed} onToggle={togglePanel}>
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
        </SidePanel>
      </div>
      {helpOpen && <HelpPanel version={__APP_VERSION__} onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
