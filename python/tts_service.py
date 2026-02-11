"""
ChatTTS Service - Text-to-Speech synthesis for code explanations

Usage:
    python tts_service.py --text "Hello world"
    python tts_service.py --text "Hello" --lang en
    python tts_service.py --info
"""

import sys
import json
import io
import wave
from typing import Tuple, Optional
from pathlib import Path

# Type hints for clarity
AudioBuffer = bytes
SampleRate = int


class ChatTTSService:
    """
    Wrapper for ChatTTS model with synthesis API.
    
    Handles:
    - Model loading (cached after first load)
    - Text synthesis to audio
    - Audio format conversion (numpy -> WAV)
    - Device detection (GPU vs CPU)
    - Error handling with JSON output
    """

    def __init__(self, device: Optional[str] = None):
        """
        Initialize ChatTTS service.
        
        Args:
            device: 'cuda', 'cpu', or None (auto-detect)
        """
        self.device = device or self._get_device()
        self.model = None
        self.sample_rate = 24000  # ChatTTS standard
        self._model_loaded = False

    def _get_device(self) -> str:
        """Detect available device (GPU or CPU)."""
        try:
            import torch
            return "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            return "cpu"

    def load_model(self) -> bool:
        """
        Load ChatTTS model from HuggingFace.
        
        Returns:
            True if successful, False otherwise
        """
        if self._model_loaded:
            return True

        try:
            import torch
            from ChatTTS import ChatTTS

            # Load model
            self.model = ChatTTS.load(device=self.device)
            self._model_loaded = True
            return True

        except Exception as e:
            error_msg = f"Failed to load ChatTTS model: {str(e)}"
            self._print_error(error_msg)
            return False

    def synthesize(
        self, text: str, lang: str = "en"
    ) -> Tuple[SampleRate, AudioBuffer]:
        """
        Generate audio from text.

        Args:
            text: Text to synthesize
            lang: Language ('en' or 'zh')

        Returns:
            Tuple of (sample_rate, audio_bytes)

        Raises:
            Exception: If synthesis fails
        """
        if not self._model_loaded:
            if not self.load_model():
                raise Exception("Model loading failed")

        try:
            # Generate audio (returns numpy array)
            # Model returns shape (1, audio_length)
            wav = self.model.infer(text, lang=lang, use_decoder=True)

            # Convert to WAV bytes
            audio_bytes = self._numpy_to_wav(wav[0], self.sample_rate)
            return self.sample_rate, audio_bytes

        except Exception as e:
            raise Exception(f"TTS synthesis failed: {str(e)}")

    def _numpy_to_wav(self, audio: "numpy.ndarray", sample_rate: int) -> AudioBuffer:
        """
        Convert numpy audio array to WAV bytes.

        Args:
            audio: Numpy array (float, range [-1, 1])
            sample_rate: Sample rate in Hz

        Returns:
            WAV bytes (16-bit PCM)
        """
        import numpy as np

        # Ensure audio is numpy array
        if not isinstance(audio, np.ndarray):
            raise ValueError("Audio must be numpy array")

        # Normalize to [-1, 1]
        audio = np.clip(audio, -1.0, 1.0)

        # Convert to 16-bit PCM
        # Range: [-32768, 32767]
        audio_int16 = np.int16(audio * 32767)

        # Create WAV file in memory
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_int16.tobytes())

        return wav_buffer.getvalue()

    def get_info(self) -> dict:
        """Get device and model information."""
        return {
            "device": self.device,
            "cuda_available": self._cuda_available(),
            "sample_rate": self.sample_rate,
            "model_loaded": self._model_loaded,
        }

    def _cuda_available(self) -> bool:
        """Check if CUDA is available."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    @staticmethod
    def _print_error(message: str) -> None:
        """Print error as JSON to stderr."""
        print(json.dumps({"error": message}), file=sys.stderr)

    @staticmethod
    def _print_info(info: dict) -> None:
        """Print info as JSON to stderr."""
        print(json.dumps(info), file=sys.stderr)


def main():
    """CLI interface for TTS service."""
    import argparse

    parser = argparse.ArgumentParser(description="ChatTTS Text-to-Speech Service")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--lang", default="en", help="Language (en or zh)")
    parser.add_argument("--device", default=None, help="Device (cuda or cpu)")
    parser.add_argument("--info", action="store_true", help="Print device info")

    args = parser.parse_args()

    service = ChatTTSService(device=args.device)

    # Mode 1: Print info
    if args.info:
        info = service.get_info()
        ChatTTSService._print_info(info)
        return

    # Mode 2: Synthesize speech
    if not args.text:
        parser.print_help()
        sys.exit(1)

    try:
        # Synthesize
        sample_rate, audio_bytes = service.synthesize(args.text, lang=args.lang)

        # Write audio bytes to stdout
        sys.stdout.buffer.write(audio_bytes)

        # Write metadata to stderr
        metadata = {
            "sample_rate": sample_rate,
            "size": len(audio_bytes),
            "duration": (len(audio_bytes) / 2) / sample_rate,  # 16-bit = 2 bytes per sample
        }
        ChatTTSService._print_info(metadata)

    except Exception as e:
        ChatTTSService._print_error(str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
