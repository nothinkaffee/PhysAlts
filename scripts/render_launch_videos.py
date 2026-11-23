#!/usr/bin/env python3
"""
World of Science — Launch Video Orchestrator (A/B Testing Suite)
Renders two distinct, cinema-grade 1080p 30fps launch videos (both 16:9 widescreen AND 9:16 vertical cuts)
combining:
  - Real Blender 4.0 Cycles 3D raytraced Blue Marble Earth + glowing orbital collaboration arcs + Light-Pulse rings
  - Real live Playwright UI captures (Whole Earth, IceCube Wikipedia Card, Deep Rabbit-Hole Agent, Offline Packs, 1 Light-Day Light Pulse, Mobile)
  - Crisp Inter Variable kinetic typography + frosted neutral-grey glass framing + crimson accents
  - Synthesized stereo ambient cinematic soundtrack (warm harmonic pad + crystalline transition chimes + sub-bass pulse)
  - Contact sheets for automated visual QA verification
"""
import math
import os
import struct
import subprocess
import sys
import wave
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_PATH = os.path.join(REPO_ROOT, "public/vendor/inter-var.woff2")
OUT_VID_DIR = os.path.join(REPO_ROOT, "dist/videos")
QA_DIR = "/tmp/launch_qa"
BLENDER_A_DIR = "/tmp/blender_frames_a"
BLENDER_B_DIR = "/tmp/blender_frames_b"

os.makedirs(OUT_VID_DIR, exist_ok=True)


def load_font(size, bold=False):
    # PIL handles TrueType / OpenType / WOFF2 via FreeType; fall back cleanly to DejaVuSans if needed
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        FONT_PATH,
    ]
    # Prefer Inter if FreeType supports WOFF2 directly
    for path in [FONT_PATH] + candidates:
        if os.path.exists(path):
            try:
                f = ImageFont.truetype(path, size)
                if bold and path == FONT_PATH:
                    try:
                        f.set_variation_by_axes([650])
                    except Exception:
                        pass
                return f
            except Exception:
                continue
    return ImageFont.load_default()


def ease_out_cubic(t):
    t = max(0.0, min(1.0, t))
    return 1.0 - (1.0 - t) ** 3


