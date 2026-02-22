import { useRef, useEffect } from "react";
import { CloseIcon, MinimizeIcon, SettingsIcon } from "../components/icons";
import type { ThemeMode } from "./types";

interface PlayerCardHeaderProps {
  themeMode: ThemeMode;
  onThemeToggle: () => void;
  onOpenSettings: () => void;
  onMinimize: () => void;
  onClose: () => void;
  errors: string[];
  showTooltip: boolean;
  onTooltipEnter: () => void;
  onTooltipLeave: () => void;
  platform?: string | null;
}

export function PlayerCardHeader({
  themeMode,
  onThemeToggle,
  onOpenSettings,
  onMinimize,
  onClose,
  errors,
  showTooltip,
  onTooltipEnter,
  onTooltipLeave,
  platform,
}: PlayerCardHeaderProps) {
  const isMacos = platform === "macos";
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTooltipLeave = () => {
    tooltipTimeoutRef.current = setTimeout(() => onTooltipLeave(), 250);
  };

  const handleTooltipEnter = () => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    onTooltipEnter();
  };

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  return (
    <header className={`card-header ${isMacos ? "card-header--macos" : ""}`}>
      {isMacos ? (
        <div className="traffic-lights">
          <button
            type="button"
            className="traffic-btn traffic-btn--close"
            onClick={onClose}
            aria-label="Close window"
          >
            <span className="traffic-btn-icon">
              <CloseIcon size={10} />
            </span>
          </button>
          <button
            type="button"
            className="traffic-btn traffic-btn--minimize"
            onClick={onMinimize}
            aria-label="Minimize window"
          >
            <span className="traffic-btn-icon">
              <MinimizeIcon size={10} />
            </span>
          </button>
        </div>
      ) : null}

      {!isMacos ? (
        <div className="title-wrap">
          <div className="title-icon" aria-hidden="true">
            <img src="/logo.svg" alt="" className="title-icon-img" />
          </div>
          <h1 className="app-name">Insight Reader</h1>
        </div>
      ) : (
        <div className="title-wrap title-wrap--spacer title-wrap--drag">
          <span className="app-name app-name--center">Insight Reader 2</span>
        </div>
      )}

      <div className="header-actions">
        <button
          className="window-btn"
          onClick={onThemeToggle}
          aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {themeMode === "dark" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a7 7 0 1 0 9 9 9 9 0 1 1-9-9z" />
            </svg>
          )}
        </button>
        <button className="window-btn" onClick={onOpenSettings} aria-label="Open settings">
          <SettingsIcon size={14} />
        </button>
        {!isMacos && (
          <>
            <button className="window-btn minimize" onClick={onMinimize} aria-label="Minimize window">
              <MinimizeIcon size={14} />
            </button>
            <button className="window-btn close" onClick={onClose} aria-label="Close window">
              <CloseIcon size={14} />
            </button>
          </>
        )}

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
                  onClick={() => navigator.clipboard.writeText(errors.join("\n"))}
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
      </div>
    </header>
  );
}
