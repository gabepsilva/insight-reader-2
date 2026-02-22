interface PiperLanguage {
  code: string;
  name: string;
  flag: string;
}

interface PiperVoice {
  key: string;
  name?: string;
  quality?: string;
  language: { code: string };
}

export function PiperSection({
  config,
  onChange,
  piperVoices,
  piperLanguages,
  mostUsedLanguages,
  otherLanguages,
  selectedPiperLanguage,
  piperModalLanguage,
  onSelectLanguage,
  onModalClose,
  loadingPiper,
  downloadedVoices,
  downloading,
  onDownloadVoice,
}: {
  config: { selected_voice: string | null };
  onChange: (updates: { selected_voice?: string }) => void;
  piperVoices: PiperVoice[];
  piperLanguages: PiperLanguage[];
  mostUsedLanguages: PiperLanguage[];
  otherLanguages: PiperLanguage[];
  selectedPiperLanguage: string;
  piperModalLanguage: string | null;
  onSelectLanguage: (code: string) => void;
  onModalClose: () => void;
  loadingPiper: boolean;
  downloadedVoices: string[];
  downloading: string | null;
  onDownloadVoice: (voiceKey: string) => void;
}) {
  return (
    <>
      <h3>Piper Voices</h3>
      {loadingPiper ? (
        <p>Loading voices...</p>
      ) : (
        <>
          {mostUsedLanguages.length > 0 && (
            <section className="language-section">
              <h4 className="language-section-label">Most used languages</h4>
              <div className="language-grid">
                {mostUsedLanguages.map((lang) => (
                  <div
                    key={lang.code}
                    className={`language-item ${selectedPiperLanguage === lang.code ? 'selected' : ''}`}
                    onClick={() => onSelectLanguage(lang.code)}
                  >
                    <span className="language-flag">{lang.flag}</span>
                    <span className="language-name">{lang.name}</span>
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
                    className={`language-item ${selectedPiperLanguage === lang.code ? 'selected' : ''}`}
                    onClick={() => onSelectLanguage(lang.code)}
                  >
                    <span className="language-flag">{lang.flag}</span>
                    <span className="language-name">{lang.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {piperModalLanguage && (
        <div className="modal-overlay" onClick={onModalClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Voice - {piperLanguages.find((l) => l.code === piperModalLanguage)?.name}</h3>
              <button className="close-button" onClick={onModalClose} type="button">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="voice-list">
                {piperVoices
                  .filter((voice) => voice.language.code === piperModalLanguage)
                  .map((voice) => {
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onChange({ selected_voice: voice.key });
                            }}
                            type="button"
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                        ) : isDownloading ? (
                          <span className="download-btn downloading">
                            <span className="spinner" />
                            Downloading...
                          </span>
                        ) : (
                          <button
                            className="download-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownloadVoice(voice.key);
                            }}
                            type="button"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
