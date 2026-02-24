import {
  ASSISTANT_TABS,
  FORMAT_OPTIONS,
  QUICK_EDIT_OPTIONS,
  TONE_OPTIONS,
  type AssistantTabId,
} from "./editorData";
import { EnterIcon, SparklesIcon } from "../icons";
import "./EditorAssistantPanel.css";

interface EditorAssistantPanelProps {
  width?: number;
  activeTone: string;
  activeFormat: string;
  activeSubOption: string;
  activeTab: AssistantTabId;
  customPrompt: string;
  promptHistory: string[];
  hasText: boolean;
  isRunningTransform: boolean;
  onActiveToneChange: (value: string) => void;
  onActiveFormatChange: (value: string, subOption: string) => void;
  onActiveSubOptionChange: (value: string) => void;
  onActiveTabChange: (value: AssistantTabId) => void;
  onCustomPromptChange: (value: string) => void;
  onApplyPrompt: () => void;
  onUseHistoryPrompt: (value: string) => void;
  onApplyRewrite: () => void;
  onApplyQuickEdit: (instruction: string) => void;
}

export function EditorAssistantPanel({
  width,
  activeTone,
  activeFormat,
  activeSubOption,
  activeTab,
  customPrompt,
  promptHistory,
  hasText,
  isRunningTransform,
  onActiveToneChange,
  onActiveFormatChange,
  onActiveSubOptionChange,
  onActiveTabChange,
  onCustomPromptChange,
  onApplyPrompt,
  onUseHistoryPrompt,
  onApplyRewrite,
  onApplyQuickEdit,
}: EditorAssistantPanelProps) {
  const currentTone = TONE_OPTIONS.find((t) => t.id === activeTone);
  const currentFormat = FORMAT_OPTIONS.find((item) => item.id === activeFormat);
  const toneLabel = currentTone?.label ?? activeTone;
  const formatLabel = currentFormat
    ? activeSubOption
      ? `${currentFormat.label} (${activeSubOption})`
      : currentFormat.label
    : activeFormat;
  const rewriteDisabled = !hasText || isRunningTransform;
  const promptDisabled =
    !customPrompt.trim() || !hasText || isRunningTransform;

  return (
    <aside
      className="editor-assistant"
      aria-label="Quick adjustment"
      style={width != null ? { width: `${width}px` } : undefined}
    >
      <h2 className="editor-assistant__title">Quick adjustment</h2>
      <div className="editor-assistant__tabs">
        {ASSISTANT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`editor-assistant__tab${activeTab === tab.id ? " editor-assistant__tab--active" : ""}`}
            onClick={() => onActiveTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="editor-assistant__body">
        {activeTab === "tone" && (
          <>
            <p className="editor-assistant__section-label">Writing tone</p>
            <div className="editor-assistant__tone-grid">
              {TONE_OPTIONS.map((tone) => (
                <button
                  key={tone.id}
                  type="button"
                  className={`editor-assistant__tile editor-assistant__tile--tone${activeTone === tone.id ? " editor-assistant__tile--active" : ""}`}
                  onClick={() => onActiveToneChange(tone.id)}
                >
                  {(() => {
                    const ToneIcon = tone.icon;
                    return (
                      <span
                        className="editor-assistant__tile-icon"
                        aria-hidden="true"
                      >
                        <ToneIcon size={16} />
                      </span>
                    );
                  })()}
                  <div className="editor-assistant__tile-header">
                    <span className="editor-assistant__tile-title">{tone.label}</span>
                  </div>
                  <span className="editor-assistant__tile-description">
                    {tone.description}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {activeTab === "format" && (
          <>
            <p className="editor-assistant__section-label">Content type</p>
            <div className="editor-assistant__format-grid">
              {FORMAT_OPTIONS.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  className={`editor-assistant__tile editor-assistant__tile--format${activeFormat === format.id ? " editor-assistant__tile--active" : ""}`}
                  onClick={() =>
                    onActiveFormatChange(format.id, format.subOptions[0] ?? "")
                  }
                >
                  {(() => {
                    const FormatIcon = format.icon;
                    return (
                      <span
                        className="editor-assistant__tile-icon"
                        aria-hidden="true"
                      >
                        <FormatIcon size={16} />
                      </span>
                    );
                  })()}
                  <span className="editor-assistant__tile-title">{format.label}</span>
                </button>
              ))}
            </div>
            {currentFormat ? (
              <>
                <p className="editor-assistant__section-label">Subtype</p>
                <div className="editor-assistant__chip-wrap">
                  {currentFormat.subOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`editor-assistant__chip${activeSubOption === option ? " editor-assistant__chip--active" : ""}`}
                      onClick={() => onActiveSubOptionChange(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}

        {activeTab === "quick" && (
          <>
            <p className="editor-assistant__section-label editor-assistant__section-label--body">
              Quick edits keep your tone and format, but change the perspective.
            </p>
            <div className="editor-assistant__quick-list">
              {QUICK_EDIT_OPTIONS.map((quickEdit) => (
                <button
                  key={quickEdit.label}
                  type="button"
                  className="editor-assistant__quick-button"
                  onClick={() => onApplyQuickEdit(quickEdit.label)}
                  disabled={rewriteDisabled}
                >
                  {(() => {
                    const QuickIcon = quickEdit.icon;
                    return (
                      <span
                        className="editor-assistant__quick-icon"
                        aria-hidden="true"
                      >
                        <QuickIcon size={14} />
                      </span>
                    );
                  })()}
                  {quickEdit.label}
                </button>
              ))}
            </div>
          </>
        )}

        {activeTab === "prompt" && (
          <div className="editor-assistant__prompt">
            <p className="editor-assistant__section-label">Custom instruction</p>
            <textarea
              className="editor-assistant__textarea"
              placeholder="e.g. your instruction"
              value={customPrompt}
              onChange={(event) => onCustomPromptChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && customPrompt.trim()) {
                  event.preventDefault();
                  onApplyPrompt();
                }
              }}
            />

            {promptHistory.length > 0 ? (
              <>
                <p className="editor-assistant__section-label">Recent</p>
                <div className="editor-assistant__prompt-history">
                  {promptHistory.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="editor-assistant__history-item"
                      onClick={() => onUseHistoryPrompt(item)}
                    >
                      <span className="editor-assistant__history-label">{item}</span>
                      <span className="editor-assistant__history-action">use</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {activeTab !== "quick" && (
        <div className="editor-assistant__footer">
          {activeTab === "prompt" ? (
            <button
              type="button"
              className="editor-assistant__apply editor-assistant__apply--prompt"
              disabled={promptDisabled}
              onClick={onApplyPrompt}
            >
              <span aria-hidden="true" className="editor-assistant__apply-icon">
                <EnterIcon size={14} />
              </span>
              <span>Apply instruction</span>
            </button>
          ) : (
            <button
              type="button"
              className="editor-assistant__apply"
              disabled={rewriteDisabled}
              onClick={onApplyRewrite}
            >
              {isRunningTransform ? (
                "Rewriting..."
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="editor-assistant__apply-icon"
                  >
                    <SparklesIcon size={16} />
                  </span>
                  <span>Rewrite </span>
                  <span className="editor-assistant__rewrite-hint">
                    {" "}
                    with <span className="editor-assistant__rewrite-highlight">{toneLabel}</span> tone and{" "}
                    <span className="editor-assistant__rewrite-highlight">{formatLabel}</span> format
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
