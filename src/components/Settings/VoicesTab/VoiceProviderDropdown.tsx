import { useState, useEffect, useRef } from 'react';
import { VoiceProviderIcon } from '../VoiceProviderIcon';

const PROVIDER_OPTIONS = [
  { value: 'piper', label: 'Piper (Offline)' },
  { value: 'polly', label: 'AWS Polly' },
  { value: 'microsoft', label: 'Microsoft Edge TTS' },
];

export function VoiceProviderDropdown({
  currentProvider,
  onChange,
}: {
  currentProvider: string;
  onChange: (voiceProvider: string) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentLabel = PROVIDER_OPTIONS.find((p) => p.value === currentProvider)?.label ?? 'Microsoft Edge TTS';

  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  return (
    <div className="setting-group">
      <label className="voice-provider-label">Select a Voice Provider</label>
      <div className="custom-dropdown" ref={dropdownRef}>
        <button
          className="dropdown-trigger"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          type="button"
        >
          <span className="dropdown-selected">
            <VoiceProviderIcon provider={currentProvider} />
            {currentLabel}
          </span>
          <span className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`}>▼</span>
        </button>
        {dropdownOpen && (
          <div className="dropdown-menu">
            {PROVIDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`dropdown-item ${currentProvider === option.value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setDropdownOpen(false);
                }}
                type="button"
              >
                <VoiceProviderIcon provider={option.value} />
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
