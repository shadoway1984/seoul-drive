"""Download CC0 recordings from Freesound and cut individual impacts for Seoul Drive."""
import array
import base64
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request

RATE = 24000
# Asset key, CC0 creator, sound ID, uploader ID, maximum excerpt in seconds.
SOURCES = [
    ("body_bump", "craigsmith", 675466, 2524442, .85),
    ("body_crash", "squareal", 237375, 1502374, 1.75),
    ("stone", "vestibule-door", 669719, 14100561, .70),
    ("road_bump", "Breviceps", 508170, 9159316, .40),
    ("metal_bar", "loganzsound", 873429, 16682330, .73),
    ("metal_crush", "craigsmith", 675475, 2524442, 1.20),
    ("wood", "deadrobotmusic", 610002, 11532701, .68),
    ("splash", "Fission9", 583348, 9395330, 1.65),
]


def excerpt(samples, limit):
    # Compare 5 ms energy against the 40 ms preceding it. This picks the
    # attack of a bump out of passing traffic and skips tape leader or room tone.
    hop = RATE // 200
    levels = [math.sqrt(sum(x*x for x in samples[i:i+hop])/hop)
              for i in range(0, len(samples)-hop+1, hop)]
    def attack(i):
        background = sum(levels[max(0,i-8):i])/8
        return max(levels[i:i+3]) - background
    event = max(range(len(levels)), key=attack)
    start = max(0, (event-3)*hop)
    end = min(len(samples), start + round(limit*RATE))
    clip = samples[start:end]
    peak = max(abs(x) for x in clip)
    if peak < 128 or len(clip) < RATE//20:
        raise ValueError("Empty or inaudible recording")
    # Only trim, fade edges and level-match. Keep the recorded acoustic decay.
    scale = 29000/peak
    pcm = array.array("h", (round(x*scale*min(1, i/24, (len(clip)-1-i)/720))
                            for i,x in enumerate(clip)))
    if sys.byteorder != "little":
        pcm.byteswap()
    return round(start/RATE,3), base64.b64encode(pcm.tobytes()).decode("ascii")


def main():
    clips = {}
    with tempfile.TemporaryDirectory() as tmp:
        for key, author, sid, uid, limit in SOURCES:
            dest = Path(tmp)/f"{sid}.mp3"
            url = f"https://cdn.freesound.org/previews/{sid//1000}/{sid}_{uid}-hq.mp3"
            request = urllib.request.Request(url, headers={"User-Agent":"SeoulDrive audio asset build"})
            with urllib.request.urlopen(request, timeout=40) as response:
                dest.write_bytes(response.read())
            raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(dest), "-ac", "1",
                                           "-ar", str(RATE), "-f", "s16le", "-"])
            samples = array.array("h")
            samples.frombytes(raw)
            if sys.byteorder != "little":
                samples.byteswap()
            start, pcm = excerpt(samples, limit)
            clips[key] = dict(author=author, id=sid, start=start, rate=RATE, pcm=pcm)
            print(f"{key}: {sid}, excerpt starts at {start:.3f} s")
    Path(sys.argv[1]).write_text("/* Downloaded Freesound recordings, CC0. */\nwindow.SEOUL_IMPACTS={\n"
        + ",\n".join(json.dumps(k)+":"+json.dumps(v,separators=(",",":")) for k,v in clips.items())
        + "\n};\n", encoding="utf8")


if __name__ == "__main__":
    main()
