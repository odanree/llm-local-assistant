"""
Quick test of ChatTTS service.

Usage:
    python test_tts.py

Creates test_audio.wav in current directory if successful.
"""

import sys
import os
from pathlib import Path

# Add parent directory to path so we can import tts_service
sys.path.insert(0, str(Path(__file__).parent))

from tts_service import ChatTTSService


def test_basic_synthesis():
    """Test basic text-to-speech synthesis."""
    print("🧪 Testing ChatTTS Service\n")

    # Initialize service
    print("1️⃣  Initializing ChatTTS service...")
    service = ChatTTSService()
    print(f"   Device: {service.device}")

    # Get device info
    print("\n2️⃣  Device information:")
    info = service.get_info()
    for key, value in info.items():
        print(f"   {key}: {value}")

    # Test synthesis
    test_text = "Hello! This is a test of the voice narration feature. It sounds great!"
    print(f"\n3️⃣  Synthesizing test text:")
    print(f'   "{test_text}"')

    try:
        sample_rate, audio_bytes = service.synthesize(test_text, lang="en")

        print(f"\n✅ Synthesis successful!")
        print(f"   Sample rate: {sample_rate} Hz")
        print(f"   Audio size: {len(audio_bytes)} bytes")

        # Calculate duration
        duration = (len(audio_bytes) / 2) / sample_rate  # 16-bit = 2 bytes per sample
        print(f"   Duration: {duration:.2f} seconds")

        # Save to file
        output_path = Path(__file__).parent / "test_audio.wav"
        with open(output_path, "wb") as f:
            f.write(audio_bytes)

        print(f"\n4️⃣  Audio saved to: {output_path}")
        print(f"   File size: {len(audio_bytes) / 1024 / 1024:.2f} MB")

        # Try to play on macOS
        if sys.platform == "darwin":
            print("\n5️⃣  Playing audio...")
            os.system(f'afplay "{output_path}"')

        print("\n✅ Test passed! Voice narration is working.\n")
        return True

    except Exception as e:
        print(f"\n❌ Test failed: {e}\n")
        return False


def test_long_text():
    """Test synthesis of longer text."""
    print("🧪 Testing long text synthesis\n")

    service = ChatTTSService()

    long_text = """
    This is a longer explanation of how the system works.
    It has multiple sentences.
    Each sentence should be synthesized correctly.
    The audio quality should sound natural and conversational.
    Perfect for explaining code!
    """.strip()

    print(f"Synthesizing {len(long_text)} characters...")

    try:
        sample_rate, audio_bytes = service.synthesize(long_text, lang="en")
        duration = (len(audio_bytes) / 2) / sample_rate

        print(f"✅ Success!")
        print(f"   Duration: {duration:.2f} seconds")
        print(f"   Average: {len(long_text) / duration:.0f} chars/sec")
        return True

    except Exception as e:
        print(f"❌ Failed: {e}")
        return False


def test_chinese():
    """Test synthesis of Chinese text."""
    print("🧪 Testing Chinese text synthesis\n")

    service = ChatTTSService()
    chinese_text = "你好，这是一个测试。"

    print(f'Synthesizing: "{chinese_text}"')

    try:
        sample_rate, audio_bytes = service.synthesize(chinese_text, lang="zh")
        print(f"✅ Chinese synthesis successful!")
        print(f"   Audio size: {len(audio_bytes)} bytes")
        return True

    except Exception as e:
        print(f"⚠️  Chinese synthesis not available (optional): {e}")
        return False  # Not required


def main():
    """Run all tests."""
    print("=" * 60)
    print("LLM Local Assistant - ChatTTS Service Test")
    print("=" * 60 + "\n")

    tests = [
        ("Basic synthesis", test_basic_synthesis),
        ("Long text", test_long_text),
        ("Chinese text", test_chinese),
    ]

    passed = 0
    failed = 0

    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {test_name} crashed: {e}\n")
            failed += 1

    # Summary
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return failed == 0 or (failed == 1 and "Chinese" in "")  # Chinese is optional


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
