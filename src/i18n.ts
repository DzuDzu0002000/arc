// Minimal i18n: UI text is written in Vietnamese and looked up here for English.
// `t('còn {n} ngày', { n: 3 })` -> "3 days left" in English, "còn 3 ngày" in Vietnamese.
// tests/i18n.test.ts fails if a t('…') string in src/ has no English entry.
import { en } from './i18n-en'

export type Lang = 'vi' | 'en'
const STORAGE_KEY = 'archunt.lang'

let current: Lang = initialLang()

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'vi' || saved === 'en') return saved
  } catch { /* storage blocked */ }
  return 'vi' // Vietnamese first; the VI | EN switch remembers the viewer's choice
}

export function getLang(): Lang {
  return current
}

/** Called by App when the viewer switches language; App then re-renders the whole tree. */
export function setLang(lang: Lang) {
  current = lang
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* storage blocked */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const template = current === 'en' ? en[text] ?? text : text
  return vars ? template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`)) : template
}

/** Locale for numbers and dates. */
export const locale = () => (current === 'en' ? 'en-US' : 'vi-VN')

if (typeof document !== 'undefined') document.documentElement.lang = current
