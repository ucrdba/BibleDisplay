import type { PanelName } from './panels'
import type { SearchPrefs, VerseRow } from './search'
import type { Styles } from './styles'
import type {
  DisplayGroup,
  DisplayInfo,
  DisplayState,
  ImportResult,
  PrintResult,
  RefGroup,
  SaveResult,
  ScrollCommand,
  VerseCounts,
  VerseRange,
} from './types'

export type Unsubscribe = () => void

export interface ControlApi {
  verseCounts(): Promise<VerseCounts>
  allVerses(): Promise<VerseRow[]>
  getSearchPrefs(): Promise<SearchPrefs>
  setSearchPrefs(prefs: SearchPrefs): Promise<void>
  loadGroups(groups: RefGroup[]): Promise<DisplayGroup[]>
  getStyles(): Promise<Styles>
  setStyles(styles: Styles): Promise<void>
  addHighlights(ranges: VerseRange[], color: string): Promise<void>
  removeHighlights(ranges: VerseRange[]): Promise<void>
  addRecent(input: string): Promise<void>
  listRecent(): Promise<string[]>
  removeRecent(inputs: string[]): Promise<void>
  importList(): Promise<ImportResult>
  saveTextFile(suggestedName: string, content: string): Promise<SaveResult>
  printHtml(html: string): Promise<PrintResult>
  listImported(): Promise<string[]>
  clearImported(): Promise<void>
  removeImported(indices: number[]): Promise<void>
  listFonts(): Promise<string[]>
  getDisplayInfo(): Promise<DisplayInfo>
  setDisplayMonitor(id: number | null): Promise<void>
  getPanelCollapsed(panel: PanelName): Promise<boolean>
  setPanelCollapsed(panel: PanelName, collapsed: boolean): Promise<void>
  present(state: DisplayState): void
  scroll(cmd: ScrollCommand): void
  onDisplayInfo(cb: (info: DisplayInfo) => void): Unsubscribe
  onScrollPos(cb: (top: number) => void): Unsubscribe
}

export interface DisplayApi {
  ready(): Promise<{ state: DisplayState; styles: Styles }>
  onState(cb: (state: DisplayState) => void): Unsubscribe
  onStyles(cb: (styles: Styles) => void): Unsubscribe
  onScroll(cb: (cmd: ScrollCommand) => void): Unsubscribe
  reportScroll(top: number): void
}

export interface BibleApi {
  control: ControlApi
  display: DisplayApi
}
