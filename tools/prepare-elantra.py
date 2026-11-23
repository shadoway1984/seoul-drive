"""Prepare CC0 Freesound recordings for the game. Requires FFmpeg on PATH."""
import array
import base64
import json
import math
import pathlib
import subprocess
import sys
import tempfile
import urllib.request

RATE = 22050
SOURCES = [
    ("https://cdn.freesound.org/previews/874/874838_16682330-lq.mp3", 874838),
    ("https://cdn.freesound.org/previews/865/865228_13610145-lq.mp3", 865228),
]


def stable_section(signal, rev):
    # The second recording includes idle, rev-up and a held throttle.
    # Select a steady window of louder audio for the rev, away from transitions.
    blocks = []
    count = RATE // 5
    for start in range(0, len(signal) - count, count):
        section = signal[start:start + count:4]
        blocks.append(math.sqrt(sum(v * v for v in section) / len(section)))
    candidates = []
    for i in range(5, len(blocks) - 16):
        window = blocks[i:i + 14]
        mean = sum(window) / len(window)
        if mean < 30:
            continue
        spread = sum(abs(v - mean) for v in window) / (mean * len(window))
        score = (math.log(mean) if rev else 0) - 4 * spread
        candidates.append((score, i * count))
    if not candidates:
        raise ValueError("No audible stable window")
    return max(candidates)[1]


def loop(signal, start):
    fade = RATE // 12
    length = 2 * RATE
    def error(n):
        return sum((signal[start + j] - signal[start + n + j]) ** 2 for j in range(0, fade, 12))
    end = min(range(length - RATE // 32, length + RATE // 32, 2), key=error)
    samples = list(signal[start + fade:start + end])
    for j in range(fade):
        w = (1 - math.cos(math.pi * j / (fade - 1))) / 2
        samples.append(signal[start + end + j] * (1 - w) + signal[start + j] * w)
    rms = math.sqrt(sum(v * v for v in samples) / len(samples))
    gain = min(6800 / rms, 31500 / max(abs(v) for v in samples))
    pcm = array.array("h", (round(v * gain) for v in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    return base64.b64encode(pcm.tobytes()).decode()


def main():
    output = pathlib.Path(sys.argv[1])
    result = []
    with tempfile.TemporaryDirectory() as tmp:
        for index, (url, source_id) in enumerate(SOURCES):
            path = pathlib.Path(tmp) / f"{source_id}.mp3"
            if len(sys.argv) == 4:
                path = pathlib.Path(sys.argv[index + 2])
            else:
                request = urllib.request.Request(url, headers={"User-Agent": "SeoulDrive audio asset build"})
                with urllib.request.urlopen(request, timeout=35) as response:
                    path.write_bytes(response.read())
            raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1",
                                           "-ar", str(RATE), "-af", "highpass=f=25", "-f", "s16le", "-"])
            signal = array.array("h")
            signal.frombytes(raw)
            if sys.byteorder != "little":
                signal.byteswap()
            start = stable_section(signal, index == 1)
            print(f"Freesound {source_id}: {len(signal) / RATE:.2f}s, loop starts at {start / RATE:.2f}s")
            result.append({"id": source_id, "rate": RATE, "pcm": loop(signal, start)})
    output.write_text("/* Freesound CC0: loganzsound #874838, microman502 #865228. */\n"
                      + "window.ELANTRA_RECORDINGS=" + json.dumps(result, separators=(",", ":")) + ";\n")


if __name__ == "__main__":
    main()
