/** 'floor' means the original audio, untranslated. It is never a TTS channel. */
export const FLOOR = 'floor' as const

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ur', label: 'اردو' },
  { code: 'ja', label: '日本語' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code
}
