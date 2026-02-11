"""
Setup ChatTTS for LLM Local Assistant voice narration.

This script:
1. Checks Python version
2. Installs dependencies (ChatTTS, torch)
3. Downloads the model (~1GB)
4. Verifies setup is complete

Usage:
    python setup_tts.py
"""

import subprocess
import sys
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
        "ChatTTS",
        "numpy",
        "torch",
        "torchaudio",
    ]

    for dep in dependencies:
        print_info(f"Installing {dep}...")
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", dep],
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes per package
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


def download_model() -> bool:
    """Download ChatTTS model from HuggingFace."""
    print_step("Downloading ChatTTS model (~1GB)...")
    print_info("This may take a few minutes depending on your internet speed...")

    try:
        # Import and trigger model download
        from ChatTTS import ChatTTS

        print_info("Loading model...")
        model = ChatTTS.load()
        print_success("ChatTTS model downloaded and cached")
        return True

    except Exception as e:
        print_error(f"Failed to download model: {e}")
        return False


def verify_setup() -> bool:
    """Verify that setup is complete and working."""
    print_step("Verifying setup...")

    try:
        from ChatTTS import ChatTTS
        import torch

        # Load model
        print_info("Loading ChatTTS model...")
        model = ChatTTS.load()

        # Test synthesis
        print_info("Testing synthesis...")
        test_text = "Voice setup successful."
        wav = model.infer(test_text, lang="en", use_decoder=True)

        if wav is not None and len(wav) > 0:
            print_success("Voice narration is working!")
            return True
        else:
            print_error("Synthesis returned empty result")
            return False

    except Exception as e:
        print_error(f"Verification failed: {e}")
        return False


def main():
    """Run setup process."""
    print("=" * 60)
    print("LLM Local Assistant - Voice Narration Setup")
    print("=" * 60)

    steps = [
        ("Python version", check_python_version),
        ("pip availability", check_pip),
        ("Dependencies", install_dependencies),
        ("Model download", download_model),
        ("Verification", verify_setup),
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
    print("\nNext steps:")
    print("  1. Try /explain command in VS Code")
    print("  2. Narration should play automatically")
    print("  3. Enjoy your code explanations with audio!")
    print("\nTroubleshooting:")
    print("  - If /explain doesn't show audio, check settings")
    print("  - Re-run this script if issues persist")
    print("  - Check extension output for error messages")


if __name__ == "__main__":
    main()
