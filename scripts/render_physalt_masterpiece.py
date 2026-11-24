#!/usr/bin/env python3
"""
PhysALT — Masterpiece Launch Film & Vertical Reel Studio Pipeline
Combines:
  - 4 bespoke cinema plates (compatible 1:1 with Google Flow / Veo 3.1 Frames-to-Video)
  - Live 1080p Playwright UI captures + real live-recorded 1 Light-Day Light Pulse (c) video
  - Apple x Linear x Teenage Engineering Swiss Inter typography & rhythmic 42s escalation arc
  - Custom 48kHz stereo cinema soundtrack + frame-synced tactile glass foley & Doppler photon riser
Outputs:
  - dist/videos/PhysALT_Launch_Masterpiece_16x9.mp4 (1920x1080, 30fps, 42s)
  - dist/videos/PhysALT_Launch_Reel_9x16.mp4 (1080x1920, 30fps, 28s)
  - Contact sheets for frame-by-frame visual QA
"""
import array
import glob
import math
import os
import shutil
import struct
import subprocess
import sys
import wave
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = "/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/aba07de0-d2b9-480c-b489-f80681fec2f8"
FONT_PATH = os.path.join(REPO_ROOT, "public/vendor/inter-var.woff2")
ICON_PATH = os.path.join(REPO_ROOT, "public/icon-512.png")
CAP_DIR = "/tmp/physalt_film/captures"
VRAW_DIR = "/tmp/physalt_film/video_raw"
SPACE_FRAMES_DIR = "/tmp/physalt_film/space_frames"
OUT_DIR = os.path.join(REPO_ROOT, "dist/videos")
os.makedirs(OUT_DIR, exist_ok=True)

FPS = 30
CRIMSON = (208, 110, 110)
CRIMSON_DEEP = (160, 70, 70)
OBSIDIAN = (5, 5, 6)
WHITE = (248, 248, 250)
SILVER = (176, 176, 184)


def find_plate(prefix):
    matches = sorted(glob.glob(os.path.join(ARTIFACT_DIR, f"{prefix}*.jpg")) +
                     glob.glob(os.path.join(ARTIFACT_DIR, f"{prefix}*.png")))
    if not matches:
        raise FileNotFoundError(f"Missing generated plate: {prefix}")
    return matches[-1]


def load_font(size, weight=500):
    candidates = [
        FONT_PATH,
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if weight >= 600 else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                f = ImageFont.truetype(path, size)
                if path == FONT_PATH:
                    try:
                        f.set_variation_by_axes([weight])
                    except Exception:
                        pass
                return f
            except Exception:
                continue
    return ImageFont.load_default()


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1.0 - (1.0 - t) ** 3


def ease_in_out(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def ken_burns(img, out_w, out_h, t, z0=1.0, z1=1.08, px0=0.0, px1=0.0, py0=0.0, py1=0.0):
    """Smooth cinema dolly zoom + subtle pan with aspect-fill cover cropping."""
    p = ease_in_out(t)
    zoom = z0 + (z1 - z0) * p
    iw, ih = img.size
    target_ratio = out_w / out_h
    src_ratio = iw / ih
    if src_ratio > target_ratio:
        base_h = ih
        base_w = ih * target_ratio
    else:
        base_w = iw
        base_h = iw / target_ratio
    cw = base_w / zoom
    ch = base_h / zoom
    cx = iw * 0.5 + (px0 + (px1 - px0) * p) * iw
    cy = ih * 0.5 + (py0 + (py1 - py0) * p) * ih
    x0 = max(0.0, min(iw - cw, cx - cw * 0.5))
    y0 = max(0.0, min(ih - ch, cy - ch * 0.5))
    cropped = img.crop((x0, y0, x0 + cw, y0 + ch))
    return cropped.resize((out_w, out_h), Image.Resampling.LANCZOS)


def make_vignette(w, h, strength=0.45):
    # Fast, smooth radial cinema vignette in pure PIL
    sw, sh = 240, int(240 * h / w)
    mask = Image.new("L", (sw, sh), int(255 * strength))
    d = ImageDraw.Draw(mask)
    pad_x = int(sw * 0.14)
    pad_y = int(sh * 0.14)
    d.ellipse([pad_x, pad_y, sw - pad_x, sh - pad_y], fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=34)).resize((w, h), Image.Resampling.BILINEAR)
    vig = Image.new("RGBA", (w, h), (4, 4, 6, 255))
    vig.putalpha(mask)
    return vig


def draw_centered_text(draw, text, y, font, fill, w):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) / 2, y), text, font=font, fill=fill)


