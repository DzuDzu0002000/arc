// Vietnamese -> English machine translation for campaign text, via the free MyMemory API
// (https://mymemory.translated.net/doc/spec.php). Anonymous use allows ~5,000 characters a day,
// so this is best effort: any failure returns null and the viewer simply sees the original text.

const ENDPOINT = 'https://api.mymemory.translated.net/get'
// MyMemory rejects queries over 500 bytes; stay under it with UTF-8 Vietnamese (up to 3 bytes a letter).
const MAX_BYTES = 450

// Letters that only appear in Vietnamese; text without them is treated as already English.
const VIETNAMESE = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i

export function needsTranslation(text: string | null | undefined): text is string {
  return Boolean(text && VIETNAMESE.test(text))
}

const bytes = (s: string) => Buffer.byteLength(s, 'utf8')

/** Splits a line into pieces under MAX_BYTES, preferring sentence ends, then spaces. */
export function chunk(line: string): string[] {
  if (bytes(line) <= MAX_BYTES) return [line]
  const pieces: string[] = []
  let current = ''
  for (const word of line.split(/(?<=[.!?;:,])\s+|\s+/)) {
    const next = current ? `${current} ${word}` : word
    if (bytes(next) <= MAX_BYTES) { current = next; continue }
    if (current) pieces.push(current)
    // A single word longer than the limit (e.g. a long URL) is cut by characters.
    let rest = word
    while (bytes(rest) > MAX_BYTES) {
      let cut = MAX_BYTES / 3
      while (cut < rest.length && bytes(rest.slice(0, cut + 1)) <= MAX_BYTES) cut++
      pieces.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    current = rest
  }
  if (current) pieces.push(current)
  return pieces
}

async function translatePiece(text: string): Promise<string> {
  const url = `${ENDPOINT}?${new URLSearchParams({ q: text, langpair: 'vi|en' })}`
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  const payload = await response.json() as { responseStatus?: number | string; responseData?: { translatedText?: string }; quotaFinished?: boolean }
  const translated = payload.responseData?.translatedText
  if (!response.ok || Number(payload.responseStatus) !== 200 || payload.quotaFinished || !translated) {
    throw new Error(`MyMemory ${payload.responseStatus ?? response.status}`)
  }
  return translated
}

/** Translates Vietnamese text to English, keeping line breaks. Returns null if it is not Vietnamese or the service fails. */
export async function translateViToEn(text: string | null | undefined): Promise<string | null> {
  if (!needsTranslation(text)) return null
  try {
    const lines = await Promise.all(text.split('\n').map(async (line) => {
      if (!needsTranslation(line)) return line
      const parts = []
      for (const piece of chunk(line)) parts.push(await translatePiece(piece))
      return parts.join(' ')
    }))
    return lines.join('\n')
  } catch (error) {
    console.error('ARCHUNT_TRANSLATE_ERROR', (error as Error).message)
    return null
  }
}

export type CampaignText = { title: string; description: string; scopeIn: string; scopeOut: string | null; brief: string | null }
export type EnglishText = { title: string | null; description: string | null; scopeIn: string | null; scopeOut: string | null; brief: string | null }

/**
 * Fills English fields the project left empty with a machine translation of the Vietnamese original.
 * When editing, a field is re-translated if its original changed but its English copy was left as it was.
 */
export async function withEnglish(text: CampaignText, english: EnglishText, before?: { text: CampaignText; english: EnglishText }): Promise<EnglishText> {
  const keys = ['title', 'description', 'scopeIn', 'scopeOut', 'brief'] as const
  const out = { ...english }
  await Promise.all(keys.map(async (key) => {
    const stale = before && before.text[key] !== text[key] && english[key] === before.english[key]
    if (english[key] && !stale) return
    out[key] = (await translateViToEn(text[key])) ?? (stale ? null : english[key])
  }))
  return out
}
