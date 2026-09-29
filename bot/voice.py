import os
import tempfile
import subprocess
import speech_recognition as sr

# Find ffmpeg binary
FFMPEG_PATH = "ffmpeg"
for candidate in [
    r"C:\Users\Artrax\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe",
    "ffmpeg.exe",
    "ffmpeg",
]:
    if os.path.exists(candidate):
        FFMPEG_PATH = candidate
        break

recognizer = sr.Recognizer()

def convert_ogg_to_wav(ogg_path: str, wav_path: str) -> bool:
    try:
        cmd = [
            FFMPEG_PATH,
            "-y",
            "-i", ogg_path,
            "-ar", "16000",
            "-ac", "1",
            wav_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
        return res.returncode == 0
    except Exception as e:
        print(f"[Voice] FFmpeg conversion error: {e}")
        return False

def recognize_voice_file(ogg_path: str) -> str:
    wav_fd, wav_path = tempfile.mkstemp(suffix=".wav")
    os.close(wav_fd)

    try:
        ok = convert_ogg_to_wav(ogg_path, wav_path)
        if not ok or not os.path.exists(wav_path) or os.path.getsize(wav_path) == 0:
            return ""

        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
            text = recognizer.recognize_google(audio_data, language="ru-RU")
            return text.strip()
    except sr.UnknownValueError:
        print("[Voice] Google Speech Recognition could not understand audio")
        return ""
    except sr.RequestError as e:
        print(f"[Voice] Could not request results from Google Speech Recognition; {e}")
        return ""
    except Exception as e:
        print(f"[Voice] Unexpected recognition error: {e}")
        return ""
    finally:
        if os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except:
                pass
