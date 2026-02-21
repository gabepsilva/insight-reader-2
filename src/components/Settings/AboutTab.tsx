import { invoke } from '@tauri-apps/api/core';
import './AboutTab.css';

export function AboutTab() {
  return (
    <div className="tab-content">
      <div className="about-section">
        <h3>Insight Reader</h3>
        <p>Version 2.0.0</p>
        <p>A cross-platform text-to-speech application.</p>
      </div>
      
      <div className="about-section">
        <h4>Links</h4>
        <ul>
          <li><a href="#" onClick={(e) => { e.preventDefault(); invoke('open_url', { url: 'https://github.com/gabepsilva/insight-reader-2' }); }}>GitHub</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); invoke('open_url', { url: 'https://insightreader.xyz' }); }}>Website</a></li>
        </ul>
      </div>

      <div className="about-section">
        <h4>Features</h4>
        <ul>
          <li>Piper - Offline neural text-to-speech</li>
          <li>AWS Polly - Cloud neural TTS</li>
          <li>Microsoft Edge TTS - Cloud neural TTS</li>
          <li>Grammar checking with Harper</li>
        </ul>
      </div>
    </div>
  );
}
