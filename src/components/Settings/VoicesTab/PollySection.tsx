import { getCountryFlag } from '../voices/languageUtils';

interface PollyLanguage {
  code: string;
  name: string;
}

export function PollySection({
  config,
  onChange,
  loadingPolly,
  pollyLanguages,
  mostUsedLanguages,
  otherLanguages,
  selectedPollyLanguage,
  pollyModalLanguage,
  pollyVoicesByLanguage,
  onSelectLanguage,
  onModalClose,
}: {
  config: { selected_polly_voice: string | null };
  onChange: (updates: { selected_polly_voice?: string }) => void;
  loadingPolly: boolean;
  pollyLanguages: PollyLanguage[];
  mostUsedLanguages: PollyLanguage[];
  otherLanguages: PollyLanguage[];
  selectedPollyLanguage: string;
  pollyModalLanguage: string | null;
  pollyVoicesByLanguage: Map<string, { id: string; name: string; gender: string; engine: string }[]>;
  onSelectLanguage: (code: string) => void;
  onModalClose: () => void;
}) {
  return (
    <>
      <div className="credentials-setup">
        <h4>AWS Credentials Setup</h4>
        <p>To use AWS Polly, configure your AWS credentials:</p>
        <div className="credentials-option">
          <strong>Option 1:</strong> Environment variables (recommended)
          <pre>
            {`export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"`}
          </pre>
        </div>
        <div className="credentials-option">
          <strong>Option 2:</strong> Credentials file (~/.aws/credentials)
          <pre>
            {`[default]
aws_access_key_id = your-access-key
aws_secret_access_key = your-secret-key`}
          </pre>
        </div>
        <div className="credentials-option">
          <strong>Option 3:</strong> Named profile (~/.aws/credentials)
          <pre>
            {`[profile myprofile]
aws_access_key_id = your-access-key
aws_secret_access_key = your-secret-key`}
          </pre>
          Then set: <code>export AWS_PROFILE=myprofile</code>
        </div>
      </div>

      <h3>AWS Polly Voices</h3>
      {loadingPolly ? (
        <p>Loading voices...</p>
      ) : pollyLanguages.length === 0 ? (
        <p className="voice-error">No voices available. Check AWS credentials.</p>
      ) : (
        <>
          {mostUsedLanguages.length > 0 && (
            <section className="language-section">
              <h4 className="language-section-label">Most used languages</h4>
              <div className="language-grid">
                {mostUsedLanguages.map((lang) => (
                  <div
                    key={lang.code}
                    className={`language-item ${selectedPollyLanguage === lang.code ? 'selected' : ''}`}
                    onClick={() => onSelectLanguage(lang.code)}
                  >
                    <span className="language-flag">{getCountryFlag(lang.code)}</span>
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
                    className={`language-item ${selectedPollyLanguage === lang.code ? 'selected' : ''}`}
                    onClick={() => onSelectLanguage(lang.code)}
                  >
                    <span className="language-flag">{getCountryFlag(lang.code)}</span>
                    <span className="language-name">{lang.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {pollyModalLanguage && (
        <div className="modal-overlay" onClick={onModalClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Voice - {pollyLanguages.find((l) => l.code === pollyModalLanguage)?.name}</h3>
              <button className="close-button" onClick={onModalClose} type="button">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="voice-list">
                {(pollyVoicesByLanguage.get(pollyModalLanguage) ?? []).map((voice) => (
                  <div
                    key={voice.id}
                    className={`voice-item ${config.selected_polly_voice === voice.id ? 'selected' : ''}`}
                    onClick={() => {
                      onChange({ selected_polly_voice: voice.id });
                      onModalClose();
                    }}
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
  );
}
