import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Config, HotkeyStatus, Tab } from './Settings.types';
import { GeneralTab } from './GeneralTab';
import { AboutTab } from './AboutTab';
import { VoicesTab } from './VoicesTab';
import { CloseIcon } from '../icons';
import { ResizeGrip } from '../../player/ResizeGrip';
import { parseThemeMode } from '../../player/utils';
import { useWindowSize } from '../../player/hooks/useWindowSize';
import { usePlatform } from '../../player/hooks/usePlatform';
import { useWindowRadius } from '../../player/hooks/useWindowRadius';
import '../../App.css';
import './Settings.css';

function Settings() {
  const platform = usePlatform();
  useWindowRadius();
  const isMacos = platform === 'macos';
  const [activeTab, setActiveTab] = useState<Tab>('voices');
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowSize = useWindowSize();
  const [resizeGripHovered, setResizeGripHovered] = useState(false);

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
    void loadConfig();
    const unlisten = listen('config-changed', () => {
      void loadConfig();
    });
    return () => {
      unlisten.then((fn) => fn());
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

  const handleClose = useCallback(async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  }, []);

  const handleTitleBarMouseDown = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  }, []);

  const themeMode = parseThemeMode(config?.ui_theme) ?? 'dark';

  if (!config) {
    return (
      <main
        className={`main-shell main-shell--${themeMode} settings-page`}
        data-tauri-drag-region
      >
        <section className="player-card settings-card">
          <div className="settings-loading">Loading...</div>
          <ResizeGrip
            windowSize={windowSize}
            hovered={resizeGripHovered}
            onMouseEnter={() => setResizeGripHovered(true)}
            onMouseLeave={() => setResizeGripHovered(false)}
          />
        </section>
      </main>
    );
  }

  return (
    <main
      className={`main-shell main-shell--${themeMode} settings-page`}
      data-tauri-drag-region
    >
      <section className="player-card settings-card">
        <header
          className={`card-header ${isMacos ? 'card-header--macos' : ''}`}
          role="banner"
          onMouseDown={handleTitleBarMouseDown}
        >
          {isMacos ? (
            <div className="traffic-lights">
              <button
                type="button"
                className="traffic-btn traffic-btn--close"
                onClick={handleClose}
                aria-label="Close"
              >
                <span className="traffic-btn-icon">
                  <CloseIcon size={10} />
                </span>
              </button>
            </div>
          ) : null}
          {!isMacos ? (
            <div className="title-wrap title-wrap--drag">
              <div className="title-icon" aria-hidden="true">
                <img src="/logo.svg" alt="" className="title-icon-img" />
              </div>
              <h1 className="app-name">Settings</h1>
            </div>
          ) : (
            <div className="title-wrap title-wrap--spacer title-wrap--drag">
              <div className="title-icon" aria-hidden="true">
                <img src="/logo.svg" alt="" className="title-icon-img" />
              </div>
              <span className="app-name app-name--center">Insight Reader 2</span>
            </div>
          )}
          <div className="header-actions">
            {errors.length > 0 && (
              <div
                className="error-indicator"
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
                    {errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!isMacos && (
              <button
                type="button"
                className="window-btn close"
                onClick={handleClose}
                aria-label="Close"
                title="Close"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        </header>

        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab ${activeTab === 'voices' ? 'active' : ''}`}
            onClick={() => setActiveTab('voices')}
          >
            Voices
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'about' ? 'active' : ''}`}
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
        <ResizeGrip
          windowSize={windowSize}
          hovered={resizeGripHovered}
          onMouseEnter={() => setResizeGripHovered(true)}
          onMouseLeave={() => setResizeGripHovered(false)}
        />
      </section>
    </main>
  );
}

export default Settings;
