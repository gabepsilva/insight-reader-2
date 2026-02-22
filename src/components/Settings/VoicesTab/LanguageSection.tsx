export interface LanguageItem {
  code: string;
  name: string;
}

export function LanguageSection<T extends LanguageItem>({
  title,
  languages,
  selectedCode,
  onSelect,
  getFlag,
}: {
  title: string;
  languages: T[];
  selectedCode: string;
  onSelect: (code: string) => void;
  getFlag: (lang: T) => string;
}) {
  if (languages.length === 0) return null;

  return (
    <section className="voices-section">
      <h4 className="voices-section-title">{title}</h4>
      <div className="language-grid">
        {languages.map((lang) => (
          <div
            key={lang.code}
            className={`language-item ${selectedCode === lang.code ? 'selected' : ''}`}
            onClick={() => onSelect(lang.code)}
          >
            <span className="language-flag">{getFlag(lang)}</span>
            <span className="language-name">{lang.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
