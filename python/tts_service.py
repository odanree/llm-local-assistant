"""
TTS Service - Text-to-Speech synthesis using edge-tts

Uses Microsoft Edge's TTS which is reliable and works cross-platform.
No GPU required, no complex setup.

Usage:
    python tts_service.py --text "Hello world"
    python tts_service.py --text "Hello" --lang en
    python tts_service.py --info
"""

import sys
import json
import asyncio
import tempfile
import os
from typing import Tuple, Optional

try:
    import edge_tts
except ImportError:
    edge_tts = None

# Type hints for clarity
AudioBuffer = bytes
SampleRate = int


class TTSService:
    """
    Cloud-based TTS Service using edge-tts.
    
    Reliable and works on all platforms without GPU or model downloads.
    """

    def __init__(self, device: Optional[str] = None):
        """
        Initialize TTS service.
        
        Args:
            device: Ignored (kept for compatibility)
        """
        self.sample_rate = 24000  # edge-tts uses 24kHz
        self._model_loaded = edge_tts is not None

    def load_model(self) -> bool:
        """Check if edge-tts is available."""
        return edge_tts is not None

    def synthesize(
        self, text: str, lang: str = "en"
    ) -> Tuple[SampleRate, AudioBuffer]:
        """
        Generate audio from text using edge-tts.

        Args:
            text: Text to synthesize
            lang: Language ('en' or 'zh')

        Returns:
            Tuple of (sample_rate, audio_bytes)

        Raises:
            Exception: If synthesis fails
        """
        if edge_tts is None:
            raise Exception("edge-tts not installed. Run: pip install edge-tts")
        
        try:
            # Select voice based on language
            voice = "en-US-AriaNeural" if lang == "en" else "zh-CN-XiaoxiaoNeural"
            
            # Create communicate instance
            communicate = edge_tts.Communicate(text=text, voice=voice, rate="+0%")
            
            # Create temporary file for audio
            fd, temp_path = tempfile.mkstemp(suffix='.mp3')
            os.close(fd)
            
            try:
                # Run async synthesis
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(communicate.save(temp_path))
                finally:
                    loop.close()
                
                # Read the MP3 file
                with open(temp_path, 'rb') as f:
                    audio_bytes = f.read()
                
                if not audio_bytes or len(audio_bytes) == 0:
                    raise Exception("No audio generated")
                
                # For MP3, we can't easily determine exact sample rate from file
                # edge-tts outputs MP3 at 24kHz, so we'll return that
                return self.sample_rate, audio_bytes
                
            finally:
                # Clean up temp file
                if os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
                        
        except Exception as e:
            raise Exception(f"TTS synthesis failed: {str(e)}")

    def get_info(self) -> dict:
        """Get device and service information."""
        return {
            "device": "cloud",
            "cuda_available": False,
            "sample_rate": self.sample_rate,
            "model_loaded": self._model_loaded,
            "backend": "edge-tts",
            "native_tts": False,
        }

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
    # Force UTF-8 encoding for cross-platform compatibility
    import io
    if sys.stdout.encoding != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    
    import argparse

    parser = argparse.ArgumentParser(description="Cloud TTS Service (edge-tts)")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--lang", default="en", help="Language (en or zh)")
    parser.add_argument("--info", action="store_true", help="Print device info")

    args = parser.parse_args()

    service = TTSService()

    # Mode 1: Print info
    if args.info:
        info = service.get_info()
        TTSService._print_info(info)
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
            "duration": len(audio_bytes) / 16000,  # MP3 bitrate ~128kbps = 16KB/s
        }
        TTSService._print_info(metadata)

    except Exception as e:
        TTSService._print_error(str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()


