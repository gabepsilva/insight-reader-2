import { getCountryFlag } from '../voices/languageUtils';
import { LanguageSection } from './LanguageSection';

interface MicrosoftLanguage {
  code: string;
  name: string;
  locale?: string;
}

interface MicrosoftVoice {
  name: string;
  short_name?: string;
  gender: string;
  voice_type: string;
  language: string;
  language_code: string;
}

export function MicrosoftSection({
  config,
  onChange,
  loadingMicrosoft,
  microsoftVoices,
  microsoftLanguages,
  mostUsedLanguages,
  otherLanguages,
  selectedMicrosoftLanguage,
  microsoftModalLanguage,
  onSelectLanguage,
  onModalClose,
}: {
  config: { selected_microsoft_voice: string | null };
  onChange: (updates: { selected_microsoft_voice?: string }) => void;
  loadingMicrosoft: boolean;
  microsoftVoices: MicrosoftVoice[];
  microsoftLanguages: MicrosoftLanguage[];
  mostUsedLanguages: MicrosoftLanguage[];
  otherLanguages: MicrosoftLanguage[];
  selectedMicrosoftLanguage: string;
  microsoftModalLanguage: string | null;
  onSelectLanguage: (code: string) => void;
  onModalClose: () => void;
}) {
  return (
    <>
      <h3>Microsoft Edge Voices</h3>
      {loadingMicrosoft ? (
        <p className="voices-loading">Loading voices...</p>
      ) : microsoftVoices.length === 0 ? (
        <p>No voices available.</p>
      ) : (
        <>
          <LanguageSection
            title="Most used languages"
            languages={mostUsedLanguages}
            selectedCode={selectedMicrosoftLanguage}
            onSelect={onSelectLanguage}
            getFlag={(lang) => getCountryFlag(lang.locale ?? lang.code)}
          />
          <LanguageSection
            title="All languages"
            languages={otherLanguages}
            selectedCode={selectedMicrosoftLanguage}
            onSelect={onSelectLanguage}
            getFlag={(lang) => getCountryFlag(lang.locale ?? lang.code)}
          />
        </>
      )}

      {microsoftModalLanguage && (
        <div className="modal-overlay" onClick={onModalClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                Select Voice -{' '}
                {microsoftLanguages.find((l) => l.code === microsoftModalLanguage)?.name ??
                  microsoftModalLanguage}
              </h3>
              <button className="close-button" onClick={onModalClose} type="button">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="voice-list">
                {microsoftVoices
                  .filter((voice) => voice.language_code === microsoftModalLanguage)
                  .map((voice) => (
                    <div
                      key={voice.name}
                      className={`voice-item ${config.selected_microsoft_voice === voice.name ? 'selected' : ''}`}
                      onClick={() => {
                        onChange({ selected_microsoft_voice: voice.name });
                        onModalClose();
                      }}
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
  );
}
