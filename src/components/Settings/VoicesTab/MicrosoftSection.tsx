import { getCountryFlag } from '../voices/languageUtils';

interface MicrosoftLanguage {
  code: string;
  name: string;
}

interface MicrosoftVoice {
  name: string;
  short_name?: string;
  gender: string;
  voice_type: string;
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
        <p>Loading voices...</p>
      ) : microsoftVoices.length === 0 ? (
        <p>No voices available.</p>
      ) : (
        <>
          {mostUsedLanguages.length > 0 && (
            <section className="language-section">
              <h4 className="language-section-label">Most used languages</h4>
              <div className="language-grid">
                {mostUsedLanguages.map((lang) => (
                  <div
                    key={lang.code}
                    className={`language-item ${selectedMicrosoftLanguage === lang.code ? 'selected' : ''}`}
                    onClick={() => onSelectLanguage(lang.code)}
                  >
                    <span className="language-flag">{getCountryFlag(lang.code)}</span>
                    <span className="language-name">{lang.code}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {otherLanguages.length > 0 && (
            <section className="language-section">
              <h4 className="language-section-label">Other languages</h4>
              <div className="language-grid">
                {otherLanguages.map((lang) => (
                  <div
                    key={lang.code}
                    className={`language-item ${selectedMicrosoftLanguage === lang.code ? 'selected' : ''}`}
                    onClick={() => onSelectLanguage(lang.code)}
                  >
                    <span className="language-flag">{getCountryFlag(lang.code)}</span>
                    <span className="language-name">{lang.code}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {microsoftModalLanguage && (
        <div className="modal-overlay" onClick={onModalClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Voice - {microsoftModalLanguage}</h3>
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
