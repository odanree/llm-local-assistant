/**
 * ExplanationPanel - Webview Panel for Code Explanations
 * 
 * Displays:
 * - Code explanation (from LLM)
 * - Optional audio narration (via AudioPlayer)
 * - Metadata (generation time, model info)
 */

import React, { useState } from 'react';
import AudioPlayer from './AudioPlayer';
import './explanationPanel.css';

interface ExplanationPanelProps {
  explanation: string;
  audioBuffer?: Uint8Array;
  audioMetadata?: {
    sampleRate: number;
    duration: number;
  };
  code: string;
  fileName?: string;
  generationTime?: number; // milliseconds
  modelInfo?: string;
}

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({
  explanation,
  audioBuffer,
  audioMetadata,
  code,
  fileName,
  generationTime,
  modelInfo,
}) => {
  const [showCode, setShowCode] = useState(false);

  const hasAudio = audioBuffer && audioMetadata;

  return (
    <div className="explanation-panel">
      {/* Header */}
      <div className="panel-header">
        <h2 className="panel-title">📝 Code Explanation</h2>
        {fileName && <span className="file-name">{fileName}</span>}
      </div>

      {/* Audio Player (if available) */}
      {hasAudio && (
        <div className="audio-section">
          <div className="section-label">🎧 Narration</div>
          <AudioPlayer
            audioBuffer={audioBuffer}
            sampleRate={audioMetadata.sampleRate}
            duration={audioMetadata.duration}
            autoplay={false}
          />
        </div>
      )}

      {/* Explanation */}
      <div className="explanation-section">
        <div className="section-label">
          {hasAudio ? '📖 Text' : '📝 Explanation'}
        </div>
        <div className="explanation-content">
          {explanation.split('\n').map((line, idx) => (
            <React.Fragment key={idx}>
              {line}
              <br />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Code Snippet (Toggleable) */}
      <div className="code-section">
        <button
          className="toggle-button"
          onClick={() => setShowCode(!showCode)}
        >
          {showCode ? '▼' : '▶'} {code.split('\n').length} lines of code
        </button>
        {showCode && (
          <pre className="code-block">
            <code>{code}</code>
          </pre>
        )}
      </div>

      {/* Metadata Footer */}
      <div className="panel-footer">
        <div className="metadata">
          {generationTime && (
            <span className="metadata-item">
              ⏱️ Generated in {generationTime}ms
            </span>
          )}
          {modelInfo && (
            <span className="metadata-item">🤖 {modelInfo}</span>
          )}
          {hasAudio && (
            <span className="metadata-item">
              🔊 Audio: {audioMetadata.duration.toFixed(1)}s
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExplanationPanel;
