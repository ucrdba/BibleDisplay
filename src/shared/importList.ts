export const IMPORT_LIMIT = 500
export const IMPORT_MAX_BYTES = 1_048_576

/** Decodes a text file's raw bytes, detecting a UTF-16 byte-order mark; otherwise assumes UTF-8. */
export function decodeTextFile(buf: Uint8Array): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf.subarray(2))
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf.subarray(2))
  }
  return new TextDecoder('utf-8').decode(buf)
}

export function parseImportText(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .slice(0, IMPORT_LIMIT)
}
