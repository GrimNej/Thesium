"""Narration for Thesium films: local text-to-speech (Kokoro) and a hearing check (Whisper).

Thesium runs this for you (`thesium sound voice`) and passes model paths and job files:

    python voice.py kokoro <model.onnx> <voices.bin> <jobs.json>   synthesise lines, one model load
    python voice.py voices <model.onnx> <voices.bin>                list the voice ids
    python voice.py hear <audio.wav> <out.json> [model] [language] [hotwords]   transcribe with word times
    python voice.py phonemes <model.onnx> <voices.bin> <lang> <words…>      how Kokoro says words

Kokoro-82M (Apache-2.0) runs on the CPU through kokoro-onnx (MIT); faster-whisper (MIT) runs
OpenAI's Whisper models. Both are optional: `pip install kokoro-onnx faster-whisper`.
"""
import json
import sys
import wave

import numpy as np

# Kokoro voice ids start with a letter for their language: af_heart is American English.
LANG = {"a": "en-us", "b": "en-gb", "e": "es", "f": "fr-fr", "h": "hi", "i": "it", "j": "ja", "p": "pt-br", "z": "cmn"}


def write_wav(path, samples, rate):
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def kokoro(model, voices, jobs_file):
    from kokoro_onnx import Kokoro

    with open(jobs_file, encoding="utf-8") as f:
        jobs = json.load(f)
    tts = Kokoro(model, voices)
    known = set(tts.get_voices())
    for job in jobs:
        voice = job["voice"]
        if voice not in known:
            raise SystemExit(f"Unknown Kokoro voice {voice!r}. Voices: {', '.join(sorted(known))}")
        lang = job.get("lang") or LANG.get(voice[0], "en-us")
        samples, rate = tts.create(job["text"], voice=voice, speed=float(job.get("speed", 1.0)), lang=lang)
        write_wav(job["out"], samples, rate)
        print(json.dumps({"out": job["out"], "seconds": round(len(samples) / rate, 3)}), flush=True)


def voices(model, voices_file):
    from kokoro_onnx import Kokoro

    for v in sorted(Kokoro(model, voices_file).get_voices()):
        print(v)


def phonemes(model, voices_file, lang, *words):
    from kokoro_onnx import Kokoro

    tts = Kokoro(model, voices_file)
    print(json.dumps({w: tts.tokenizer.phonemize(w, lang) for w in words}, ensure_ascii=False))


def read_wav16k(path):
    """Samples of the 16 kHz mono 16-bit WAV Thesium decodes for Whisper, as float32 in [-1, 1].
    Whisper gets samples rather than a file, so faster-whisper never decodes with PyAV."""
    with wave.open(path, "rb") as w:
        if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (16000, 1, 2):
            raise ValueError(f"{path}: expected a 16 kHz mono 16-bit WAV")
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0


def hear(audio, out, model="small", language=None, hotwords=None):
    from faster_whisper import WhisperModel

    whisper = WhisperModel(model, device="cpu", compute_type="int8")
    segments, info = whisper.transcribe(
        read_wav16k(audio),
        language=language or None,
        word_timestamps=True,
        beam_size=5,
        condition_on_previous_text=False,
        hotwords=hotwords or None,
    )
    words = [
        {"word": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2), "p": round(w.probability, 2)}
        for s in segments
        for w in (s.words or [])
    ]
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"model": model, "language": info.language, "words": words}, f, ensure_ascii=False)
    print(json.dumps({"words": len(words), "language": info.language}))


if __name__ == "__main__":
    command, args = sys.argv[1], sys.argv[2:]
    {"kokoro": kokoro, "voices": voices, "phonemes": phonemes, "hear": hear}[command](*args)
