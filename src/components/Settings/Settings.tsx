import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './Settings.css';

interface Config {
  voice_provider: string | null;
  log_level: string | null;
  text_cleanup_enabled: boolean | null;
  selected_voice: string | null;
  selected_polly_voice: string | null;
  selected_microsoft_voice: string | null;
  ocr_backend: string | null;
  hotkey_enabled: boolean | null;
  hotkey_modifiers: string | null;
  hotkey_key: string | null;
}

type Tab = 'general' | 'voices' | 'about';

function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

  const loadConfig = async () => {
    try {
      const cfg = await invoke<Config>('get_config');
      setConfig(cfg);
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
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button 
          className={`tab ${activeTab === 'voices' ? 'active' : ''}`}
          onClick={() => setActiveTab('voices')}
        >
          Voices
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
          <GeneralTab config={config} onChange={updateConfig} />
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

function GeneralTab({ config, onChange }: { config: Config; onChange: (updates: Partial<Config>) => void }) {
  return (
    <div className="tab-content">
      <div className="setting-group">
        <label>Voice Provider</label>
        <select 
          value={config.voice_provider || 'microsoft'}
          onChange={(e) => onChange({ voice_provider: e.target.value })}
        >
          <option value="piper">Piper (Offline)</option>
          <option value="polly">AWS Polly</option>
          <option value="microsoft">Microsoft Edge TTS</option>
        </select>
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
        <label>
          <input 
            type="checkbox"
            checked={config.text_cleanup_enabled || false}
            onChange={(e) => onChange({ text_cleanup_enabled: e.target.checked })}
          />
          Enable Text Cleanup (Natural Reading)
        </label>
        <p className="setting-help">
          Automatically clean up text before reading (removes extra punctuation, fixes formatting)
        </p>
      </div>

      <div className="setting-group">
        <label>OCR Backend</label>
        <select 
          value={config.ocr_backend || 'default'}
          onChange={(e) => onChange({ ocr_backend: e.target.value })}
        >
          <option value="default">Default</option>
          <option value="better_ocr">Better OCR</option>
        </select>
      </div>

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
          value={`${config.hotkey_modifiers || 'control'}+${config.hotkey_key || 'r'}`}
          disabled
          className="hotkey-input"
        />
        <p className="setting-help">
          Current: Ctrl+R (Windows/Linux) or Cmd+R (macOS)
        </p>
      </div>
    </div>
  );
}

function VoicesTab({ config, onChange }: { config: Config; onChange: (updates: Partial<Config>) => void }) {
  const [piperVoices, setPiperVoices] = useState<any[]>([]);
  const [pollyVoices, setPollyVoices] = useState<any[]>([]);
  const [microsoftVoices, setMicrosoftVoices] = useState<any[]>([]);
  const [piperLanguages, setPiperLanguages] = useState<{code: string; name: string; flag: string}[]>([]);
  const [pollyLanguages, setPollyLanguages] = useState<{code: string; name: string}[]>([]);
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
    if (pollyVoices.length > 0) {
      const langMap = new Map<string, string>();
      pollyVoices.forEach((voice: any) => {
        if (!langMap.has(voice.language_code)) {
          const langName = formatPollyLanguage(voice.language_code);
          langMap.set(voice.language_code, langName);
        }
      });
      const langs = Array.from(langMap.entries())
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setPollyLanguages(langs);
      if (!selectedPollyLanguage && langs.length > 0) {
        setSelectedPollyLanguage(langs[0].code);
      }
    }
  }, [pollyVoices]);

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
    const flagMap: Record<string, string> = {
      'en_US': '🇺🇸', 'en_GB': '🇬🇧', 'en_AU': '🇦🇺', 'en_CA': '🇨🇦',
      'es_ES': '🇪🇸', 'es_MX': '🇲🇽',
      'fr_FR': '🇫🇷', 'fr_CA': '🇨🇦',
      'de_DE': '🇩🇪', 'it_IT': '🇮🇹', 'pt_BR': '🇧🇷', 'pt_PT': '🇵🇹',
      'ru_RU': '🇷🇺', 'pl_PL': '🇵🇱', 'nl_NL': '🇳🇱',
      'sv_SE': '🇸🇪', 'da_DK': '🇩🇰', 'no_NO': '🇳🇴', 'fi_FI': '🇫🇮',
      'cs_CZ': '🇨🇿', 'hu_HU': '🇭🇺', 'ro_RO': '🇷🇴', 'sk_SK': '🇸🇰',
      'uk_UA': '🇺🇦', 'el_GR': '🇬🇷', 'tr_TR': '🇹🇷',
      'zh_CN': '🇨🇳', 'zh_TW': '🇹🇼', 'ja_JP': '🇯🇵', 'ko_KR': '🇰🇷',
      'ar-SA': '🇸🇦', 'ar': '🌍', 'hi_IN': '🇮🇳', 'th_TH': '🇹🇭',
      'vi_VN': '🇻🇳', 'id_ID': '🇮🇩', 'ms_MY': '🇲🇾', 'fil_PH': '🇵🇭',
      'ca_ES': '🇪🇸', 'eu_ES': '🇪🇸', 'gl_ES': '🇪🇸', 'cy_GB': '🇬🇧',
      'ga_IE': '🇮🇪', 'mt_MT': '🇲🇹', 'is_IS': '🇮🇸', 'lv_LV': '🇱🇻',
      'lt_LT': '🇱🇹', 'et_EE': '🇪🇪', 'bg_BG': '🇧🇬', 'hr_HR': '🇭🇷',
      'sr_RS': '🇷🇸', 'sl_SI': '🇸🇮', 'mk_MK': '🇲🇰', 'bs_BA': '🇧🇦',
      'af_ZA': '🇿🇦', 'sw_KE': '🇰🇪', 'sw_TZ': '🇹🇿', 'zu_ZA': '🇿🇦',
      'ha_NG': '🇳🇬', 'yo_NG': '🇳🇬', 'ig_NG': '🇳🇬', 'am_ET': '🇪🇹',
      'ti_ER': '🇪🇷', 'om_ET': '🇪🇹', 'so_SO': '🇸🇴', 'ne_NP': '🇳🇵',
      'mn_MN': '🇲🇳', 'kk_KZ': '🇰🇿', 'uz_UZ': '🇺🇿', 'tg_TJ': '🇹🇯',
      'ky_KG': '🇰🇬', 'tk_TM': '🇹🇲', 'bn_BD': '🇧🇩', 'my_MM': '🇲🇲',
      'km_KH': '🇰🇭', 'lo_LA': '🇱🇦', 'gu_IN': '🇮🇳', 'kn_IN': '🇮🇳',
      'ta_IN': '🇮🇳', 'te_IN': '🇮🇳', 'mr_IN': '🇮🇳', 'pa_IN': '🇮🇳',
      'ml_IN': '🇮🇳', 'si_LK': '🇱🇰', 'dv_MV': '🇲🇻',
    };
    return flagMap[langCode] || '🌍';
  };

  const formatPollyLanguage = (code: string): string => {
    const parts = code.split('-');
    if (parts.length >= 2) {
      return `${parts[0].toUpperCase()} (${parts[1]})`;
    }
    return code.toUpperCase();
  };

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
    } catch (e) {
      console.error('Failed to download voice:', e);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="tab-content">
      <h3>Piper Voices</h3>
      {loadingPiper ? (
        <p>Loading voices...</p>
      ) : (
        <>
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
        </>
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
                  .map((voice: any) => (
                    <div 
                      key={voice.key} 
                      className={`voice-item ${config.selected_voice === voice.key ? 'selected' : ''}`}
                      onClick={() => { onChange({ selected_voice: voice.key }); setPiperModalLanguage(null); }}
                    >
                      <span className="voice-name">{voice.name || voice.key}</span>
                      <span className="voice-badge">{voice.quality}</span>
                      {downloadedVoices.includes(voice.key) ? (
                        <span className="voice-badge downloaded">Downloaded</span>
                      ) : (
                        <button 
                          className="download-btn"
                          onClick={(e) => { e.stopPropagation(); handleDownloadVoice(voice.key); }}
                          disabled={downloading === voice.key}
                        >
                          {downloading === voice.key ? 'Downloading...' : 'Download'}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <h3>AWS Polly Voices</h3>
      {loadingPolly ? (
        <p>Loading voices...</p>
      ) : pollyVoices.length === 0 ? (
        <p className="voice-error">No voices available. Check AWS credentials.</p>
      ) : (
        <>
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
        </>
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
                {pollyVoices
                  .filter((voice: any) => voice.language_code === pollyModalLanguage)
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

      <h3>Microsoft Edge Voices</h3>
      {loadingMicrosoft ? (
        <p>Loading voices...</p>
      ) : microsoftVoices.length === 0 ? (
        <p>No voices available.</p>
      ) : (
        <>
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
        </>
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
