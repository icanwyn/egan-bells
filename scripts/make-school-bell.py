#!/usr/bin/env python3
"""Render a brass school-bell WAV: modal synthesis + strike + speaker rumble."""

import math
import random
import struct
import wave
from pathlib import Path

SR = 44100
STRIKES = (0.0, 0.95, 1.90)
PRIME = 698.46  # F5 — bright hanging / desk school bell
# ratio, amplitude, decay seconds (higher modes die first)
MODES = (
    (0.500, 0.42, 3.60),  # hum
    (1.000, 1.00, 2.50),  # prime
    (1.200, 0.92, 2.10),  # tierce — the "that's a bell" color
    (1.500, 0.40, 1.55),  # quint
    (2.000, 0.58, 1.25),  # nominal
    (2.514, 0.22, 0.85),
    (3.000, 0.26, 0.72),
    (4.200, 0.13, 0.48),
    (5.400, 0.08, 0.32),
    (6.727, 0.05, 0.22),
    (8.000, 0.03, 0.16),
)


def render() -> list[float]:
    length = 4.6
    n = int(SR * length)
    out = [0.0] * n
    rng = random.Random(7)

    for strike in STRIKES:
        start = int(strike * SR)
        for i in range(start, n):
            t = (i - start) / SR
            acc = 0.0

            # Wooden/brass hammer click
            if t < 0.018:
                acc += (rng.random() * 2 - 1) * math.exp(-t / 0.0032) * 0.55

            # Body rumble — makes a phone speaker physically buzz
            if t < 0.22:
                acc += math.sin(2 * math.pi * 72 * t) * math.exp(-t / 0.07) * 0.55
                acc += math.sin(2 * math.pi * 98 * t) * math.exp(-t / 0.05) * 0.22

            # Pitch sags a hair on the strike, then settles
            sag = 1.0 + 0.018 * math.exp(-t / 0.016)

            for ratio, amp, decay in MODES:
                f = PRIME * ratio * sag
                # Two close partials beat and shimmer like real bronze
                env = amp * math.exp(-t / decay)
                phase = 2 * math.pi * f * t
                acc += env * math.sin(phase)
                acc += env * 0.28 * math.sin(phase * 1.0018 + 0.4)

            out[i] += acc

    peak = max(abs(x) for x in out) or 1.0
    scale = 0.89 / peak
    return [x * scale for x in out]


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(
            struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples
        )
        w.writeframes(frames)


if __name__ == "__main__":
    dest = Path(__file__).resolve().parents[1] / "public" / "school-bell.wav"
    write_wav(dest, render())
    print(f"wrote {dest} ({dest.stat().st_size} bytes)")
