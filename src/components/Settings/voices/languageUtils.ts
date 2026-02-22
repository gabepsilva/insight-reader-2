/**
 * Top 8 languages in the world by total speakers (native + L2).
 * Order: English, Chinese (zh/cmn), Hindi, Spanish, French, Arabic, German, Portuguese.
 * Each family can have one or more prefixes (zh + cmn = Chinese).
 */
export const TOP_LANGUAGE_PREFIXES = ['en', 'zh', 'cmn', 'hi', 'es', 'fr', 'ar', 'de', 'pt'] as const;

/** One entry per language family for the "Most used languages" section (same 8 for all providers). */
export const TOP_LANGUAGE_FAMILIES: readonly (readonly string[])[] = [
  ['en'],
  ['zh', 'cmn'],
  ['hi'],
  ['es'],
  ['fr'],
  ['ar'],
  ['de'],
  ['pt'],
];

function getBase(code: string): string {
  return code.replace(/_/g, '-').toLowerCase().split('-')[0];
}

function getTopLanguagePriority(code: string): number {
  const base = getBase(code);
  const idx = TOP_LANGUAGE_PREFIXES.indexOf(base as (typeof TOP_LANGUAGE_PREFIXES)[number]);
  return idx === -1 ? TOP_LANGUAGE_PREFIXES.length : idx;
}

/** True if the language code is one of the top 8 global languages. */
export function isMostUsedLanguage(code: string): boolean {
  return getTopLanguagePriority(code) < TOP_LANGUAGE_PREFIXES.length;
}

/**
 * Returns at most 8 items from the list: one per top language family (en, zh/cmn, hi, es, fr, ar, de, pt).
 * Same order for all providers. Uses the first matching locale per family in the given list.
 */
export function getMostUsedLanguagesForSection<T>(
  items: T[],
  getCode: (item: T) => string
): T[] {
  const result: T[] = [];
  for (const family of TOP_LANGUAGE_FAMILIES) {
    const found = items.find((item) => family.includes(getBase(getCode(item))));
    if (found) result.push(found);
  }
  return result;
}

/**
 * Sorts a language list so the top 8 global languages appear first,
 * then the rest alphabetically by name.
 */
export function sortLanguagesWithTopFirst<T>(
  items: T[],
  getCode: (item: T) => string,
  getName: (item: T) => string
): T[] {
  return [...items].sort((a, b) => {
    const pa = getTopLanguagePriority(getCode(a));
    const pb = getTopLanguagePriority(getCode(b));
    if (pa !== pb) return pa - pb;
    return getName(a).localeCompare(getName(b));
  });
}

