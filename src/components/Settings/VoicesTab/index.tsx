import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Config } from '../Settings.types';
import { getCountryFlag, formatLanguageCode } from '../voices/languageUtils';
import { VoiceProviderDropdown } from './VoiceProviderDropdown';
import { PiperSection } from './PiperSection';
import { PollySection } from './PollySection';
import { MicrosoftSection } from './MicrosoftSection';
import '../VoicesTab.css';

const MOST_USED_LOCALES = new Set([
  'en-US',
  'es-ES',
  'zh-CN',
  'hi-IN',
  'fr-FR',
  'de-DE',
  'pt-BR',
  'ar-SA',
]);

const MOST_USED_LOCALE_ORDER: string[] = [
  'en-US',
  'es-ES',
  'zh-CN',
  'hi-IN',
  'fr-FR',
  'de-DE',
  'pt-BR',
  'ar-SA',
];

function splitByMostUsed<T extends { code: string }>(
  languages: T[],
  mostUsedCodes: Set<string>,
  getSortKey: (lang: T) => string
): { mostUsed: T[]; other: T[] } {
  const mostUsed = languages
    .filter((l) => mostUsedCodes.has(l.code))
    .sort(
      (a, b) =>
        MOST_USED_LOCALE_ORDER.indexOf(getSortKey(a)) -
        MOST_USED_LOCALE_ORDER.indexOf(getSortKey(b))
    );
  const other = languages.filter((l) => !mostUsedCodes.has(l.code));
  return { mostUsed, other };
}

export function VoicesTab({ config, onChange }: { config: Config; onChange: (updates: Partial<Config>) => void }) {
  const [piperVoices, setPiperVoices] = useState<any[]>([]);
  const [pollyVoices, setPollyVoices] = useState<any[]>([]);
  const [microsoftVoices, setMicrosoftVoices] = useState<any[]>([]);
  const [piperLanguages, setPiperLanguages] = useState<{ code: string; name: string; flag: string }[]>([]);
  const [selectedPollyLanguage, setSelectedPollyLanguage] = useState<string>('');
  const [pollyModalLanguage, setPollyModalLanguage] = useState<string | null>(null);
  const [selectedPiperLanguage, setSelectedPiperLanguage] = useState<string>('');
  const [piperModalLanguage, setPiperModalLanguage] = useState<string | null>(null);
  const [microsoftLanguages, setMicrosoftLanguages] = useState<
    { code: string; name: string; locale: string }[]
  >([]);
  const [selectedMicrosoftLanguage, setSelectedMicrosoftLanguage] = useState<string>('');
  const [microsoftModalLanguage, setMicrosoftModalLanguage] = useState<string | null>(null);
  const [loadingPiper, setLoadingPiper] = useState(false);
  const [loadingPolly, setLoadingPolly] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadedVoices, setDownloadedVoices] = useState<string[]>([]);
  const [awsCredentialsConfigured, setAwsCredentialsConfigured] = useState<boolean | null>(null);

  const currentProvider = config?.voice_provider || 'microsoft';

  useEffect(() => {
    const loadVoices = async () => {
      setLoadingPiper(true);
      setLoadingPolly(true);
      setLoadingMicrosoft(true);
      const awsCheckPromise = invoke<boolean>('check_polly_credentials').catch(() => false);

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

      setAwsCredentialsConfigured(await awsCheckPromise);
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

  const { mostUsedPiperLanguages, otherPiperLanguages } = useMemo(() => {
    const normalize = (code: string) => code.replace(/_/g, '-');
    const mostUsedCodes = new Set<string>();
    for (const voice of piperVoices) {
      const code = voice?.language?.code || '';
      if (MOST_USED_LOCALES.has(normalize(code))) mostUsedCodes.add(code);
    }
    const { mostUsed, other } = splitByMostUsed(piperLanguages, mostUsedCodes, (l) =>
      normalize(l.code)
    );
    return { mostUsedPiperLanguages: mostUsed, otherPiperLanguages: other };
  }, [piperVoices, piperLanguages]);

  useEffect(() => {
    if (microsoftVoices.length > 0) {
      const langMap = new Map<string, { name: string; locale: string }>();
      microsoftVoices.forEach((voice: any) => {
        if (!langMap.has(voice.language_code)) {
          const locale = voice.language || voice.language_code;
          const displayName =
            voice.language_code.includes('(') && voice.language_code.includes(')')
              ? voice.language_code
              : formatLanguageCode(locale);
          langMap.set(voice.language_code, { name: displayName, locale });
        }
      });
      const langs = Array.from(langMap.entries())
        .map(([code, { name, locale }]) => ({ code, name, locale }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setMicrosoftLanguages(langs);
      if (!selectedMicrosoftLanguage && langs.length > 0) {
        setSelectedMicrosoftLanguage(langs[0].code);
      }
    }
  }, [microsoftVoices]);

  const { mostUsedMicrosoftLanguages, otherMicrosoftLanguages } = useMemo(() => {
    const mostUsedCodes = new Set<string>();
    for (const voice of microsoftVoices) {
      const locale = voice?.language || '';
      if (MOST_USED_LOCALES.has(locale)) mostUsedCodes.add(voice.language_code);
    }
    const { mostUsed, other } = splitByMostUsed(microsoftLanguages, mostUsedCodes, (l) =>
      l.locale ?? ''
    );
    return { mostUsedMicrosoftLanguages: mostUsed, otherMicrosoftLanguages: other };
  }, [microsoftVoices, microsoftLanguages]);

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

  const { mostUsedPollyLanguages, otherPollyLanguages } = useMemo(() => {
    const mostUsedCodes = new Set<string>();
    for (const voice of pollyVoices) {
      const code = voice?.language_code || '';
      if (MOST_USED_LOCALES.has(code)) mostUsedCodes.add(code);
    }
    const { mostUsed, other } = splitByMostUsed(pollyLanguages, mostUsedCodes, (l) => l.code);
    return { mostUsedPollyLanguages: mostUsed, otherPollyLanguages: other };
  }, [pollyVoices, pollyLanguages]);

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
          mostUsedLanguages={mostUsedPiperLanguages}
          otherLanguages={otherPiperLanguages}
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
          awsCredentialsConfigured={awsCredentialsConfigured}
          pollyLanguages={pollyLanguages}
          mostUsedLanguages={mostUsedPollyLanguages}
          otherLanguages={otherPollyLanguages}
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
          mostUsedLanguages={mostUsedMicrosoftLanguages}
          otherLanguages={otherMicrosoftLanguages}
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
