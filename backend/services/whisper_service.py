import os
import time

_whisper_model = None

def get_whisper_model(model_size="base"):
    """
    Lazily loads the faster-whisper model on CPU using int8 quantization for high speed and low memory.
    Supported model sizes: 'tiny', 'base', 'small', 'medium'.
    """
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            print(f">> [Faster-Whisper] Loading local Whisper '{model_size}' model (device=cpu, compute_type=int8)...")
            start_t = time.time()
            _whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
            print(f">> [Faster-Whisper] Model loaded successfully in {round(time.time() - start_t, 2)}s")
        except Exception as e:
            print(f">> [Faster-Whisper] Failed to load model: {e}")
            raise e
    return _whisper_model

def transcribe_audio_file_local(audio_path, model_size="base"):
    """
    Transcribes an audio recording using local faster-whisper.
    Returns the clean text transcript.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    file_size = os.path.getsize(audio_path)
    if file_size < 100:
        print(">> [Faster-Whisper] Audio file is too small or empty.")
        return "No audible speech detected in recording (empty audio payload)."

    print(f">> [Faster-Whisper] Starting local transcription for '{audio_path}' ({file_size} bytes)...")
    start_t = time.time()

    try:
        model = get_whisper_model(model_size)
        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        transcript_parts = []
        for segment in segments:
            text = segment.text.strip()
            if text:
                transcript_parts.append(text)

        full_transcript = " ".join(transcript_parts).strip()
        elapsed = round(time.time() - start_t, 2)
        print(f">> [Faster-Whisper] Completed in {elapsed}s (Detected lang: {info.language}, prob: {info.language_probability:.2f})")
        print(f">> [Faster-Whisper Transcript Generated]:\n{full_transcript}")

        return full_transcript or "No audible speech detected in recording."

    except Exception as err:
        print(f">> [Faster-Whisper Error]: {err}")
        raise RuntimeError(f"Local Whisper Transcription Error: {str(err)}")
