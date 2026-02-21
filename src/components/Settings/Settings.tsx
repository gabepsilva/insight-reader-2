import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Config, HotkeyStatus, Tab } from './Settings.types';
import { GeneralTab } from './GeneralTab';
import { AboutTab } from './AboutTab';
import { VoicesTab } from './VoicesTab';
import './Settings.css';

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

export default Settings;
