"""Generate original fight-audio samples for UNBEATEN: 50-0.

All sounds are synthesised from scratch with numpy — 100% original, so they
carry no licence or attribution requirements (effectively CC0, your own).
Writes 16-bit mono WAV files into assets/audio/.

  bell.wav         — boxing ring bell (struck, inharmonic partials, long ring)
  punch1..3.wav    — glove impacts (thump + smack), 3 variants to avoid repetition
  punch_heavy.wav  — the big knockdown slam (deeper sub + rumble tail)
  crowd.wav        — seamless ~4s crowd-murmur loop for live fights
  cheer.wav        — crowd roar/pop for knockdowns and wins

Usage:  python tools/gen_fight_audio.py
"""
import os
import wave
import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")


def fft_filter(x, lo=None, hi=None):
    """Cheap brickwall band filter via rFFT (fine for SFX)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    mask = np.ones_like(f)
    if lo is not None:
        mask *= (f >= lo)
    if hi is not None:
        mask *= (f <= hi)
    return np.fft.irfft(X * mask, n=len(x))


def write_wav(name, sig, gain=0.92):
    sig = np.asarray(sig, dtype=np.float64)
    peak = np.abs(sig).max() or 1.0
    sig = sig / peak * gain
    # soft clip for safety
    sig = np.tanh(sig * 1.05)
    data = (sig * 32767.0).astype("<i2")
    path = os.path.join(OUT, name)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print("saved %s  %.0f ms  %.0f KB" % (name, len(sig) / SR * 1000, len(data.tobytes()) / 1024))


def ring_bell(dur=1.7, f0=587.0):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # (ratio, amplitude, decay-rate) — inharmonic, like a real struck bell
    partials = [
        (1.00, 1.00, 1.4), (2.01, 0.62, 1.9), (2.77, 0.44, 2.6),
        (3.52, 0.30, 3.3), (4.25, 0.20, 4.1), (5.43, 0.13, 5.2), (6.80, 0.08, 6.4),
    ]
    sig = np.zeros_like(t)
    for ratio, amp, dk in partials:
        env = np.exp(-dk * t)
        beat = 1.0 + 0.025 * np.sin(2 * np.pi * (2.7 * ratio) * t)  # subtle metallic beating
        sig += amp * env * beat * np.sin(2 * np.pi * f0 * ratio * t)
    # metallic strike transient
    cl = int(SR * 0.007)
    click = np.random.uniform(-1, 1, cl) * np.exp(-np.linspace(0, 7, cl))
    sig[:cl] += 0.6 * click
    return sig


def punch(dur=0.30, f_start=165, f_end=48, smack=(700, 2300), heavy=False):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    # pitched thump — exponential downward glide
    f = f_start * (f_end / f_start) ** (t / dur)
    phase = 2 * np.pi * np.cumsum(f) / SR
    thump = np.sin(phase) * np.exp(-(11 if heavy else 20) * t)
    # smack — short bandpassed noise burst (the leather crack)
    noise = np.random.uniform(-1, 1, n)
    smk = fft_filter(noise, smack[0], smack[1]) * np.exp(-(28 if heavy else 42) * t)
    sig = 0.9 * thump + (0.62 if heavy else 0.5) * smk
    if heavy:
        sig += np.sin(2 * np.pi * 44 * t) * np.exp(-7 * t) * 0.55  # sub rumble tail
    return sig


def crowd(dur=4.0):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    white = np.random.uniform(-1, 1, n)
    brown = np.cumsum(white)
    brown -= brown.mean()
    brown /= (np.abs(brown).max() or 1.0)
    body = fft_filter(brown, hi=480)                                   # low murmur
    wash = fft_filter(np.random.uniform(-1, 1, n), lo=480, hi=2400) * 0.28   # airy top
    lfo = 0.68 + 0.32 * (np.sin(2 * np.pi * 0.29 * t) + 0.5 * np.sin(2 * np.pi * 0.13 * t + 1.1))
    sig = (body * 0.95 + wash) * lfo
    # seamless loop: crossfade the tail into the head
    xf = int(SR * 0.3)
    fade = np.linspace(0, 1, xf)
    sig[:xf] = sig[-xf:] * (1 - fade) + sig[:xf] * fade
    return sig[:n - xf]


def cheer(dur=1.7):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    body = fft_filter(np.random.uniform(-1, 1, n), hi=1900)
    high = fft_filter(np.random.uniform(-1, 1, n), lo=1500, hi=4600) * 0.45
    swell = np.minimum(1.0, t / 0.22) * np.exp(-1.15 * np.maximum(0, t - 0.55))
    sig = (body + high * np.clip(t / 0.4, 0, 1)) * swell
    return sig


def main():
    os.makedirs(OUT, exist_ok=True)
    np.random.seed(50)  # reproducible
    write_wav("bell.wav", ring_bell(), gain=0.85)
    write_wav("punch1.wav", punch(f_start=170, f_end=50, smack=(700, 2300)))
    write_wav("punch2.wav", punch(f_start=150, f_end=44, smack=(600, 2000)))
    write_wav("punch3.wav", punch(f_start=185, f_end=54, smack=(850, 2600)))
    write_wav("punch_heavy.wav", punch(dur=0.5, f_start=140, f_end=36, smack=(450, 1800), heavy=True), gain=0.95)
    write_wav("crowd.wav", crowd(), gain=0.7)
    write_wav("cheer.wav", cheer(), gain=0.8)


if __name__ == "__main__":
    main()
