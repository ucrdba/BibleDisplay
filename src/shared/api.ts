import type { Styles } from './styles'
import type {
  DisplayGroup,
  DisplayInfo,
  DisplayState,
  ImportResult,
  RefGroup,
  ScrollCommand,
  VerseCounts,
  VerseRange,
} from './types'

export type Unsubscribe = () => void

export interface ControlApi {
  verseCounts(): Promise<VerseCounts>
  loadGroups(groups: RefGroup[]): Promise<DisplayGroup[]>
  getStyles(): Promise<Styles>
  setStyles(styles: Styles): Promise<void>
  addHighlights(ranges: VerseRange[], color: string): Promise<void>
  removeHighlights(ranges: VerseRange[]): Promise<void>
  addRecent(input: string): Promise<void>
  listRecent(): Promise<string[]>
  importList(): Promise<ImportResult>
  listImported(): Promise<string[]>
  clearImported(): Promise<void>
  listFonts(): Promise<string[]>
  getDisplayInfo(): Promise<DisplayInfo>
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
