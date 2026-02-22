import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Config } from '../Settings.types';
import { getCountryFlag, formatLanguageCode } from '../voices/languageUtils';
import { VoiceProviderDropdown } from './VoiceProviderDropdown';
import { PiperSection } from './PiperSection';
import { PollySection } from './PollySection';
import { MicrosoftSection } from './MicrosoftSection';
import '../VoicesTab.css';

export function VoicesTab({ config, onChange }: { config: Config; onChange: (updates: Partial<Config>) => void }) {
  const [piperVoices, setPiperVoices] = useState<any[]>([]);
  const [pollyVoices, setPollyVoices] = useState<any[]>([]);
  const [microsoftVoices, setMicrosoftVoices] = useState<any[]>([]);
  const [piperLanguages, setPiperLanguages] = useState<{ code: string; name: string; flag: string }[]>([]);
  const [selectedPollyLanguage, setSelectedPollyLanguage] = useState<string>('');
  const [pollyModalLanguage, setPollyModalLanguage] = useState<string | null>(null);
  const [selectedPiperLanguage, setSelectedPiperLanguage] = useState<string>('');
  const [piperModalLanguage, setPiperModalLanguage] = useState<string | null>(null);
  const [microsoftLanguages, setMicrosoftLanguages] = useState<{ code: string; name: string }[]>([]);
  const [selectedMicrosoftLanguage, setSelectedMicrosoftLanguage] = useState<string>('');
  const [microsoftModalLanguage, setMicrosoftModalLanguage] = useState<string | null>(null);
  const [loadingPiper, setLoadingPiper] = useState(false);
  const [loadingPolly, setLoadingPolly] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadedVoices, setDownloadedVoices] = useState<string[]>([]);

  const currentProvider = config?.voice_provider || 'microsoft';

  useEffect(() => {
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
        setDownloadedVoices(voices?.map((v) => v.key) || []);
      } catch (e) {
        console.error('Failed to load downloaded voices:', e);
      }
    };
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
            flag: getCountryFlag(voice.language.code),
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

  const pollyVoicesByLanguage = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const voice of pollyVoices) {
      if (!voice?.id || !voice?.language_code || voice.engine !== 'Neural') continue;
      if (!groups.has(voice.language_code)) groups.set(voice.language_code, []);
      groups.get(voice.language_code)?.push(voice);
    }
    for (const [languageCode, voices] of groups.entries()) {
      const dedupedById = new Map<string, any>();
      voices.forEach((voice) => {
        if (!dedupedById.has(voice.id)) dedupedById.set(voice.id, voice);
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
      if (selectedPollyLanguage) setSelectedPollyLanguage('');
      return;
    }
    const hasSelection = pollyLanguages.some((lang) => lang.code === selectedPollyLanguage);
    if (!hasSelection) setSelectedPollyLanguage(pollyLanguages[0].code);
  }, [pollyLanguages, selectedPollyLanguage]);

  const handleDownloadVoice = async (voiceKey: string) => {
    setDownloading(voiceKey);
    try {
      await invoke('download_voice', { voiceKey });
      setDownloadedVoices((prev) => [...prev, voiceKey]);
      onChange({ selected_voice: voiceKey });
    } catch (e) {
      console.error('Failed to download voice:', e);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="tab-content">
      <VoiceProviderDropdown
        currentProvider={currentProvider}
        onChange={(value) => onChange({ voice_provider: value })}
      />

      {currentProvider === 'piper' && (
        <PiperSection
          config={config}
          onChange={onChange}
          piperVoices={piperVoices}
          piperLanguages={piperLanguages}
          selectedPiperLanguage={selectedPiperLanguage}
          piperModalLanguage={piperModalLanguage}
          onSelectLanguage={(code) => {
            setSelectedPiperLanguage(code);
            setPiperModalLanguage(code);
          }}
          onModalClose={() => setPiperModalLanguage(null)}
          loadingPiper={loadingPiper}
          downloadedVoices={downloadedVoices}
          downloading={downloading}
          onDownloadVoice={handleDownloadVoice}
        />
      )}

      {currentProvider === 'polly' && (
        <PollySection
          config={config}
          onChange={onChange}
          loadingPolly={loadingPolly}
          pollyLanguages={pollyLanguages}
          selectedPollyLanguage={selectedPollyLanguage}
          pollyModalLanguage={pollyModalLanguage}
          pollyVoicesByLanguage={pollyVoicesByLanguage}
          onSelectLanguage={(code) => {
            setSelectedPollyLanguage(code);
            setPollyModalLanguage(code);
          }}
          onModalClose={() => setPollyModalLanguage(null)}
        />
      )}

      {currentProvider === 'microsoft' && (
        <MicrosoftSection
          config={config}
          onChange={onChange}
          loadingMicrosoft={loadingMicrosoft}
          microsoftVoices={microsoftVoices}
          microsoftLanguages={microsoftLanguages}
          selectedMicrosoftLanguage={selectedMicrosoftLanguage}
          microsoftModalLanguage={microsoftModalLanguage}
          onSelectLanguage={(code) => {
            setSelectedMicrosoftLanguage(code);
            setMicrosoftModalLanguage(code);
          }}
          onModalClose={() => setMicrosoftModalLanguage(null)}
        />
      )}
    </div>
  );
}
