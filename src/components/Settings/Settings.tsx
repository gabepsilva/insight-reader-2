import { useState, useEffect } from 'react';
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
  const [loadingPiper, setLoadingPiper] = useState(false);
  const [loadingPolly, setLoadingPolly] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadedVoices, setDownloadedVoices] = useState<string[]>([]);

  useEffect(() => {
    loadVoices();
    loadDownloadedVoices();
  }, []);

  const loadVoices = async () => {
    setLoadingPiper(true);
    setLoadingPolly(true);
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
        <div className="voice-list">
          {piperVoices.slice(0, 20).map((voice: any) => (
            <div 
              key={voice.key} 
              className={`voice-item ${config.selected_voice === voice.key ? 'selected' : ''}`}
              onClick={() => onChange({ selected_voice: voice.key })}
            >
              <span className="voice-name">{voice.name || voice.key}</span>
              <span className="voice-lang">{voice.language?.name_english}</span>
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
      )}

      <h3>AWS Polly Voices</h3>
      {loadingPolly ? (
        <p>Loading voices...</p>
      ) : pollyVoices.length === 0 ? (
        <p className="voice-error">No voices available. Check AWS credentials.</p>
      ) : (
        <div className="voice-list">
          {pollyVoices.slice(0, 20).map((voice: any) => (
            <div 
              key={voice.id}
              className={`voice-item ${config.selected_polly_voice === voice.id ? 'selected' : ''}`}
              onClick={() => onChange({ selected_polly_voice: voice.id })}
            >
              <span className="voice-name">{voice.name}</span>
              <span className="voice-lang">{voice.language_code}</span>
              <span className="voice-badge">{voice.engine}</span>
            </div>
          ))}
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