export function getCountryFlag(langCode: string): string {
  const normalizedCode = langCode.replace(/_/g, '-');
  const flagMap: Record<string, string> = {
    // English
    'en-US': '🇺🇸', 'en-GB': '🇬🇧', 'en-AU': '🇦🇺', 'en-CA': '🇨🇦',
    'en-IN': '🇮🇳', 'en-IE': '🇮🇪', 'en-NZ': '🇳🇿', 'en-ZA': '🇿🇦',
    'en-SG': '🇸🇬', 'en-HK': '🇭🇰', 'en-KE': '🇰🇪', 'en-NG': '🇳🇬',
    'en-TZ': '🇹🇿', 'en-PH': '🇵🇭',
    // Spanish
    'es-ES': '🇪🇸', 'es-MX': '🇲🇽', 'es-AR': '🇦🇷', 'es-CO': '🇨🇴',
    'es-CL': '🇨🇱', 'es-PE': '🇵🇪', 'es-VE': '🇻🇪', 'es-CU': '🇨🇺',
    // French
    'fr-FR': '🇫🇷', 'fr-CA': '🇨🇦', 'fr-BE': '🇧🇪', 'fr-CH': '🇨🇭',
    // German
    'de-DE': '🇩🇪', 'de-AT': '🇦🇹', 'de-CH': '🇨🇭',
    // Portuguese
    'pt-BR': '🇧🇷', 'pt-PT': '🇵🇹',
    // Italian
    'it-IT': '🇮🇹',
    // Russian & Eastern European
    'ru-RU': '🇷🇺', 'pl-PL': '🇵🇱', 'nl-NL': '🇳🇱', 'nl-BE': '🇧🇪',
    'sv-SE': '🇸🇪', 'da-DK': '🇩🇰', 'no-NO': '🇳🇴', 'fi-FI': '🇫🇮',
    'cs-CZ': '🇨🇿', 'hu-HU': '🇭🇺', 'ro-RO': '🇷🇴', 'sk-SK': '🇸🇰',
    'uk-UA': '🇺🇦', 'el-GR': '🇬🇷', 'tr-TR': '🇹🇷',
    // Asian
    'zh-CN': '🇨🇳', 'zh-TW': '🇹🇼', 'zh-HK': '🇭🇰',
    'zh-SG': '🇸🇬', 'zh-MY': '🇲🇾', 'zh-MO': '🇲🇴',
    'zh-Hans': '🇨🇳', 'zh-Hant': '🇹🇼',
    'yue-HK': '🇭🇰', 'yue-CN': '🇨🇳',
    'cmn-CN': '🇨🇳', 'cmn-TW': '🇹🇼', 'cmn-HK': '🇭🇰',
    'wuu-CN': '🇨🇳', 'dta-CN': '🇨🇳', 'ug-CN': '🇨🇳',
    'lzh-CN': '🇨🇳', 'yue': '🇭🇰', 'cmn': '🇨🇳', 'zh': '🇨🇳',
    'ja-JP': '🇯🇵', 'ko-KR': '🇰🇷', 'ko-KP': '🇰🇵',
    'hi-IN': '🇮🇳', 'th-TH': '🇹🇭', 'vi-VN': '🇻🇳',
    'id-ID': '🇮🇩', 'ms-MY': '🇲🇾', 'fil-PH': '🇵🇭',
    // Middle Eastern
    'ar-SA': '🇸🇦', 'ar-AE': '🇦🇪', 'ar-EG': '🇪🇬', 'ar-IQ': '🇮🇶',
    'ar-JO': '🇯🇴', 'ar-KW': '🇰🇼', 'ar-LB': '🇱🇧', 'ar-LY': '🇱🇾',
    'ar-MA': '🇲🇦', 'ar-OM': '🇴🇲', 'ar-QA': '🇶🇦', 'ar-SY': '🇸🇾',
    'ar-TN': '🇹🇳', 'ar-YE': '🇾🇪', 'ar-BH': '🇧🇭', 'ar-DZ': '🇩🇿',
    'he-IL': '🇮🇱', 'fa-IR': '🇮🇷',
    // South Asian
    'bn-BD': '🇧🇩', 'bn-IN': '🇮🇳', 'my-MM': '🇲🇲',
    'km-KH': '🇰🇭', 'lo-LA': '🇱🇦',
    'gu-IN': '🇮🇳', 'kn-IN': '🇮🇳', 'ta-IN': '🇮🇳', 'te-IN': '🇮🇳',
    'mr-IN': '🇮🇳', 'pa-IN': '🇮🇳', 'ml-IN': '🇮🇳', 'si-LK': '🇱🇰',
    'ne-NP': '🇳🇵', 'dv-MV': '🇲🇻',
    // Nordic & Baltic
    'is-IS': '🇮🇸', 'lv-LV': '🇱🇻', 'lt-LT': '🇱🇹', 'et-EE': '🇪🇪',
    // Eastern European
    'bg-BG': '🇧🇬', 'hr-HR': '🇭🇷', 'sr-RS': '🇷🇸', 'sl-SI': '🇸🇮',
    'mk-MK': '🇲🇰', 'bs-BA': '🇧🇦',
    // African
    'af-ZA': '🇿🇦', 'sw-KE': '🇰🇪', 'sw-TZ': '🇹🇿', 'zu-ZA': '🇿🇦',
    'ha-NG': '🇳🇬', 'yo-NG': '🇳🇬', 'ig-NG': '🇳🇬',
    'am-ET': '🇪🇹', 'ti-ER': '🇪🇷', 'om-ET': '🇪🇹', 'so-SO': '🇸🇴',
    // Central Asian
    'mn-MN': '🇲🇳', 'kk-KZ': '🇰🇿', 'uz-UZ': '🇺🇿', 'tg-TJ': '🇹🇯',
    'ky-KG': '🇰🇬', 'tk-TM': '🇹🇲',
    // Other European
    'ca-ES': '🇪🇸', 'eu-ES': '🇪🇸', 'gl-ES': '🇪🇸', 'cy-GB': '🇬🇧',
    'ga-IE': '🇮🇪', 'mt-MT': '🇲🇹',
    // Special
    'iu-Latn-CA': '🇨🇦', 'iu-Cans-CA': '🇨🇦',
  };

  if (flagMap[normalizedCode]) {
    return flagMap[normalizedCode];
  }

  const lang = normalizedCode.split('-')[0];
  if (lang === 'zh' || lang === 'yue' || lang === 'cmn' || lang === 'wuu' || lang === 'lzh') {
    return '🇨🇳';
  }

  const region = normalizedCode.split('-')[1];
  if (region && region.length === 2) {
    const codePoints = [...region.toUpperCase()]
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  return '🌍';
}

export function formatLanguageCode(code: string): string {
  const normalizedCode = code.replace(/_/g, '-');
  const [language, region] = normalizedCode.split('-');

  const fallback = region
    ? `${language.toUpperCase()} (${region.toUpperCase()})`
    : language.toUpperCase();

  try {
    const languageDisplay = new Intl.DisplayNames(['en'], { type: 'language' }).of(language);
    if (!languageDisplay) {
      return fallback;
    }

    if (!region) {
      return languageDisplay;
    }

    const regionDisplay = new Intl.DisplayNames(['en'], { type: 'region' }).of(region.toUpperCase());
    return regionDisplay ? `${languageDisplay} (${regionDisplay})` : `${languageDisplay} (${region.toUpperCase()})`;
  } catch {
    return fallback;
  }
}