def overlay_lower_label(frame, eyebrow, title, alpha, w, h):
    """Minimalist Apple/Linear lower-left or bottom-center editorial caption."""
    if alpha <= 0.01:
        return frame
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    # Soft bottom gradient scrim for guaranteed legibility
    scrim_h = int(h * 0.24)
    for row in range(scrim_h):
        a = int(175 * ((row / scrim_h) ** 1.45) * alpha)
        d.line([(0, h - scrim_h + row), (w, h - scrim_h + row)], fill=(5, 5, 6, a))

    f_eye = load_font(int(h * 0.022), 500)
    f_tit = load_font(int(h * 0.044), 600)
    y_base = int(h * 0.835)
    if eyebrow:
        draw_centered_text(d, eyebrow, y_base - int(h * 0.036), f_eye, (*CRIMSON, int(240 * alpha)), w)
    draw_centered_text(d, title, y_base, f_tit, (*WHITE, int(250 * alpha)), w)
    return Image.alpha_composite(frame.convert("RGBA"), ov).convert("RGB")


def render_title_card(w, h, line1, line2, t_local, accent_line=True):
    """Pure obsidian Swiss kinetic title beat."""
    img = Image.new("RGBA", (w, h), (*OBSIDIAN, 255))
    d = ImageDraw.Draw(img)
    # Subtle radial glow behind text
    a1 = ease_out(min(1.0, t_local / 0.45))
    a2 = ease_out(max(0.0, min(1.0, (t_local - 0.35) / 0.45)))
    fade_out = 1.0 - ease_out(max(0.0, (t_local - 0.80) / 0.20)) if t_local > 0.80 else 1.0

    f1 = load_font(int(h * 0.068), 600)
    f2 = load_font(int(h * 0.068), 400)
    y1 = int(h * 0.42 - (1.0 - a1) * 18)
    draw_centered_text(d, line1, y1, f1, (*WHITE, int(252 * a1 * fade_out)), w)
    if line2:
        y2 = int(h * 0.515 - (1.0 - a2) * 18)
        draw_centered_text(d, line2, y2, f2, (*SILVER, int(235 * a2 * fade_out)), w)
    if accent_line:
        lw = int(w * 0.055 * a1)
        cy = int(h * 0.385)
        d.line([(w // 2 - lw // 2, cy), (w // 2 + lw // 2, cy)], fill=(*CRIMSON_DEEP, int(220 * a1 * fade_out)), width=3)
    return img.convert("RGB")


def render_endplate(w, h, t_norm, icon_img):
    """Iconic minimalist Swiss endplate: gallery-white orbital icon + PhysALT."""
    img = Image.new("RGBA", (w, h), (*OBSIDIAN, 255))
    d = ImageDraw.Draw(img)
    a_icon = ease_out(min(1.0, t_norm / 0.32))
    a_title = ease_out(max(0.0, min(1.0, (t_norm - 0.14) / 0.30)))
    a_sub = ease_out(max(0.0, min(1.0, (t_norm - 0.30) / 0.32)))

    # Soft obsidian-crimson ambient halo behind icon
    halo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    r_h = int(min(w, h) * 0.14)
    cx, cy_i = w // 2, int(h * 0.38)
    hd.ellipse([cx - r_h, cy_i - r_h, cx + r_h, cy_i + r_h], fill=(160, 70, 70, int(36 * a_icon)))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=42))
    img = Image.alpha_composite(img, halo)

    # Rounded icon badge
    isz = int(min(w, h) * 0.135)
    ic = icon_img.resize((isz, isz), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (isz, isz), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, isz - 1, isz - 1], radius=int(isz * 0.24), fill=int(255 * a_icon))
    ic.putalpha(mask)
    iy = int(cy_i - isz // 2 + (1.0 - a_icon) * 14)
    img.alpha_composite(ic, (cx - isz // 2, iy))

    d = ImageDraw.Draw(img)
    f_brand = load_font(int(min(w, h) * 0.088), 650)
    f_tag = load_font(int(min(w, h) * 0.028), 400)
    f_url = load_font(int(min(w, h) * 0.021), 400)

    draw_centered_text(d, "PhysALT", int(h * 0.51 - (1.0 - a_title) * 14), f_brand, (*WHITE, int(255 * a_title)), w)
    draw_centered_text(d, "Earth to 1 Light-Day  ·  Web · iOS · Android", int(h * 0.625), f_tag, (*SILVER, int(225 * a_sub)), w)
    draw_centered_text(d, "nothinkaffee.github.io/PhysAlts", int(h * 0.685), f_url, (*CRIMSON, int(230 * a_sub)), w)
    return img.convert("RGB")


def frame_ui_card(ui_img, w, h, t_norm, z0=1.01, z1=1.06, py0=0.0, py1=-0.01):
    """Presents live 1080p UI in a razor-sharp dark glass cinema frame with gentle optical drift."""
    bg = Image.new("RGB", (w, h), OBSIDIAN)
    # Subtle full-bleed motion + crisp hairline border
    moved = ken_burns(ui_img, w, h, t_norm, z0=z0, z1=z1, py0=py0, py1=py1)
    bg.paste(moved, (0, 0))
    return bg


def extract_live_space_frames():
    """Extract clean 30fps PNG frames from Playwright's recorded 1 Light-Day Light Pulse video."""
    os.makedirs(SPACE_FRAMES_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(SPACE_FRAMES_DIR, "*.png")):
        os.remove(old)
    vids = sorted(glob.glob(os.path.join(VRAW_DIR, "*.webm")))
    if not vids:
        return []
    src = vids[-1]
    # Trim the initial 3.6s boot so the clip opens right as Space View appears and Light Pulse fires!
    subprocess.run([
        "ffmpeg", "-y", "-ss", "3.8", "-i", src,
        "-vf", f"fps={FPS},scale=1920:1080:flags=lanczos",
        os.path.join(SPACE_FRAMES_DIR, "sf_%04d.png")
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    frames = sorted(glob.glob(os.path.join(SPACE_FRAMES_DIR, "sf_*.png")))
    print(f"Extracted {len(frames)} live 1 Light-Day Space Pulse frames!")
    return frames


def synth_masterpiece_audio(wav_path, duration=42.0, cut_times=None, pulse_window=(21.5, 31.5), drop_time=39.1, sr=44100):
    """
    44.1kHz Stereo Cinema Score + Frame-Synced Tactile Foley (pure Python stdlib):
    - Obsidian sub-bass heartbeat (D1/D2)
    - Felt-harmonic D-minor-9 pad swelling across acts
    - Crisp precision glass clicks at exact UI cut timestamps
    - Clean breath of silence before 'Then leave Earth.' and before 'PhysALT'
    - Sweeping Doppler photon shimmer rising during live Light Pulse (c) race to 1 Light-Day
    """
    n = int(duration * sr)
    p0, p1 = pulse_window
    p_span = max(0.1, p1 - p0)
    arrival_t = p1 - 0.6
    dip1_c = p0 - 1.4
    dip2_c = drop_time - 0.45

    freqs = (73.42, 110.00, 164.81, 174.61, 220.00)
    amps = (0.22, 0.16, 0.10, 0.08, 0.07)
    two_pi = 2.0 * math.pi
    inv_sr = 1.0 / sr
    sin = math.sin
    exp = math.exp
    tanh = math.tanh

    # Pre-build click foley lookup buffer
    click_l = array.array("f", [0.0]) * n
    click_r = array.array("f", [0.0]) * n
    for idx, ct in enumerate(cut_times or []):
        s0 = int(ct * sr)
        dur_s = int(0.065 * sr)
        if s0 < 0 or s0 + dur_s >= n:
            continue
        freq = 1480.0 + (idx % 3) * 260.0
        wl = 0.95 if idx % 2 == 0 else 0.85
        wr = 0.85 if idx % 2 == 0 else 0.95
        for k in range(dur_s):
            lt = k * inv_sr
            c_env = exp(-lt * 85.0) * 0.16
            sig = c_env * (sin(two_pi * freq * lt) + 0.4 * sin(two_pi * freq * 2.1 * lt))
            click_l[s0 + k] += sig * wl
            click_r[s0 + k] += sig * wr

    out = array.array("h", [0]) * (n * 2)
    f0, f1, f2, f3, f4 = freqs
    a0, a1, a2, a3, a4 = amps

    for i in range(n):
        t = i * inv_sr
        env = min(1.0, t / 1.1) * min(1.0, max(0.0, (duration - t) / 1.8))
        d1 = (t - dip1_c) / 0.55
        d2 = (t - dip2_c) / 0.28
        dip1 = 1.0 - 0.72 * exp(-(d1 * d1)) if abs(d1) < 4.0 else 1.0
        dip2 = 1.0 - 0.85 * exp(-(d2 * d2)) if abs(d2) < 4.0 else 1.0
        dyn = env * dip1 * dip2

        breath = 0.76 + 0.24 * sin(two_pi * 0.14 * t)
        pad_l = (
            a0 * sin(two_pi * f0 * 1.0011 * t)
            + a1 * sin(two_pi * f1 * 1.0011 * t + 0.8)
            + a2 * sin(two_pi * f2 * 1.0011 * t + 1.6)
            + a3 * sin(two_pi * f3 * 1.0011 * t + 2.4)
            + a4 * sin(two_pi * f4 * 1.0011 * t + 3.2)
        ) * breath
        pad_r = (
            a0 * sin(two_pi * f0 * 0.9989 * t)
            + a1 * sin(two_pi * f1 * 0.9989 * t + 1.4)
            + a2 * sin(two_pi * f2 * 0.9989 * t + 2.8)
            + a3 * sin(two_pi * f3 * 0.9989 * t + 4.2)
            + a4 * sin(two_pi * f4 * 0.9989 * t + 5.6)
        ) * breath

        sub = 0.12 * sin(two_pi * 36.71 * t) if t >= 0.4 else 0.0
        if 4.2 <= t < drop_time - 0.5:
            bp = (t % 0.75) / 0.75
            sub += exp(-bp * 7.5) * 0.20 * sin(two_pi * 55.0 * t)

        photon_l = 0.0
        photon_r = 0.0
        if p0 <= t <= p1 + 1.0:
            dtp = t - p0
            up = min(1.0, max(0.0, dtp / p_span))
            penv = (sin(math.pi * min(1.0, dtp / (p_span + 0.6))) ** 0.7) * 0.14
            sph = two_pi * (220.0 * t + 135.0 * (up ** 1.8) * dtp)
            photon_l = penv * (sin(sph) + 0.45 * sin(sph * 1.501))
            photon_r = penv * (sin(sph * 1.002 + 0.6) + 0.45 * sin(sph * 1.499))

        arr_tone = 0.0
        dt_arr = t - arrival_t
        if 0.0 <= dt_arr < 3.0:
            ae = exp(-dt_arr * 1.3) * min(1.0, dt_arr / 0.02) * 0.22
            arr_tone = ae * (sin(two_pi * 587.33 * dt_arr) + 0.5 * sin(two_pi * 880.0 * dt_arr))

        fin_tone = 0.0
        dt_fin = t - drop_time
        if 0.0 <= dt_fin < 3.4:
            fe = exp(-dt_fin * 1.15) * min(1.0, dt_fin / 0.012) * 0.18
            fin_tone = fe * (sin(two_pi * 440.0 * dt_fin) + 0.55 * sin(two_pi * 659.25 * dt_fin))
            if dt_fin < 1.8:
                fin_tone += exp(-dt_fin * 3.0) * 0.34 * sin(two_pi * 49.0 * dt_fin)

        sl = tanh(((pad_l + sub + photon_l + arr_tone + fin_tone) * dyn + click_l[i]) * 1.15) * 0.92
        sr_v = tanh(((pad_r + sub + photon_r + arr_tone + fin_tone) * dyn + click_r[i]) * 1.15) * 0.92
        out[i * 2] = int(sl * 32767)
        out[i * 2 + 1] = int(sr_v * 32767)

    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(out.tobytes())


def encode_video(frame_gen, total_frames, w, h, wav_path, out_mp4):
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(FPS),
        "-i", "-",
        "-i", wav_path,
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.2",
        "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
        "-movflags", "+faststart",
        "-shortest",
        out_mp4
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    contact_samples = []
    sample_indices = set(int(total_frames * f) for f in [0.04, 0.14, 0.26, 0.38, 0.48, 0.62, 0.78, 0.89, 0.96])
    for i in range(total_frames):
        im = frame_gen(i)
        if im.size != (w, h):
            im = im.resize((w, h), Image.Resampling.LANCZOS)
        if im.mode != "RGB":
            im = im.convert("RGB")
        proc.stdin.write(im.tobytes())
        if i in sample_indices:
            contact_samples.append((i, im.copy()))
    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg failed with exit code {rc} for {out_mp4}")
    return contact_samples


def save_contact_sheet(samples, out_png, cols=3):
    if not samples:
        return
    sw, sh = samples[0][1].size
    tw = 480
    th = int(tw * sh / sw)
    rows = math.ceil(len(samples) / cols)
    sheet = Image.new("RGB", (cols * tw, rows * th), (10, 10, 12))
    for idx, (_, im) in enumerate(samples):
        r, c = divmod(idx, cols)
        sheet.paste(im.resize((tw, th), Image.Resampling.LANCZOS), (c * tw, r * th))
    sheet.save(out_png)


def build_16x9(plates, ui, space_frames, icon_img):
    W, H = 1920, 1080
    DUR = 42.0
    TOTAL = int(DUR * FPS)
    vig = make_vignette(W, H, 0.42)

    # Pre-load space frames cache lazily
    sf_cache = {}
    def get_sf(idx):
        idx = max(0, min(len(space_frames) - 1, idx))
        if idx not in sf_cache:
            if len(sf_cache) > 12:
                sf_cache.clear()
            sf_cache[idx] = Image.open(space_frames[idx]).convert("RGB")
        return sf_cache[idx]

    def fade_black(im, alpha):
        if alpha >= 0.999:
            return im
        return ImageEnhance.Brightness(im).enhance(max(0.0, alpha))

    def render_frame(fi):
        t = fi / FPS
        # 0.0 - 4.5s: Act I — Obsidian Glass Sphere Hook + Title
        if t < 4.5:
            p = t / 4.5
            im = ken_burns(plates["hook"], W, H, p, z0=1.02, z1=1.14)
            im = Image.alpha_composite(im.convert("RGBA"), vig).convert("RGB")
            ta = ease_out(min(1.0, max(0.0, (t - 0.7) / 0.6))) * (1.0 - ease_out(max(0.0, (t - 3.9) / 0.5)))
            im = overlay_lower_label(im, "INTRODUCING PHYSALT", "All of science. One surface.", ta, W, H)
            return fade_black(im, min(1.0, t / 0.65) * min(1.0, (4.5 - t) / 0.25))

        # 4.5 - 8.0s: Act IIa — Collider Tunnel dolly push
        if t < 8.0:
            p = (t - 4.5) / 3.5
            im = ken_burns(plates["collider"], W, H, p, z0=1.0, z1=1.18)
            im = Image.alpha_composite(im.convert("RGBA"), vig).convert("RGB")
            ta = ease_out(min(1.0, (t - 4.8) / 0.45)) * (1.0 - ease_out(max(0.0, (t - 7.5) / 0.4)))
            im = overlay_lower_label(im, "5,709 VERIFIED HUBS · 158 COUNTRIES", "Every collider. Every lab. Every source.", ta, W, H)
            return fade_black(im, min(1.0, (t - 4.5) / 0.20) * min(1.0, (8.0 - t) / 0.20))

        # 8.0 - 12.2s: Act IIb — Live PhysALT 3D Earth Globe
        if t < 12.2:
            p = (t - 8.0) / 4.2
            im = frame_ui_card(ui["globe"], W, H, p, z0=1.0, z1=1.07)
            ta = ease_out(min(1.0, (t - 8.3) / 0.4)) * (1.0 - ease_out(max(0.0, (t - 11.7) / 0.4)))
            im = overlay_lower_label(im, "7 STEM DISCIPLINES · 33 SUBFIELDS", "One 3D obsidian globe.", ta, W, H)
            return fade_black(im, min(1.0, (t - 8.0) / 0.20) * min(1.0, (12.2 - t) / 0.20))

        # 12.2 - 16.0s: Act IIIa — Live Rabbit Hole Trail + Editorial Card
        if t < 16.0:
            p = (t - 12.2) / 3.8
            im = frame_ui_card(ui["rabbit"], W, H, p, z0=1.01, z1=1.06, py0=0.0, py1=-0.008)
            ta = ease_out(min(1.0, (t - 12.5) / 0.4)) * (1.0 - ease_out(max(0.0, (t - 15.5) / 0.4)))
            im = overlay_lower_label(im, "RABBIT HOLE ENGINE", "Follow curiosity across continents.", ta, W, H)
            return fade_black(im, min(1.0, (t - 12.2) / 0.20) * min(1.0, (16.0 - t) / 0.20))

        # 16.0 - 19.2s: Act IIIb — Chronological STEM Timeline (1800 BCE -> 2045)
        if t < 19.2:
            p = (t - 16.0) / 3.2
            im = frame_ui_card(ui["timeline"], W, H, p, z0=1.02, z1=1.06, py0=0.008, py1=0.0)
            ta = ease_out(min(1.0, (t - 16.3) / 0.35)) * (1.0 - ease_out(max(0.0, (t - 18.7) / 0.4)))
            im = overlay_lower_label(im, "1800 BCE — 2045", "133 milestones of discovery.", ta, W, H)
            return fade_black(im, min(1.0, (t - 16.0) / 0.20) * min(1.0, (19.2 - t) / 0.22))

        # 19.2 - 21.5s: The Breath — Kinetic Turn Card
        if t < 21.5:
            p = (t - 19.2) / 2.3
            return render_title_card(W, H, "Then leave Earth.", "Race a photon to 1 light-day.", p, accent_line=True)

        # 21.5 - 31.5s: Act IV CLIMAX — LIVE RECORDED 1 LIGHT-DAY LIGHT PULSE (c) VIDEO!
        if t < 31.5:
            p = (t - 21.5) / 10.0
            if space_frames:
                sf_i = int(p * (len(space_frames) - 1))
                im = get_sf(sf_i)
            else:
                im = frame_ui_card(ui["space_mid"], W, H, p, z0=1.0, z1=1.04)
            ta = ease_out(min(1.0, (t - 22.0) / 0.5)) * (1.0 - ease_out(max(0.0, (t - 30.8) / 0.6)))
            im = overlay_lower_label(im, "LIVE PHOTON WAVEFRONT · c = 299,792 km/s", "Earth to Voyager 1 · 173.1 AU", ta, W, H)
            return fade_black(im, min(1.0, (t - 21.5) / 0.25) * min(1.0, (31.5 - t) / 0.30))

        # 31.5 - 35.5s: Interstellar Voyager 1 Poetry Plate
        if t < 35.5:
            p = (t - 31.5) / 4.0
            im = ken_burns(plates["voyager"], W, H, p, z0=1.03, z1=1.14, px0=-0.015, px1=0.015)
            im = Image.alpha_composite(im.convert("RGBA"), vig).convert("RGB")
            ta = ease_out(min(1.0, (t - 31.9) / 0.45)) * (1.0 - ease_out(max(0.0, (t - 34.9) / 0.45)))
            im = overlay_lower_label(im, "36 SPACE MISSIONS", "Every frontier, in your pocket.", ta, W, H)
            return fade_black(im, min(1.0, (t - 31.5) / 0.25) * min(1.0, (35.5 - t) / 0.25))

        # 35.5 - 38.8s: Obsidian Hardware Desk (Desktop + Phone + Offline Packs)
        if t < 38.8:
            p = (t - 35.5) / 3.3
            im = ken_burns(plates["desk"], W, H, p, z0=1.0, z1=1.10)
            im = Image.alpha_composite(im.convert("RGBA"), vig).convert("RGB")
            ta = ease_out(min(1.0, (t - 35.8) / 0.4)) * (1.0 - ease_out(max(0.0, (t - 38.3) / 0.4)))
            im = overlay_lower_label(im, "ZERO TRACKING · OFFLINE PACKS", "Web. iOS. Android.", ta, W, H)
            return fade_black(im, min(1.0, (t - 35.5) / 0.22) * min(1.0, (38.8 - t) / 0.25))

        # 38.8 - 42.0s: Iconic Swiss Endplate — PhysALT
        p = (t - 38.8) / 3.2
        im = render_endplate(W, H, p, icon_img)
        return fade_black(im, min(1.0, (42.0 - t) / 0.45))

    wav_16x9 = "/tmp/physalt_film/score_16x9.wav"
    synth_masterpiece_audio(
        wav_16x9,
        duration=DUR,
        cut_times=[4.5, 8.0, 12.2, 16.0, 19.2, 21.5, 31.5, 35.5, 38.8],
        pulse_window=(21.5, 31.5),
        drop_time=38.85
    )
    out_mp4 = os.path.join(OUT_DIR, "PhysALT_Launch_Masterpiece_16x9.mp4")
    samples = encode_video(render_frame, TOTAL, W, H, wav_16x9, out_mp4)
    save_contact_sheet(samples, os.path.join(ARTIFACT_DIR, "masterpiece_16x9_contact_sheet.png"), cols=3)
    shutil.copy2(out_mp4, os.path.join(ARTIFACT_DIR, "PhysALT_Launch_Masterpiece_16x9.mp4"))
    print("Wrote 16:9 Masterpiece:", out_mp4)


def compose_vertical_phone(phone_ui, bg_plate, w, h, t_norm):
    """Centers the crisp 390x844@2x mobile PhysALT capture inside a sleek titanium bezel over dark obsidian."""
    bg = ken_burns(bg_plate, w, h, t_norm, z0=1.08, z1=1.16)
    bg = ImageEnhance.Brightness(bg).enhance(0.28).filter(ImageFilter.GaussianBlur(radius=18)).convert("RGBA")

    # Titanium phone mockup frame
    pw = int(w * 0.68)
    ph = int(pw * (phone_ui.size[1] / phone_ui.size[0]))
    if ph > int(h * 0.70):
        ph = int(h * 0.70)
        pw = int(ph * (phone_ui.size[0] / phone_ui.size[1]))
    px = (w - pw) // 2
    py = int(h * 0.10 + (1.0 - ease_out(min(1.0, t_norm * 2.5))) * 28)

    # Outer glow + bezel
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    rad = int(pw * 0.115)
    d.rounded_rectangle([px - 8, py - 8, px + pw + 8, py + ph + 8], radius=rad + 6, fill=(18, 18, 22, 255), outline=(255, 255, 255, 58), width=3)
    bg = Image.alpha_composite(bg, ov)

    screen = phone_ui.resize((pw, ph), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=rad, fill=255)
    screen.putalpha(mask)
    bg.alpha_composite(screen, (px, py))
    return bg.convert("RGB")


def build_9x16(plates, ui, space_frames, icon_img):
    W, H = 1080, 1920
    DUR = 28.0
    TOTAL = int(DUR * FPS)
    vig = make_vignette(W, H, 0.45)

    sf_cache = {}
    def get_sf(idx):
        idx = max(0, min(len(space_frames) - 1, idx))
        if idx not in sf_cache:
            if len(sf_cache) > 10:
                sf_cache.clear()
            sf_cache[idx] = Image.open(space_frames[idx]).convert("RGB")
        return sf_cache[idx]

    def fade_black(im, alpha):
        if alpha >= 0.999:
            return im
        return ImageEnhance.Brightness(im).enhance(max(0.0, alpha))

    def render_frame(fi):
        t = fi / FPS
        if t < 3.5:
            p = t / 3.5
            im = ken_burns(plates["hook"], W, H, p, z0=1.04, z1=1.16)
            im = Image.alpha_composite(im.convert("RGBA"), vig).convert("RGB")
            ta = ease_out(min(1.0, (t - 0.4) / 0.45)) * (1.0 - ease_out(max(0.0, (t - 3.0) / 0.4)))
            im = overlay_lower_label(im, "INTRODUCING PHYSALT", "All of science.", ta, W, H)
            return fade_black(im, min(1.0, t / 0.45) * min(1.0, (3.5 - t) / 0.20))

        if t < 6.5:
            p = (t - 3.5) / 3.0
            im = ken_burns(plates["collider"], W, H, p, z0=1.02, z1=1.16)
            im = Image.alpha_composite(im.convert("RGBA"), vig).convert("RGB")
            ta = ease_out(min(1.0, (t - 3.7) / 0.35)) * (1.0 - ease_out(max(0.0, (t - 6.0) / 0.4)))
            im = overlay_lower_label(im, "5,709 LABS · 158 COUNTRIES", "One obsidian globe.", ta, W, H)
            return fade_black(im, min(1.0, (t - 3.5) / 0.18) * min(1.0, (6.5 - t) / 0.18))

        if t < 11.0:
            p = (t - 6.5) / 4.5
            im = compose_vertical_phone(ui["mob_earth"], plates["collider"], W, H, p)
            ta = ease_out(min(1.0, (t - 6.8) / 0.4)) * (1.0 - ease_out(max(0.0, (t - 10.5) / 0.4)))
            im = overlay_lower_label(im, "RABBIT HOLE TRAILS", "Curiosity in your hand.", ta, W, H)
            return fade_black(im, min(1.0, (t - 6.5) / 0.18) * min(1.0, (11.0 - t) / 0.18))

        if t < 13.0:
            p = (t - 11.0) / 2.0
            return render_title_card(W, H, "Then leave Earth.", "0 s → 1 Light-Day.", p, accent_line=True)

        if t < 18.5:
            p = (t - 13.0) / 5.5
            # Pan horizontally across the live 1920x1080 Light Pulse footage from Earth (left) -> Voyager 1 (right)!
            src_im = get_sf(int(p * (len(space_frames) - 1))) if space_frames else ui["space_mid"]
            im = ken_burns(src_im, W, H, p, z0=1.02, z1=1.04, px0=-0.28, px1=0.28)
            ta = ease_out(min(1.0, (t - 13.3) / 0.4)) * (1.0 - ease_out(max(0.0, (t - 18.0) / 0.4)))
            im = overlay_lower_label(im, "FIRE LIGHT PULSE (c)", "Earth to Voyager 1", ta, W, H)
            return fade_black(im, min(1.0, (t - 13.0) / 0.2) * min(1.0, (18.5 - t) / 0.2))

        if t < 22.5:
            p = (t - 18.5) / 4.0
            im = compose_vertical_phone(ui["mob_space"], plates["voyager"], W, H, p)
            ta = ease_out(min(1.0, (t - 18.8) / 0.4)) * (1.0 - ease_out(max(0.0, (t - 22.0) / 0.4)))
            im = overlay_lower_label(im, "36 SPACE MISSIONS", "Built for iOS & Android.", ta, W, H)
            return fade_black(im, min(1.0, (t - 18.5) / 0.18) * min(1.0, (22.5 - t) / 0.18))

        if t < 25.0:
            p = (t - 22.5) / 2.5
            im = ken_burns(plates["voyager"], W, H, p, z0=1.05, z1=1.18)
            im = Image.alpha_composite(im.convert("RGBA"), vig).convert("RGB")
            ta = ease_out(min(1.0, (t - 22.7) / 0.35)) * (1.0 - ease_out(max(0.0, (t - 24.6) / 0.35)))
            im = overlay_lower_label(im, "ZERO TRACKING · OFFLINE", "173.1 AU away.", ta, W, H)
            return fade_black(im, min(1.0, (t - 22.5) / 0.18) * min(1.0, (25.0 - t) / 0.2))

        p = (t - 25.0) / 3.0
        im = render_endplate(W, H, p, icon_img)
        return fade_black(im, min(1.0, (28.0 - t) / 0.4))

    wav_9x16 = "/tmp/physalt_film/score_9x16.wav"
    synth_masterpiece_audio(
        wav_9x16,
        duration=DUR,
        cut_times=[3.5, 6.5, 11.0, 13.0, 18.5, 22.5, 25.0],
        pulse_window=(13.0, 18.5),
        drop_time=25.05
    )
    out_mp4 = os.path.join(OUT_DIR, "PhysALT_Launch_Reel_9x16.mp4")
    samples = encode_video(render_frame, TOTAL, W, H, wav_9x16, out_mp4)
    save_contact_sheet(samples, os.path.join(ARTIFACT_DIR, "masterpiece_9x16_contact_sheet.png"), cols=3)
    shutil.copy2(out_mp4, os.path.join(ARTIFACT_DIR, "PhysALT_Launch_Reel_9x16.mp4"))
    print("Wrote 9:16 Vertical Reel:", out_mp4)


def main():
    plates = {
        "hook": Image.open(find_plate("flow_plate_01_hook")).convert("RGB"),
        "collider": Image.open(find_plate("flow_plate_02_collider")).convert("RGB"),
        "voyager": Image.open(find_plate("flow_plate_03_voyager")).convert("RGB"),
        "desk": Image.open(find_plate("flow_plate_04_hero_desk")).convert("RGB"),
    }
    ui = {
        "globe": Image.open(os.path.join(CAP_DIR, "ui_01_globe.png")).convert("RGB"),
        "rabbit": Image.open(os.path.join(CAP_DIR, "ui_02_rabbit_trail.png")).convert("RGB"),
        "timeline": Image.open(os.path.join(CAP_DIR, "ui_03_timeline.png")).convert("RGB"),
        "space_mid": Image.open(os.path.join(CAP_DIR, "ui_05_space_pulse_mid.png")).convert("RGB"),
        "mob_space": Image.open(os.path.join(CAP_DIR, "ui_06_mobile_space.png")).convert("RGB"),
        "mob_earth": Image.open(os.path.join(CAP_DIR, "ui_07_mobile_earth.png")).convert("RGB"),
    }
    icon_img = Image.open(ICON_PATH).convert("RGBA")
    space_frames = extract_live_space_frames()

    build_16x9(plates, ui, space_frames, icon_img)
    build_9x16(plates, ui, space_frames, icon_img)
    print("MASTERPIECE SUITE RENDERED SUCCESSFULLY!")


if __name__ == "__main__":
    main()
