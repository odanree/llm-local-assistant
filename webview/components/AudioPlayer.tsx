/**
 * AudioPlayer Component
 * 
 * React component for playing synthesized audio with controls:
 * - Play/Pause
 * - Progress bar (seek)
 * - Volume control
 * - Speed control
 * - Time display
 */

import React, { useRef, useState, useEffect } from 'react';
import './audioPlayer.css';

interface AudioPlayerProps {
  audioBuffer: Uint8Array;
  sampleRate: number;
  duration: number;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  autoplay?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioBuffer,
  sampleRate,
  duration,
  onPlay,
  onPause,
  onEnded,
  autoplay = false,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);

  // Convert audio buffer to data URL
  const audioUrl = React.useMemo(() => {
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }, [audioBuffer]);

  // Set up audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = speed;

      if (autoplay) {
        audioRef.current.play().catch((err) => {
          console.warn('Autoplay failed:', err);
        });
      }

      setIsLoading(false);
    }

    return () => {
      URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl, volume, speed, autoplay]);

  // Event handlers
  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      onPause?.();
    } else {
      audioRef.current.play();
      setIsPlaying(true);
      onPlay?.();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    onEnded?.();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSpeed = parseFloat(e.target.value);
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="player-controls">
        {/* Play/Pause Button */}
        <button
          className="control-button play-button"
          onClick={handlePlayPause}
          disabled={isLoading}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <span className="spinner">⏳</span>
          ) : isPlaying ? (
            <span className="icon">⏸</span>
          ) : (
            <span className="icon">▶</span>
          )}
        </button>

        {/* Progress Bar */}
        <div className="progress-container">
          <input
            type="range"
            className="progress-bar"
            min="0"
            max={duration}
            value={currentTime}
            onChange={handleSeek}
            disabled={isLoading}
          />
        </div>

        {/* Time Display */}
        <div className="time-display">
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="separator">/</span>
          <span className="total-time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Secondary Controls */}
      <div className="secondary-controls">
        {/* Speed Control */}
        <div className="control-group">
          <label htmlFor="speed-select">Speed</label>
          <select
            id="speed-select"
            className="speed-select"
            value={speed}
            onChange={handleSpeedChange}
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>

        {/* Volume Control */}
        <div className="control-group">
          <label htmlFor="volume-slider" className="volume-label">
            🔊
          </label>
          <input
            id="volume-slider"
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            title="Volume"
          />
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
