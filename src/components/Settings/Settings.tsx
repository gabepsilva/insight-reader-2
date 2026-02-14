import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './Settings.css';

const VoiceProviderIcon = ({ provider }: { provider: string }) => {
  if (provider === 'piper') {
    return (
      <svg className="provider-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    );
  }
  if (provider === 'polly') {
    return (
      <svg className="provider-icon aws-icon" viewBox="0 0 304 182">
        <path fill="#FF9900" d="M273.5,143.7c-32.9,24.3-80.7,37.2-121.8,37.2c-57.6,0-109.5-21.3-148.7-56.7c-3.1-2.8-0.3-6.6,3.4-4.4 c42.4,24.6,94.7,39.5,148.8,39.5c36.5,0,76.6-7.6,113.5-23.2C274.2,133.6,278.9,139.7,273.5,143.7z"/>
        <path fill="#252F3E" d="M86.4,66.4c0,3.7,0.4,6.7,1.1,8.9c0.8,2.2,1.8,4.6,3.2,7.2c0.5,0.8,0.7,1.6,0.7,2.3c0,1-0.6,2-1.9,3 l-6.3,4.2c-0.9,0.6-1.8,0.9-2.6,0.9c-1,0-2-0.5-3-1.4C76.2,90,75,88.4,74,86.8c-1-1.7-2-3.6-3.1-5.9 c-7.8,9.2-17.6,13.8-29.4,13.8c-8.4,0-15.1-2.4-20-7.2c-4.9-4.8-7.4-11.2-7.4-19.2c0-8.5,3-15.4,9.1-20.6 c6.1-5.2,14.2-7.8,24.5-7.8c3.4,0,6.9,0.3,10.6,0.8c3.7,0.5,7.5,1.3,11.5,2.2v-7.3c0-7.6-1.6-12.9-4.7-16 c-3.2-3.1-8.6-4.6-16.3-4.6c-3.5,0-7.1,0.4-10.8,1.3c-3.7,0.9-7.3,2-10.8,3.4c-1.6,0.7-2.8,1.1-3.5,1.3 c-0.7,0.2-1.2,0.3-1.6,0.3c-1.4,0-2.1-1-2.1-3.1v-4.9c0-1.6,0.2-2.8,0.7-3.5c0.5-0.7,1.4-1.4,2.8-2.1 c3.5-1.8,7.7-3.3,12.6-4.5c4.9-1.3,10.1-1.9,15.6-1.9c11.9,0,20.6,2.7,26.2,8.1c5.5,5.4,8.3,13.6,8.3,24.6V66.4z M45.8,81.6c3.3,0,6.7-0.6,10.3-1.8c3.6-1.2,6.8-3.4,9.5-6.4c1.6-1.9,2.8-4,3.4-6.4c0.6-2.4,1-5.3,1-8.7v-4.2c-2.9-0.7-6-1.3-9.2-1.7 c-3.2-0.4-6.3-0.6-9.4-0.6c-6.7,0-11.6,1.3-14.9,4c-3.3,2.7-4.9,6.5-4.9,11.5c0,4.7,1.2,8.2,3.7,10.6 C37.7,80.4,41.2,81.6,45.8,81.6z"/>
        <path fill="#FF9900" d="M287.2,128.1c-4.2-5.4-27.8-2.6-38.5-1.3c-3.2,0.4-3.7-2.4-0.8-4.5c18.8-13.2,49.7-9.4,53.3-5 c3.6,4.5-1,35.4-18.6,50.2c-2.7,2.3-5.3,1.1-4.1-1.9C282.5,155.7,291.4,133.4,287.2,128.1z"/>
      </svg>
    );
  }
  return (
    <svg className="provider-icon microsoft-icon" viewBox="0 0 72 72">
      <rect fill="#F25022" width="34.2" height="34.2"/>
      <rect x="37.8" fill="#7FBA00" width="34.2" height="34.2"/>
      <rect y="37.8" fill="#00A4EF" width="34.2" height="34.2"/>
      <rect x="37.8" y="37.8" fill="#FFB900" width="34.2" height="34.2"/>
    </svg>
  );
};

interface Config {
  voice_provider: string | null;
  log_level: string | null;
  selected_voice: string | null;
  selected_polly_voice: string | null;
  selected_microsoft_voice: string | null;
  ocr_backend: string | null;
  hotkey_enabled: boolean | null;
  hotkey_modifiers: string | null;
  hotkey_key: string | null;
}

interface HotkeyStatus {
  mode: string;
  session_type: string;
  enabled: boolean;
  native_active: boolean;
  read_shortcut: string;
  pause_shortcut: string;
  last_error: string | null;
}

type Tab = 'general' | 'voices' | 'about';

function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('voices');
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTooltipLeave = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 250);
  };

  const handleTooltipEnter = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    setShowTooltip(true);
  };

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof console === 'undefined') return;
    const originalError = console.error;
    console.error = (...args) => {
      originalError.apply(console, args);
      const msg = args.map(a => {
        try {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        } catch {
          return '[unserializable]';
        }
      }).join(' ');
      setErrors(prev => [...prev, msg].slice(-5));
    };
    return () => { console.error = originalError; };
  }, []);

  useEffect(() => {
    loadConfig();
    
    const unlisten = listen('open-settings', () => {
      // Already open
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen('config-changed', () => {
      loadConfig();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const loadConfig = async () => {
    try {
      const [cfg, status] = await Promise.all([
        invoke<Config>('get_config'),
        invoke<HotkeyStatus>('get_hotkey_status'),
      ]);
      setConfig(cfg);
      setHotkeyStatus(status);
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  };

  const saveConfig = async (newConfig: Config) => {
    if (!config) return;
    setMessage(null);
    try {
      await invoke('save_config', { configJson: JSON.stringify(newConfig) });
      setConfig(newConfig);
      setMessage('Settings saved');
      setTimeout(() => setMessage(null), 2000);
    } catch (e) {
      console.error('Failed to save config:', e);
      setMessage('Failed to save settings');
    }
  };

  const updateConfig = (updates: Partial<Config>) => {
    if (!config) return;
    saveConfig({ ...config, ...updates });
  };

  const handleClose = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  };

  if (!config) {
    return <div className="settings-loading">Loading...</div>;
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        {errors.length > 0 && (
          <div 
            className="settings-error-indicator"
            onMouseEnter={handleTooltipEnter}
            onMouseLeave={handleTooltipLeave}
          >
            <svg viewBox="0 0 24 24">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            {showTooltip && (
              <div className="error-tooltip">
                <button 
                  className="copy-errors-btn"
                  onClick={() => navigator.clipboard.writeText(errors.join('\n'))}
                >
                  Copy
                </button>
                {errors.map((err, i) => <div key={i}>{err}</div>)}
              </div>
            )}
          </div>
        )}
        <button className="close-button" onClick={handleClose}>×</button>
      </div>

      <div className="settings-tabs">
        <button 
          className={`tab ${activeTab === 'voices' ? 'active' : ''}`}
          onClick={() => setActiveTab('voices')}
        >
          Voices
        </button>
        <button 
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button 
          className={`tab ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          About
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'general' && (
          <GeneralTab config={config} onChange={updateConfig} hotkeyStatus={hotkeyStatus} />
        )}
        {activeTab === 'voices' && (
          <VoicesTab config={config} onChange={updateConfig} />
        )}
        {activeTab === 'about' && <AboutTab />}
      </div>

      {message && <div className="settings-message">{message}</div>}
    </div>
  );
}

function GeneralTab({
  config,
  onChange,
  hotkeyStatus,
}: {
  config: Config;
  onChange: (updates: Partial<Config>) => void;
  hotkeyStatus: HotkeyStatus | null;
}) {
  const readShortcut = hotkeyStatus?.read_shortcut || `${config.hotkey_modifiers || 'control'}+${config.hotkey_key || 'r'}`;
  const pauseShortcut = hotkeyStatus?.pause_shortcut || `${config.hotkey_modifiers || 'control'}+shift+${config.hotkey_key || 'r'}`;

  const modeHelp = hotkeyStatus?.mode === 'wayland-compositor'
    ? 'Wayland session detected: configure your compositor shortcut to run `insight-reader action read-selected`.'
    : hotkeyStatus?.native_active
      ? `Global shortcuts are active in-app: ${readShortcut} (read), ${pauseShortcut} (pause/resume).`
      : 'Global shortcuts are currently not active in-app.';

  return (
    <div className="tab-content">
      <div className="setting-group">
        <label>
          <input 
            type="checkbox"
            checked={config.hotkey_enabled ?? true}
            onChange={(e) => onChange({ hotkey_enabled: e.target.checked })}
          />
          Enable Global Hotkey
        </label>
      </div>

      <div className="setting-group">
        <label>Hotkey</label>
        <input 
          type="text"
          value={readShortcut}
          disabled
          className="hotkey-input"
        />
        <p className="setting-help">
          {modeHelp}
        </p>
        <p className="setting-help">
          Secondary: {pauseShortcut} ({hotkeyStatus?.mode === 'wayland-compositor' ? 'map this to `insight-reader action pause` in your compositor' : 'pause/resume'})
        </p>
        {hotkeyStatus?.last_error && <p className="setting-help">Hotkey error: {hotkeyStatus.last_error}</p>}
      </div>

      <div className="setting-group">
        <label>Log Level</label>
        <select 
          value={config.log_level || 'info'}
          onChange={(e) => onChange({ log_level: e.target.value })}
        >
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
      </div>

      <div className="setting-group">
        <div className="setting-label-with-info">
          <label>OCR Backend</label>
          <span className="setting-info-icon" aria-label="Future feature">
            i
            <span className="setting-info-tooltip">Future feature</span>
          </span>
        </div>
        <select 
          value={config.ocr_backend || 'default'}
          onChange={(e) => onChange({ ocr_backend: e.target.value })}
          disabled
        >
          <option value="default">Default</option>
          <option value="better_ocr">Better OCR</option>
        </select>
        <p className="setting-help">Read and copy text directly from images.</p>
      </div>
    </div>
  );
}

function VoicesTab({ config, onChange }: { config: Config; onChange: (updates: Partial<Config>) => void }) {
  const [piperVoices, setPiperVoices] = useState<any[]>([]);
  const [pollyVoices, setPollyVoices] = useState<any[]>([]);
  const [microsoftVoices, setMicrosoftVoices] = useState<any[]>([]);
  const [piperLanguages, setPiperLanguages] = useState<{code: string; name: string; flag: string}[]>([]);
  const [selectedPollyLanguage, setSelectedPollyLanguage] = useState<string>('');
  const [pollyModalLanguage, setPollyModalLanguage] = useState<string | null>(null);
  const [selectedPiperLanguage, setSelectedPiperLanguage] = useState<string>('');
  const [piperModalLanguage, setPiperModalLanguage] = useState<string | null>(null);
  const [microsoftLanguages, setMicrosoftLanguages] = useState<{code: string; name: string}[]>([]);
  const [selectedMicrosoftLanguage, setSelectedMicrosoftLanguage] = useState<string>('');
  const [microsoftModalLanguage, setMicrosoftModalLanguage] = useState<string | null>(null);
  const [loadingPiper, setLoadingPiper] = useState(false);
  const [loadingPolly, setLoadingPolly] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadedVoices, setDownloadedVoices] = useState<string[]>([]);

  useEffect(() => {
    loadVoices();
    loadDownloadedVoices();
  }, []);

  useEffect(() => {
    if (piperVoices.length > 0) {
      const langMap = new Map<string, { name: string; flag: string }>();
      piperVoices.forEach((voice: any) => {
        if (!langMap.has(voice.language.code)) {
          langMap.set(voice.language.code, {
            name: voice.language.name_english,
            flag: getCountryFlag(voice.language.code)
          });
        }
      });
      const langs = Array.from(langMap.entries())
        .map(([code, { name, flag }]) => ({ code, name, flag }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setPiperLanguages(langs);
    }
  }, [piperVoices]);

  useEffect(() => {
    if (microsoftVoices.length > 0) {
      const langMap = new Map<string, string>();
      microsoftVoices.forEach((voice: any) => {
        if (!langMap.has(voice.language_code)) {
          langMap.set(voice.language_code, voice.language_code);
        }
      });
      const langs = Array.from(langMap.entries())
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setMicrosoftLanguages(langs);
      if (!selectedMicrosoftLanguage && langs.length > 0) {
        setSelectedMicrosoftLanguage(langs[0].code);
      }
    }
  }, [microsoftVoices]);

  const getCountryFlag = (langCode: string): string => {
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
  };

  const formatLanguageCode = (code: string): string => {
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
  };

  const pollyVoicesByLanguage = useMemo(() => {
    const groups = new Map<string, any[]>();

    for (const voice of pollyVoices) {
      if (!voice?.id || !voice?.language_code || voice.engine !== 'Neural') {
        continue;
      }

      if (!groups.has(voice.language_code)) {
        groups.set(voice.language_code, []);
      }

      groups.get(voice.language_code)?.push(voice);
    }

    for (const [languageCode, voices] of groups.entries()) {
      const dedupedById = new Map<string, any>();
      voices.forEach((voice) => {
        if (!dedupedById.has(voice.id)) {
          dedupedById.set(voice.id, voice);
        }
      });

      const sorted = Array.from(dedupedById.values()).sort((a, b) => {
        const byName = (a.name || '').localeCompare(b.name || '');
        if (byName !== 0) return byName;
        return (a.id || '').localeCompare(b.id || '');
      });

      groups.set(languageCode, sorted);
    }

    return groups;
  }, [pollyVoices]);

  const pollyLanguages = useMemo(() => {
    return Array.from(pollyVoicesByLanguage.keys())
      .map((code) => ({ code, name: formatLanguageCode(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pollyVoicesByLanguage]);

  useEffect(() => {
    if (!pollyLanguages.length) {
      if (selectedPollyLanguage) {
        setSelectedPollyLanguage('');
      }
      return;
    }

    const hasSelection = pollyLanguages.some((lang) => lang.code === selectedPollyLanguage);
    if (!hasSelection) {
      setSelectedPollyLanguage(pollyLanguages[0].code);
    }
  }, [pollyLanguages, selectedPollyLanguage]);

  const loadVoices = async () => {
    setLoadingPiper(true);
    setLoadingPolly(true);
    setLoadingMicrosoft(true);
    try {
      const piper = await invoke<any[]>('list_piper_voices');
      setPiperVoices(piper || []);
    } catch (e) {
      console.error('Failed to load Piper voices:', e);
    } finally {
      setLoadingPiper(false);
    }

    try {
      const polly = await invoke<any[]>('list_polly_voices');
      setPollyVoices(polly || []);
    } catch (e) {
      console.error('Failed to load Polly voices:', e);
    } finally {
      setLoadingPolly(false);
    }

    try {
      const microsoft = await invoke<any[]>('list_microsoft_voices');
      console.log('Microsoft voices loaded:', microsoft?.length);
      setMicrosoftVoices(microsoft || []);
    } catch (e) {
      console.error('Failed to load Microsoft voices:', e);
    } finally {
      setLoadingMicrosoft(false);
    }
  };

  const loadDownloadedVoices = async () => {
    try {
      const voices = await invoke<any[]>('list_downloaded_voices');
      setDownloadedVoices(voices?.map(v => v.key) || []);
    } catch (e) {
      console.error('Failed to load downloaded voices:', e);
    }
  };

  const handleDownloadVoice = async (voiceKey: string) => {
    setDownloading(voiceKey);
    try {
      await invoke('download_voice', { voiceKey });
      setDownloadedVoices(prev => [...prev, voiceKey]);
      onChange({ selected_voice: voiceKey });
    } catch (e) {
      console.error('Failed to download voice:', e);
    } finally {
      setDownloading(null);
    }
  };

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const providerOptions = [
    { value: 'piper', label: 'Piper (Offline)' },
    { value: 'polly', label: 'AWS Polly' },
    { value: 'microsoft', label: 'Microsoft Edge TTS' },
  ];

  const currentProvider = config?.voice_provider || 'microsoft';
  const currentLabel = providerOptions.find(p => p.value === currentProvider)?.label ?? 'Microsoft Edge TTS';

  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  return (
    <div className="tab-content">
      <div className="setting-group">
        <label className="voice-provider-label">Select a Voice Provider</label>
        <div className="custom-dropdown" ref={dropdownRef}>
          <button 
            className="dropdown-trigger"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            type="button"
          >
            <span className="dropdown-selected">
              <VoiceProviderIcon provider={currentProvider} />
              {currentLabel}
            </span>
            <span className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`}>▼</span>
          </button>
          {dropdownOpen && (
            <div className="dropdown-menu">
              {providerOptions.map((option) => (
                <button
                  key={option.value}
                  className={`dropdown-item ${currentProvider === option.value ? 'selected' : ''}`}
                  onClick={() => {
                    onChange({ voice_provider: option.value });
                    setDropdownOpen(false);
                  }}
                  type="button"
                >
                  <VoiceProviderIcon provider={option.value} />
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(config.voice_provider || 'microsoft') === 'piper' && (
        <>
          <h3>Piper Voices</h3>
          {loadingPiper ? (
            <p>Loading voices...</p>
          ) : (
            <div className="language-grid">
              {piperLanguages.map((lang) => (
                <div
                  key={lang.code}
                  className={`language-item ${selectedPiperLanguage === lang.code ? 'selected' : ''}`}
                  onClick={() => { setSelectedPiperLanguage(lang.code); setPiperModalLanguage(lang.code); }}
                >
                  <span className="language-flag">{lang.flag}</span>
                  <span className="language-name">{lang.name}</span>
                </div>
              ))}
            </div>
          )}

          {piperModalLanguage && (
            <div className="modal-overlay" onClick={() => setPiperModalLanguage(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Select Voice - {piperLanguages.find(l => l.code === piperModalLanguage)?.name}</h3>
                  <button className="close-button" onClick={() => setPiperModalLanguage(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="voice-list">
                    {piperVoices
                      .filter((voice: any) => voice.language.code === piperModalLanguage)
                      .map((voice: any) => {
                        const isDownloaded = downloadedVoices.includes(voice.key);
                        const isDownloading = downloading === voice.key;
                        const isSelected = config.selected_voice === voice.key;
                        
                        return (
                        <div 
                          key={voice.key} 
                          className={`voice-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => isDownloaded && onChange({ selected_voice: voice.key })}
                        >
                          <span className="voice-name">{voice.name || voice.key}</span>
                          <span className="voice-badge">{voice.quality}</span>
                          {isDownloaded ? (
                            <button 
                              className={`download-btn ${isSelected ? 'selected' : ''}`}
                              onClick={(e) => { e.stopPropagation(); onChange({ selected_voice: voice.key }); }}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </button>
                          ) : isDownloading ? (
                            <span className="download-btn downloading">
                              <span className="spinner"></span>
                              Downloading...
                            </span>
                          ) : (
                            <button 
                              className="download-btn"
                              onClick={(e) => { e.stopPropagation(); handleDownloadVoice(voice.key); }}
                            >
                              Download
                            </button>
                          )}
                        </div>
                      )})}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {(config.voice_provider || 'microsoft') === 'polly' && (
        <>
          <div className="credentials-setup">
            <h4>AWS Credentials Setup</h4>
            <p>To use AWS Polly, configure your AWS credentials:</p>
            <div className="credentials-option">
              <strong>Option 1:</strong> Environment variables (recommended)
              <pre>export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"</pre>
            </div>
            <div className="credentials-option">
              <strong>Option 2:</strong> Credentials file (~/.aws/credentials)
              <pre>[default]
aws_access_key_id = your-access-key
aws_secret_access_key = your-secret-key</pre>
            </div>
            <div className="credentials-option">
              <strong>Option 3:</strong> Named profile (~/.aws/credentials)
              <pre>[profile myprofile]
aws_access_key_id = your-access-key
aws_secret_access_key = your-secret-key</pre>
              Then set: <code>export AWS_PROFILE=myprofile</code>
            </div>
          </div>
          
          <h3>AWS Polly Voices</h3>
          {loadingPolly ? (
            <p>Loading voices...</p>
          ) : pollyLanguages.length === 0 ? (
            <p className="voice-error">No voices available. Check AWS credentials.</p>
          ) : (
            <div className="language-grid">
              {pollyLanguages.map((lang) => (
                <div
                  key={lang.code}
                  className={`language-item ${selectedPollyLanguage === lang.code ? 'selected' : ''}`}
                  onClick={() => { setSelectedPollyLanguage(lang.code); setPollyModalLanguage(lang.code); }}
                >
                  <span className="language-flag">{getCountryFlag(lang.code)}</span>
                    <span className="language-name">{lang.name}</span>
                  </div>
                ))}
              </div>
            )}

          {pollyModalLanguage && (
            <div className="modal-overlay" onClick={() => setPollyModalLanguage(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Select Voice - {pollyLanguages.find(l => l.code === pollyModalLanguage)?.name}</h3>
                  <button className="close-button" onClick={() => setPollyModalLanguage(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="voice-list">
                    {((pollyModalLanguage ? pollyVoicesByLanguage.get(pollyModalLanguage) : []) ?? [])
                      .map((voice: any) => (
                        <div 
                          key={voice.id}
                          className={`voice-item ${config.selected_polly_voice === voice.id ? 'selected' : ''}`}
                          onClick={() => { onChange({ selected_polly_voice: voice.id }); setPollyModalLanguage(null); }}
                        >
                          <span className="voice-name">{voice.name}</span>
                          <span className="voice-lang">{voice.gender}</span>
                          <span className="voice-badge">{voice.engine}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {(config.voice_provider || 'microsoft') === 'microsoft' && (
        <>
          <h3>Microsoft Edge Voices</h3>
          {loadingMicrosoft ? (
            <p>Loading voices...</p>
          ) : microsoftVoices.length === 0 ? (
            <p>No voices available.</p>
          ) : (
            <div className="language-grid">
              {microsoftLanguages.map((lang) => (
                <div
                  key={lang.code}
                  className={`language-item ${selectedMicrosoftLanguage === lang.code ? 'selected' : ''}`}
                  onClick={() => { setSelectedMicrosoftLanguage(lang.code); setMicrosoftModalLanguage(lang.code); }}
                >
                  <span className="language-flag">{getCountryFlag(lang.code)}</span>
                  <span className="language-name">{lang.code}</span>
                </div>
              ))}
            </div>
          )}

          {microsoftModalLanguage && (
            <div className="modal-overlay" onClick={() => setMicrosoftModalLanguage(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Select Voice - {microsoftModalLanguage}</h3>
                  <button className="close-button" onClick={() => setMicrosoftModalLanguage(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="voice-list">
                    {microsoftVoices
                      .filter((voice: any) => voice.language_code === microsoftModalLanguage)
                      .map((voice: any) => (
                        <div 
                          key={voice.name}
                          className={`voice-item ${config.selected_microsoft_voice === voice.name ? 'selected' : ''}`}
                          onClick={() => { onChange({ selected_microsoft_voice: voice.name }); setMicrosoftModalLanguage(null); }}
                        >
                          <span className="voice-name">{voice.short_name || voice.name}</span>
                          <span className="voice-lang">{voice.gender}</span>
                          <span className="voice-badge">{voice.voice_type}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AboutTab() {
  return (
    <div className="tab-content">
      <div className="about-section">
        <h3>Insight Reader</h3>
        <p>Version 2.0.0</p>
        <p>A cross-platform text-to-speech application.</p>
      </div>
      
      <div className="about-section">
        <h4>Links</h4>
        <ul>
          <li><a href="#" onClick={(e) => { e.preventDefault(); invoke('open_url', { url: 'https://github.com/gabepsilva/insight-reader-2' }); }}>GitHub</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); invoke('open_url', { url: 'https://insightreader.xyz' }); }}>Website</a></li>
        </ul>
      </div>

      <div className="about-section">
        <h4>Features</h4>
        <ul>
          <li>Piper - Offline neural text-to-speech</li>
          <li>AWS Polly - Cloud neural TTS</li>
          <li>Microsoft Edge TTS - Cloud neural TTS</li>
          <li>Screenshot OCR - Extract text from images</li>
          <li>Grammar checking with Harper</li>
        </ul>
      </div>
    </div>
  );
}

export default Settings;
