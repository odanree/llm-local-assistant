"""
Setup TTS for LLM Local Assistant voice narration using edge-tts.

This script:
1. Checks Python version
2. Installs edge-tts (cloud TTS)
3. Verifies setup is complete

No GPU required, no large model downloads.
Uses Microsoft Edge's cloud TTS API (cloud-based, requires internet).

Usage:
    python setup_tts.py
"""

import subprocess
import sys
import io
from pathlib import Path


def print_step(msg: str, level: int = 0) -> None:
    """Print formatted step message."""
    indent = "  " * level
    print(f"\n{indent}→ {msg}")


def print_success(msg: str) -> None:
    """Print success message."""
    print(f"✅ {msg}")


def print_error(msg: str) -> None:
    """Print error message."""
    print(f"❌ {msg}")


def print_info(msg: str) -> None:
    """Print info message."""
    print(f"ℹ️  {msg}")


def check_python_version() -> bool:
    """Check that Python 3.8+ is installed."""
    print_step("Checking Python version...")

    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print_error(f"Python 3.8+ required (found {version.major}.{version.minor})")
        return False

    print_success(f"Python {version.major}.{version.minor}.{version.micro}")
    return True


def check_pip() -> bool:
    """Check that pip is available."""
    print_step("Checking pip...")

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            print_success(result.stdout.strip())
            return True
    except Exception as e:
        print_error(f"pip check failed: {e}")

    return False


def install_dependencies() -> bool:
    """Install required Python packages."""
    print_step("Installing dependencies...")

    dependencies = [
        "edge-tts",
    ]

    for dep in dependencies:
        print_info(f"Installing {dep}...")
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", dep],
                capture_output=True,
                text=True,
                timeout=60,  # 1 minute per package
            )
            if result.returncode == 0:
                print_success(f"{dep} installed")
            else:
                print_error(f"Failed to install {dep}")
                print_info(f"Details: {result.stderr}")
                return False
        except subprocess.TimeoutExpired:
            print_error(f"Installation of {dep} timed out")
            return False
        except Exception as e:
            print_error(f"Error installing {dep}: {e}")
            return False

    return True


def verify_setup() -> bool:
    """Verify that edge-tts is working."""
    print_step("Verifying setup...")

    try:
        import edge_tts
        import asyncio

        print_info("Checking edge-tts installation...")
        print_success("edge-tts is installed and ready")
        
        # Note: We don't do a test synthesis here because it requires:
        # 1. Internet connection
        # 2. Async event loop setup
        # These are handled in the actual tts_service.py
        
        print_info("Cloud TTS (edge-tts) uses Microsoft's cloud API")
        print_info("No local model download needed - internet required only during synthesis")
        
        return True

    except ImportError:
        print_error("edge-tts import failed (may still be installing)")
        return False
    except Exception as e:
        print_error(f"Verification failed: {e}")
        return False


def main():
    """Run setup process."""
    # Force UTF-8 encoding for cross-platform compatibility
    # This ensures emoji and Unicode characters display correctly
    import io
    if sys.stdout.encoding != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    
    print("=" * 60)
    print("LLM Local Assistant - Voice Narration Setup")
    print("=" * 60)

    steps = [
        ("Python version", check_python_version),
        ("pip availability", check_pip),
        ("Dependencies", install_dependencies),
        ("TTS backend", verify_setup),
    ]

    for step_name, step_func in steps:
        try:
            if not step_func():
                print_error(f"{step_name} failed. Setup aborted.")
                sys.exit(1)
        except KeyboardInterrupt:
            print("\n❌ Setup cancelled by user")
            sys.exit(1)
        except Exception as e:
            print_error(f"Unexpected error in {step_name}: {e}")
            sys.exit(1)

    # Success!
    print("\n" + "=" * 60)
    print_success("Setup complete!")
    print("=" * 60)
    print("\nVoice narration is now enabled!")
    print("\nNotes:")
    print("  - edge-tts uses Microsoft's cloud TTS API")
    print("  - Requires internet connection during synthesis")
    print("  - No GPU needed, no large model downloads")
    print("  - Multiple languages supported")
    print("\nNext steps:")
    print("  1. Try /explain command in VS Code")
    print("  2. Audio narration should play automatically")
    print("  3. Enjoy your code explanations with voice!")
    print("\nTroubleshooting:")
    print("  - If /explain doesn't show audio, check internet connection")
    print("  - Check VS Code settings for voice-narration enabled")
    print("  - Check extension output (View > Output) for error messages")


if __name__ == "__main__":
    main()