def ease_in_out(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def synth_soundtrack(wav_path, duration_sec=20.0, variant="A", sr=44100):
    """Synthesizes a lush, minimalist Apple/A24-inspired ambient electronic soundtrack in stereo 16-bit WAV."""
    n_samples = int(duration_sec * sr)
    # Variant A: warm D-minor curiosity pad (D2, A2, F3, A3, E4)
    # Variant B: expansive C-sus2 cosmic scale pad (C2, G2, D3, G3, B3)
    chord = [73.42, 110.0, 174.61, 220.0, 329.63] if variant == "A" else [65.41, 98.0, 146.83, 196.0, 246.94]
    chime_times = [0.4, 4.0, 8.5, 13.5, 17.0] if variant == "A" else [0.4, 4.5, 9.0, 14.0, 17.0]
    chime_freqs = [587.33, 659.25, 880.0, 783.99, 587.33] if variant == "A" else [523.25, 587.33, 783.99, 987.77, 523.25]

    frames = bytearray()
    for i in range(n_samples):
        t = i / sr
        # Global fade in (0.9s) and fade out (1.6s)
        env = min(1.0, t / 0.9) * min(1.0, max(0.0, (duration_sec - t) / 1.6))

        # Slow breathing filter modulation
        breath = 0.72 + 0.28 * math.sin(2.0 * math.pi * 0.18 * t)

        # Warm stereo pad with gentle detuning
        pad_l = 0.0
        pad_r = 0.0
        for idx, freq in enumerate(chord):
            amp = 0.16 / (1.0 + idx * 0.45)
            pad_l += amp * math.sin(2.0 * math.pi * (freq * 1.0012) * t + idx)
            pad_r += amp * math.sin(2.0 * math.pi * (freq * 0.9988) * t + idx * 1.3)

        # Subtle rhythmic sub-pulse (modern scientific heartbeat)
        pulse_rate = 1.0 if variant == "A" else 0.75
        pulse_phase = (t * pulse_rate) % 1.0
        pulse_env = math.exp(-pulse_phase * 5.5) * (0.20 if (variant == "B" and 9.0 <= t <= 14.2) else 0.11)
        sub = pulse_env * math.sin(2.0 * math.pi * chord[0] * t)

        # Crystalline bell chimes at each scene transition
        chime_l = 0.0
        chime_r = 0.0
        for ct, cf in zip(chime_times, chime_freqs):
            dt = t - ct
            if 0.0 <= dt < 2.2:
                c_env = math.exp(-dt * 2.4) * min(1.0, dt / 0.015) * 0.16
                chime_l += c_env * math.sin(2.0 * math.pi * cf * dt)
                chime_r += c_env * math.sin(2.0 * math.pi * (cf * 1.002) * dt)

        sl = max(-0.95, min(0.95, (pad_l * breath + sub + chime_l) * env))
        sr_v = max(-0.95, min(0.95, (pad_r * breath + sub + chime_r) * env))
        frames.extend(struct.pack("<hh", int(sl * 32767), int(sr_v * 32767)))

    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(bytes(frames))


def load_blender_frames(directory):
    files = sorted(f for f in os.listdir(directory) if f.endswith(".png"))
    return [Image.open(os.path.join(directory, f)).convert("RGBA") for f in files]


def sample_blender_frame(frames, t_norm, target_size):
    idx_f = max(0.0, min(1.0, t_norm)) * (len(frames) - 1)
    i0 = int(math.floor(idx_f))
    i1 = min(len(frames) - 1, i0 + 1)
    frac = idx_f - i0
    f0 = frames[i0]
    if frac > 0.02 and i1 != i0:
        blended = Image.blend(f0, frames[i1], frac)
    else:
        blended = f0
    # Cover-crop to target aspect ratio cleanly
    tw, th = target_size
    bw, bh = blended.size
    scale = max(tw / bw, th / bh)
    nw, nh = int(round(bw * scale)), int(round(bh * scale))
    resized = blended.resize((nw, nh), Image.Resampling.LANCZOS)
    ox = (nw - tw) // 2
    oy = (nh - th) // 2
    return resized.crop((ox, oy, ox + tw, oy + th))


def make_rounded_card(img, box_w, box_h, radius=28, zoom=1.0, shift_x=0.0, shift_y=0.0):
    """Fits a UI screenshot inside a rounded frosted-border display frame with subtle Ken Burns zoom."""
    iw, ih = img.size
    scale = max(box_w / iw, box_h / ih) * zoom
    nw, nh = int(round(iw * scale)), int(round(ih * scale))
    scaled = img.resize((nw, nh), Image.Resampling.LANCZOS)
    cx = int((nw - box_w) * (0.5 + shift_x))
    cy = int((nh - box_h) * (0.5 + shift_y))
    cx = max(0, min(nw - box_w, cx))
    cy = max(0, min(nh - box_h, cy))
    cropped = scaled.crop((cx, cy, cx + box_w, cy + box_h)).convert("RGBA")

    # Rounded mask
    mask = Image.new("L", (box_w, box_h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, box_w - 1, box_h - 1), radius=radius, fill=255)
    card = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    card.paste(cropped, (0, 0), mask)

    # Subtle 1.5px glass rim highlight
    bd = ImageDraw.Draw(card)
    bd.rounded_rectangle((1, 1, box_w - 2, box_h - 2), radius=radius, outline=(255, 255, 255, 58), width=2)
    return card


def draw_centered_text(draw, y, text, font, fill, canvas_w, alpha=1.0):
    if alpha <= 0.01:
        return
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (canvas_w - tw) // 2
    r, g, b = fill
    a = int(max(0, min(255, alpha * 255)))
    # Soft readability shadow
    draw.text((x, y + 3), text, font=font, fill=(0, 0, 0, int(a * 0.65)))
    draw.text((x, y), text, font=font, fill=(r, g, b, a))


def draw_pill_badge(draw, center_x, y, text, font, alpha=1.0):
    if alpha <= 0.01:
        return
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pad_x, pad_y = 22, 10
    x0 = center_x - tw // 2 - pad_x
    x1 = center_x + tw // 2 + pad_x
    y0 = y
    y1 = y + th + pad_y * 2
    a = max(0.0, min(1.0, alpha))
    draw.rounded_rectangle((x0, y0, x1, y1), radius=999,
                           fill=(160, 70, 70, int(55 * a)),
                           outline=(185, 88, 88, int(175 * a)), width=2)
    draw.text((center_x - tw // 2, y0 + pad_y - 2), text, font=font, fill=(242, 206, 206, int(255 * a)))


def composite_ui_showcase(base_img, ui_img, local_t, badge, headline, subline, vertical=False):
    W, H = base_img.size
    # Darken Blender backdrop softly so the crisp UI showcase floats cleanly
    dim = Image.new("RGBA", (W, H), (5, 5, 7, 155))
    frame = Image.alpha_composite(base_img, dim)

    enter = ease_out_cubic(min(1.0, local_t / 0.22))
    exit_a = 1.0 - ease_in_out(max(0.0, (local_t - 0.84) / 0.16))
    alpha = enter * exit_a

    # Position UI card with gentle floating entrance
    if not vertical:
        card_w = int(W * 0.74)
        card_h = int(H * 0.64)
        card_x = (W - card_w) // 2
        card_y = int(H * 0.26 + (1.0 - enter) * 34)
    else:
        card_w = int(W * 0.88)
        card_h = int(H * 0.48)
        card_x = (W - card_w) // 2
        card_y = int(H * 0.34 + (1.0 - enter) * 44)

    zoom = 1.02 + 0.055 * local_t
    card = make_rounded_card(ui_img, card_w, card_h, radius=26, zoom=zoom)
    if alpha < 0.99:
        r, g, b, ca = card.split()
        ca = ca.point(lambda v: int(v * alpha))
        card = Image.merge("RGBA", (r, g, b, ca))

    # Drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((card_x + 4, card_y + 18, card_x + card_w - 4, card_y + card_h + 18),
                         radius=28, fill=(0, 0, 0, int(170 * alpha)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    frame = Image.alpha_composite(frame, shadow)
    frame.alpha_composite(card, (card_x, card_y))

    # Top editorial typography overlay
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    f_badge = load_font(22 if not vertical else 26, bold=True)
    f_head = load_font(48 if not vertical else 52, bold=True)
    f_sub = load_font(24 if not vertical else 28, bold=False)

    top_y = int(H * (0.045 if not vertical else 0.11))
    draw_pill_badge(od, W // 2, top_y, badge, f_badge, alpha)
    draw_centered_text(od, top_y + (56 if not vertical else 68), headline, f_head, (246, 246, 248), W, alpha)
    draw_centered_text(od, top_y + (116 if not vertical else 136), subline, f_sub, (176, 176, 184), W, alpha)
    return Image.alpha_composite(frame, overlay)


def render_variant(variant, blender_frames, ui_imgs, vertical=False):
    FPS = 30
    DURATION = 20.0
    TOTAL_FRAMES = int(FPS * DURATION)
    W, H = (1080, 1920) if vertical else (1920, 1080)
    suffix = "vertical" if vertical else ("curiosity_rabbithole" if variant == "A" else "scale_of_science")
    out_mp4 = os.path.join(OUT_VID_DIR, f"launch_video_{variant}_{suffix}.mp4")
    wav_path = f"/tmp/audio_{variant}.wav"
    if not os.path.exists(wav_path):
        synth_soundtrack(wav_path, DURATION, variant=variant)

    # Stream raw RGB24 frames straight into FFmpeg (fast, zero disk bloat!)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(FPS), "-i", "-",
        "-i", wav_path,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
        out_mp4
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    f_badge = load_font(24 if not vertical else 28, bold=True)
    f_hero = load_font(78 if not vertical else 72, bold=True)
    f_sub = load_font(30 if not vertical else 32, bold=False)
    f_cta = load_font(26 if not vertical else 30, bold=True)

    for fi in range(TOTAL_FRAMES):
        t = fi / FPS
        t_norm = fi / max(1, TOTAL_FRAMES - 1)
        bg = sample_blender_frame(blender_frames, t_norm, (W, H))

        if variant == "A":
            if t < 4.0:
                lt = t / 4.0
                a = ease_out_cubic(min(1.0, lt / 0.25)) * (1.0 - ease_in_out(max(0.0, (lt - 0.80) / 0.20)))
                ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                od = ImageDraw.Draw(ov)
                # Subtle vignette
                od.rectangle((0, int(H * 0.62), W, H), fill=(5, 5, 7, 125))
                draw_pill_badge(od, W // 2, int(H * 0.65), "WORLD OF SCIENCE · ALL STEM & AI", f_badge, a)
                draw_centered_text(od, int(H * 0.72), "One click. Five thousand frontiers.", f_hero, (248, 248, 250), W, a)
                draw_centered_text(od, int(H * 0.83), "Physics, AI, Math, Biology, Chemistry, Climate & Engineering on one 3D globe.", f_sub, (186, 186, 194), W, a)
                frame = Image.alpha_composite(bg, ov)
            elif t < 8.5:
                lt = (t - 4.0) / 4.5
                frame = composite_ui_showcase(
                    bg, ui_imgs["icecube"], lt,
                    "OFFICIAL OVERVIEW · WIKIPEDIA & IMPACT",
                    "Every lab, every career level.",
                    "Hero imagery, live Wikipedia briefs, ARWU-inspired Impact scores & tailored pathways.",
                    vertical=vertical
                )
            elif t < 13.5:
                lt = (t - 8.5) / 5.0
                frame = composite_ui_showcase(
                    bg, ui_imgs["agent"], lt,
                    "AGENT DEEP RABBIT-HOLE RESEARCH",
                    "Official nodes. Zero filler reports.",
                    "Curates verified labs, origin milestones, landmark OpenAlex papers & fun facts.",
                    vertical=vertical
                )
            elif t < 17.0:
                lt = (t - 13.5) / 3.5
                frame = composite_ui_showcase(
                    bg, ui_imgs["offline"], lt,
                    "ORGANIC-MAPS STYLE OFFLINE PACKS",
                    "Download sciences. Explore offline.",
                    "13 modular STEM & continent packages stored locally with SHA-256 verification.",
                    vertical=vertical
                )
            else:
                lt = (t - 17.0) / 3.0
                a = ease_out_cubic(min(1.0, lt / 0.28))
                ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                od = ImageDraw.Draw(ov)
                od.rectangle((0, int(H * 0.56), W, H), fill=(5, 5, 7, 145))
                draw_pill_badge(od, W // 2, int(H * 0.60), "LAUNCHING NOW · WEB · iOS · ANDROID", f_badge, a)
                draw_centered_text(od, int(H * 0.67), "World of Science", f_hero, (250, 250, 252), W, a)
                draw_centered_text(od, int(H * 0.78), "Follow your curiosity down the rabbit hole.", f_sub, (192, 192, 200), W, a)
                draw_centered_text(od, int(H * 0.86), "nothinkaffee.github.io/PhysAlts", f_cta, (196, 102, 102), W, a)
                frame = Image.alpha_composite(bg, ov)
        else:
            # Variant B: From 1800 BCE to 1 Light-Day
            if t < 4.5:
                lt = t / 4.5
                a = ease_out_cubic(min(1.0, lt / 0.25)) * (1.0 - ease_in_out(max(0.0, (lt - 0.80) / 0.20)))
                ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                od = ImageDraw.Draw(ov)
                od.rectangle((0, int(H * 0.62), W, H), fill=(5, 5, 7, 125))
                draw_pill_badge(od, W // 2, int(H * 0.65), "1800 BCE → 1 LIGHT-DAY", f_badge, a)
                draw_centered_text(od, int(H * 0.72), "The Entire Scale of Science.", f_hero, (248, 248, 250), W, a)
                draw_centered_text(od, int(H * 0.83), "5,200+ verified STEM hubs, 109 discoveries & 36 deep-space missions.", f_sub, (186, 186, 194), W, a)
                frame = Image.alpha_composite(bg, ov)
            elif t < 9.0:
                lt = (t - 4.5) / 4.5
                img = ui_imgs["rest"] if lt < 0.45 else ui_imgs["filters"]
                frame = composite_ui_showcase(
                    bg, img, lt,
                    "SHANGHAIRANKING-INSPIRED IMPACT INDEX",
                    "Precision STEM filtering & ranking.",
                    "Filter across Physics, AI, Math, Bio, Chemistry, Climate & Engineering in real time.",
                    vertical=vertical
                )
            elif t < 14.0:
                lt = (t - 9.0) / 5.0
                frame = composite_ui_showcase(
                    bg, ui_imgs["space"], lt,
                    "INTERACTIVE 1 LIGHT-DAY FRONTIER",
                    "Fire a light pulse to Voyager 1.",
                    "Watch light travel past the Moon, Sun, Mars, Jupiter & Saturn to 173.1 AU.",
                    vertical=vertical
                )
            elif t < 17.0:
                lt = (t - 14.0) / 3.0
                frame = composite_ui_showcase(
                    bg, ui_imgs["mobile_card"] if vertical else ui_imgs["trail"], lt,
                    "DESKTOP, iOS & ANDROID",
                    "Built to explore anywhere.",
                    "Symmetrical Dynamic Island, guided rabbit-hole trails & full offline mode.",
                    vertical=vertical
                )
            else:
                lt = (t - 17.0) / 3.0
                a = ease_out_cubic(min(1.0, lt / 0.28))
                ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                od = ImageDraw.Draw(ov)
                od.rectangle((0, int(H * 0.56), W, H), fill=(5, 5, 7, 145))
                draw_pill_badge(od, W // 2, int(H * 0.60), "FREE & OPEN SCIENCE · WEB · iOS · ANDROID", f_badge, a)
                draw_centered_text(od, int(H * 0.67), "World of Science", f_hero, (250, 250, 252), W, a)
                draw_centered_text(od, int(H * 0.78), "From ancient Miletus to interstellar space.", f_sub, (192, 192, 200), W, a)
                draw_centered_text(od, int(H * 0.86), "nothinkaffee.github.io/PhysAlts", f_cta, (196, 102, 102), W, a)
                frame = Image.alpha_composite(bg, ov)

        proc.stdin.write(frame.convert("RGB").tobytes())

    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"FFmpeg failed with code {rc} for {out_mp4}")
    size_mb = os.path.getsize(out_mp4) / (1024 * 1024)
    print(f"RENDERED {out_mp4} ({size_mb:.2f} MB)", flush=True)
    return out_mp4


def build_contact_sheet(mp4_path, out_png):
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", mp4_path,
        "-vf", "fps=0.35,scale=640:-1,tile=3x3",
        "-frames:v", "1", out_png
    ], check=True)
    print(f"CONTACT_SHEET {out_png}", flush=True)


def main():
    # Step 1: Render both Blender 4.0 Cycles sequences if not already rendered
    if not os.path.exists(os.path.join(BLENDER_A_DIR, "frame_0011.png")):
        print("Rendering Blender 4.0 Cycles sequence A (3D Earth + Collaboration Arcs)...", flush=True)
        subprocess.run([
            "blender", "--background", "--python",
            os.path.join(REPO_ROOT, "scripts/blender_earth_scene.py"),
            "--", "arcs", BLENDER_A_DIR, "12"
        ], check=True)

    if not os.path.exists(os.path.join(BLENDER_B_DIR, "frame_0011.png")):
        print("Rendering Blender 4.0 Cycles sequence B (3D Earth + Light-Pulse Rings)...", flush=True)
        subprocess.run([
            "blender", "--background", "--python",
            os.path.join(REPO_ROOT, "scripts/blender_earth_scene.py"),
            "--", "pulse", BLENDER_B_DIR, "12"
        ], check=True)

    frames_a = load_blender_frames(BLENDER_A_DIR)
    frames_b = load_blender_frames(BLENDER_B_DIR)

    ui_imgs = {
        "rest": Image.open(os.path.join(QA_DIR, "01_desktop_rest_1440x900.png")).convert("RGBA"),
        "icecube": Image.open(os.path.join(QA_DIR, "02_icecube_card_phd.png")).convert("RGBA"),
        "filters": Image.open(os.path.join(QA_DIR, "03_precision_filters_ai_cs.png")).convert("RGBA"),
        "agent": Image.open(os.path.join(QA_DIR, "04_agent_rabbithole_alphafold.png")).convert("RGBA"),
        "trail": Image.open(os.path.join(QA_DIR, "04b_active_trail_bar.png")).convert("RGBA"),
        "offline": Image.open(os.path.join(QA_DIR, "05_offline_packs_manager.png")).convert("RGBA"),
        "space": Image.open(os.path.join(QA_DIR, "06_space_1lightday_pulse.png")).convert("RGBA"),
        "mobile_card": Image.open(os.path.join(QA_DIR, "08_mobile_card_deepmind.png")).convert("RGBA"),
    }

    # Step 2: Render all 4 launch cuts (A 16:9, A 9:16, B 16:9, B 9:16)
    mp4_a = render_variant("A", frames_a, ui_imgs, vertical=False)
    render_variant("A", frames_a, ui_imgs, vertical=True)
    mp4_b = render_variant("B", frames_b, ui_imgs, vertical=False)
    render_variant("B", frames_b, ui_imgs, vertical=True)

    # Step 3: Build visual QA contact sheets
    build_contact_sheet(mp4_a, os.path.join(OUT_VID_DIR, "contact_sheet_A.png"))
    build_contact_sheet(mp4_b, os.path.join(OUT_VID_DIR, "contact_sheet_B.png"))
    print("ALL_LAUNCH_VIDEOS_COMPLETE", flush=True)


if __name__ == "__main__":
    main()
