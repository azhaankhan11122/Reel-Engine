#!/usr/bin/env python3
"""
FREE YouTube Shorts Generator Pipeline
----------------------------------------
No API keys. No paid tokens. No trial limits. No cloud dependencies (except
optional free image generation which you can replace with local images).

Requires (all free):
  - Python 3.9+
  - ffmpeg installed on your system
  - Ollama installed for local script generation

Install dependencies:
  pip install -r requirements.txt

Usage:
  python make_shorts.py "how to build confidence"
  python make_shorts.py --script myscript.txt --images ./my_photos/
"""

import argparse
import asyncio
import gc
import math
import random
import re
import subprocess
import sys
import urllib.parse
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

from moviepy import (
    AudioFileClip,
    CompositeAudioClip,
    CompositeVideoClip,
    ImageClip,
    VideoFileClip,
    concatenate_audioclips,
    concatenate_videoclips,
)

import edge_tts
from faster_whisper import WhisperModel

# ============================ CONFIG ============================
W, H = 1080, 1920          # 9:16 Shorts resolution
FPS = 30
FONT_SIZE = 88
CAPTION_BOX_HEIGHT = 380
OUTLINE_WIDTH = 5
SHADOW_OFFSET = (4, 5)
SHADOW_ALPHA = 160
CAPTION_Y_CENTER = 0.62    # Sweet spot: 62% down the frame (avoids platform UI)
PILL_OPACITY = 140         # ~55% black pill
PILL_RADIUS = 32
PILL_PAD_X, PILL_PAD_Y = 42, 30
KEN_BURNS_ZOOM_END = 1.15  # Scale 1.0 → 1.15 over each image clip
IMAGE_CUT_MIN = 3.0        # Fast-cut rhythm (seconds)
IMAGE_CUT_MAX = 5.0
SHAKE_DURATION = 0.18
SHAKE_INTENSITY = 10
SPLIT_SCREEN_EVERY = 3     # Every Nth cut uses split-screen layout
TTS_VOICE = "en-US-GuyNeural"
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.2"
WHISPER_MODEL = "base"
IMAGE_COUNT = 6
GAMEPLAY_COUNT = 4           # Number of gameplay clips to download/cache
GAMEPLAY_ZOOM_END = 1.08     # Subtle zoom on gameplay segments
USE_GAMEPLAY_DEFAULT = True  # Use gameplay footage instead of static images
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}

# Curated free Pexels gaming / screen-recording clips (no API key needed)
PEXELS_GAMEPLAY_IDS = [
    4769638, 5473967, 5473970, 5473996, 3209828, 5473980,
    7783281, 3254066, 3209663, 3209664, 3209665, 5473971,
]

PEXELS_VIDEO_META = {
    4769638: {"title": "FPS Shooter Gameplay", "tags": ["gaming", "shooter", "action", "fps", "competitive"]},
    5473967: {"title": "Console Gaming Session", "tags": ["gaming", "console", "controller", "living", "room"]},
    5473970: {"title": "Strategy Game Close-Up", "tags": ["gaming", "strategy", "thinking", "puzzle", "brain"]},
    5473996: {"title": "Mobile Game Vertical", "tags": ["gaming", "mobile", "phone", "casual", "vertical"]},
    3209828: {"title": "Racing Game Footage", "tags": ["gaming", "racing", "speed", "cars", "adrenaline"]},
    5473980: {"title": "Open World Exploration", "tags": ["gaming", "adventure", "explore", "world", "cinematic"]},
    7783281: {"title": "Retro Arcade Gaming", "tags": ["gaming", "retro", "arcade", "nostalgia", "classic"]},
    3254066: {"title": "Esports Tournament Action", "tags": ["gaming", "esports", "competitive", "tournament", "pro"]},
    3209663: {"title": "Puzzle Game Screen", "tags": ["gaming", "puzzle", "casual", "relaxing", "brain"]},
    3209664: {"title": "Action Adventure Combat", "tags": ["gaming", "action", "adventure", "combat", "hero"]},
    3209665: {"title": "Simulation Gameplay", "tags": ["gaming", "simulation", "build", "creative", "sandbox"]},
    5473971: {"title": "Sports Game Highlights", "tags": ["gaming", "sports", "football", "soccer", "team"]},
}

TTS_VOICE_CHOICES = [
    ("en-US-GuyNeural", "Guy — US Male (Default)"),
    ("en-US-JennyNeural", "Jenny — US Female"),
    ("en-US-AriaNeural", "Aria — US Female (Expressive)"),
    ("en-US-ChristopherNeural", "Christopher — US Male (Deep)"),
    ("en-US-EricNeural", "Eric — US Male (Energetic)"),
    ("en-GB-RyanNeural", "Ryan — British Male"),
    ("en-GB-SoniaNeural", "Sonia — British Female"),
    ("en-AU-WilliamNeural", "William — Australian Male"),
    ("en-IN-PrabhatNeural", "Prabhat — Indian Male"),
]
# ================================================================


class Colors:
    WHITE = (255, 255, 255, 255)
    BLACK = (0, 0, 0, 255)
    YELLOW = (255, 204, 0, 255)       # #FFCC00
    NEON_GREEN = (0, 255, 102, 255)   # #00FF66
    PILL_BG = (0, 0, 0, PILL_OPACITY)
    SHADOW = (0, 0, 0, SHADOW_ALPHA)


# High-energy words get contextual color highlights (viral caption engine)
HIGHLIGHT_YELLOW = frozenset({
    "secret", "never", "shocking", "crazy", "insane", "literally", "actually",
    "wait", "stop", "wrong", "truth", "hack", "free", "million", "best", "worst",
    "only", "everyone", "nobody", "fake", "real", "hidden", "exposed", "insane",
    "wild", "mind", "blown", "did", "know", "believe", "impossible", "insane",
})
HIGHLIGHT_GREEN = frozenset({
    "follow", "subscribe", "comment", "like", "share", "now", "today", "must",
    "click", "watch", "save", "try", "start", "go", "do", "learn", "more",
})

FONT_FAMILIES = {
    "impact": [
        "fonts/Impact.ttf",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/Library/Fonts/Impact.ttf",
        "C:/Windows/Fonts/impact.ttf",
    ],
    "arial_black": [
        "/System/Library/Fonts/Supplemental/Arial Black.ttf",
        "C:/Windows/Fonts/ariblk.ttf",
    ],
    "montserrat": [
        "fonts/Montserrat-Black.ttf",
    ],
    "bold": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ],
    # Robotic / sci-fi / tech fonts (bundled in fonts/)
    "orbitron": ["fonts/Orbitron-Bold.ttf"],
    "audiowide": ["fonts/Audiowide-Regular.ttf"],
    "share_tech": ["fonts/ShareTechMono-Regular.ttf"],
    "rajdhani": ["fonts/Rajdhani-Bold.ttf"],
    "exo2": ["fonts/Exo2-Bold.ttf"],
    "roboto_mono": ["fonts/RobotoMono-Bold.ttf"],
    "press_start": ["fonts/PressStart2P-Regular.ttf"],
}

FONT_CHOICES = [
    ("impact", "Impact — Viral Bold"),
    ("arial_black", "Arial Black — Heavy"),
    ("montserrat", "Montserrat Black"),
    ("bold", "Bold Sans"),
    ("orbitron", "Orbitron — Robotic Sci-Fi"),
    ("audiowide", "Audiowide — Retro Robot"),
    ("share_tech", "Share Tech Mono — Tech Mono"),
    ("rajdhani", "Rajdhani — Futuristic"),
    ("exo2", "Exo 2 — Modern Tech"),
    ("roboto_mono", "Roboto Mono — Code Style"),
    ("press_start", "Press Start 2P — 8-Bit Robot"),
]


@dataclass
class CaptionStyle:
    font_family: str = "impact"
    font_size: int = FONT_SIZE
    text_color: str = "#FFFFFF"
    highlight_color: str = "#FFCC00"
    accent_color: str = "#00FF66"
    pill_color: str = "#000000"
    pill_opacity: int = PILL_OPACITY
    dynamic_highlights: bool = True
    caption_position: str = "bottom"


def hex_to_rgba(hex_color, alpha=255):
    """Convert #RRGGBB to (R, G, B, A) tuple."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)


def check_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except Exception:
        print("❌ ERROR: ffmpeg is not installed or not in your PATH.")
        print("   Install it from https://ffmpeg.org/download.html")
        sys.exit(1)


def _normalize_word(word):
    return re.sub(r"[^\w']", "", word.lower())


def get_word_color(word, word_index, total_words, rng, style=None):
    """Contextual + stochastic highlight engine for viral captions."""
    style = style or CaptionStyle()
    base = hex_to_rgba(style.text_color)
    highlight = hex_to_rgba(style.highlight_color)
    accent = hex_to_rgba(style.accent_color)

    if not style.dynamic_highlights:
        return base

    clean = _normalize_word(word)
    if clean in HIGHLIGHT_GREEN:
        return accent
    if clean in HIGHLIGHT_YELLOW or word_index == 0:
        return highlight
    if total_words <= 2 and rng.random() < 0.35:
        return highlight if rng.random() < 0.7 else accent
    if clean.isdigit() or (len(clean) >= 5 and clean.endswith(("ing", "ed", "ly"))):
        if rng.random() < 0.25:
            return highlight
    return base


@lru_cache(maxsize=32)
def get_viral_font(size, family="impact"):
    """Load heavy bold font by family name."""
    project_fonts = Path(__file__).parent
    candidates = FONT_FAMILIES.get(family, FONT_FAMILIES["impact"])
    for path in candidates:
        p = Path(path)
        if not p.is_absolute():
            p = project_fonts / p
        try:
            return ImageFont.truetype(str(p), size)
        except (OSError, IOError):
            continue
    for paths in FONT_FAMILIES.values():
        for path in paths:
            p = Path(path)
            if not p.is_absolute():
                p = project_fonts / p
            try:
                return ImageFont.truetype(str(p), size)
            except (OSError, IOError):
                continue
    return ImageFont.load_default()


def _word_width(draw, word, font):
    bbox = draw.textbbox((0, 0), word, font=font)
    return bbox[2] - bbox[0]


def _fit_font_for_word(draw, word, max_w, base_size, family="impact"):
    """Shrink font for a single long word so it never clips off-frame."""
    size = base_size
    while size >= 48:
        font = get_viral_font(size, family)
        if _word_width(draw, word, font) <= max_w:
            return font
        size -= 4
    return get_viral_font(48, family)


def draw_word_with_effects(draw, xy, word, font, fill):
    """Thick stroke + drop shadow for maximum readability on any background."""
    x, y = xy
    sx, sy = SHADOW_OFFSET
    draw.text((x + sx, y + sy), word, font=font, fill=Colors.SHADOW)
    sw = OUTLINE_WIDTH
    for dx in range(-sw, sw + 1):
        for dy in range(-sw, sw + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((x + dx, y + dy), word, font=font, fill=Colors.BLACK)
    draw.text((x, y), word, font=font, fill=fill)


def _layout_colored_line(draw, words, font, max_w, rng, style=None):
    """Build a single line of (word, color, font) tuples that fits within max_w."""
    colored = [
        (w, get_word_color(w, i, len(words), rng, style), font)
        for i, w in enumerate(words)
    ]
    space_w = _word_width(draw, " ", font)
    total = sum(_word_width(draw, w, f) for w, _, f in colored) + space_w * (len(colored) - 1)
    if total <= max_w:
        return colored

    lines, current, cur_w = [], [], 0
    for word, color, fnt in colored:
        ww = _word_width(draw, word, fnt)
        extra = space_w if current else 0
        if current and cur_w + extra + ww > max_w:
            lines.append(current)
            current, cur_w = [], 0
            extra = 0
        current.append((word, color, fnt))
        cur_w += extra + ww
    if current:
        lines.append(current)
    return lines


def render_caption(text, width, height, font_size=FONT_SIZE, seed=None, style=None):
    """
    Industry-grade viral caption renderer:
    - Per-word dynamic color (white / #FFCC00 / #00FF66)
    - Heavy font with thick stroke + drop shadow
    - Rounded semi-transparent pill background
    """
    style = style or CaptionStyle()
    font_size = style.font_size or font_size
    rng = random.Random(seed if seed is not None else hash(text) % 2**32)
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = get_viral_font(font_size, style.font_family)
    max_w = width - 120
    words = text.split()
    if not words:
        return np.array(img)

    for i, word in enumerate(words):
        if _word_width(draw, word, font) > max_w:
            words[i] = word
            font = _fit_font_for_word(draw, word, max_w, font_size, style.font_family)

    line_groups = _layout_colored_line(draw, words, font, max_w, rng, style)
    if not isinstance(line_groups[0], list):
        line_groups = [line_groups]

    line_h = font_size + 16
    space_w = _word_width(draw, " ", font)
    line_widths = []
    for group in line_groups:
        lw = sum(_word_width(draw, w, f) for w, _, f in group)
        lw += space_w * max(0, len(group) - 1)
        line_widths.append(lw)

    total_h = len(line_groups) * line_h
    pill_w = max(line_widths) + PILL_PAD_X * 2
    pill_h = total_h + PILL_PAD_Y * 2
    pill_x = (width - pill_w) // 2
    pill_y = (height - pill_h) // 2

    pill_rgba = hex_to_rgba(style.pill_color, style.pill_opacity)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rounded_rectangle(
        [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
        radius=PILL_RADIUS,
        fill=pill_rgba,
    )
    img = Image.alpha_composite(img, overlay)
    draw = ImageDraw.Draw(img)

    text_y = pill_y + PILL_PAD_Y - 6
    for li, group in enumerate(line_groups):
        line_w = line_widths[li]
        x = (width - line_w) // 2
        y = text_y + li * line_h
        for wi, (word, color, fnt) in enumerate(group):
            draw_word_with_effects(draw, (x, y), word, fnt, color)
            x += _word_width(draw, word, fnt)
            if wi < len(group) - 1:
                x += space_w

    return np.array(img)


def generate_script(prompt, model=OLLAMA_MODEL):
    """Generate a viral script using local Ollama (free, no API key)."""
    system = (
        "You are an elite YouTube Shorts scriptwriter. Follow these rules STRICTLY:\n"
        "1. Length: 40-55 seconds when read aloud at normal pace.\n"
        "2. HOOK: The very first sentence must be a bold claim, curiosity gap, or pattern interrupt.\n"
        "3. No 'Hey guys', 'Welcome back', or channel introductions.\n"
        "4. Short, punchy sentences. One idea per sentence. No fluff.\n"
        "5. End with a strong call to action like 'Follow for more', 'Comment if you agree', or 'Part 2 on my profile'.\n"
        "6. Output ONLY the spoken words. No stage directions, no parentheticals, no emojis.\n"
    )
    full_prompt = f"{system}\n\nTopic: {prompt}\n\nScript:"

    try:
        r = requests.post(
            OLLAMA_URL,
            json={"model": model, "prompt": full_prompt, "stream": False},
            timeout=180,
        )
        r.raise_for_status()
        return r.json().get("response", "").strip()
    except Exception as e:
        print(f"[WARN] Ollama error ({e}). Using fallback script.")
        return (
            f"Did you know this about {prompt}? Most people have no idea. "
            "But once you learn this secret, you'll never see it the same way again. "
            "Follow for more mind-blowing facts."
        )


async def generate_audio(text, out_path, voice=TTS_VOICE):
    """Generate voiceover using Microsoft Edge TTS (free, no API key, no limits)."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(out_path))
    print(f"[OK] Audio saved: {out_path} (voice: {voice})")


def _score_clip_for_prompt(video_id, prompt):
    """Rank clips by keyword relevance to the user's prompt."""
    meta = PEXELS_VIDEO_META.get(video_id, {})
    prompt_words = set(re.findall(r"\w+", prompt.lower()))
    tags = set(meta.get("tags", []))
    title_words = set(re.findall(r"\w+", meta.get("title", "").lower()))
    return len(prompt_words & (tags | title_words))


def _extract_thumbnail(video_path: Path, thumb_path: Path, timestamp="00:00:01"):
    """Extract a preview frame from a video clip using ffmpeg."""
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-ss", timestamp, "-i", str(video_path),
                "-vframes", "1", "-vf", "scale=360:-1", "-q:v", "3",
                str(thumb_path),
            ],
            capture_output=True,
            check=True,
        )
        return thumb_path.exists()
    except Exception as e:
        print(f"[WARN] Thumbnail failed for {video_path.name}: {e}")
        return False


def search_clips_for_prompt(prompt: str, session_dir: Path, count=8):
    """
    AI-style clip search: rank Pexels gameplay footage by prompt relevance,
    download candidates, and generate preview thumbnails.
    """
    session_dir.mkdir(parents=True, exist_ok=True)
    ranked = sorted(PEXELS_GAMEPLAY_IDS, key=lambda vid: -_score_clip_for_prompt(vid, prompt))
    rng = random.Random(hash(prompt) % 2**32)
    pool = ranked[: max(count * 2, count)]
    rng.shuffle(pool)
    candidate_ids = pool[:count]

    print(f"[INFO] Searching {len(candidate_ids)} clips for: {prompt!r}")
    clips = []
    for vid in candidate_ids:
        clip_path = session_dir / f"clip_{vid}.mp4"
        thumb_path = session_dir / f"thumb_{vid}.jpg"
        meta = PEXELS_VIDEO_META.get(vid, {})

        if not clip_path.exists() or clip_path.stat().st_size < 50_000:
            print(f"[INFO] Downloading clip pexels:{vid}...")
            if not download_pexels_gameplay(vid, clip_path):
                continue

        if not thumb_path.exists():
            _extract_thumbnail(clip_path, thumb_path)

        preview = f"thumb_{vid}.jpg" if thumb_path.exists() else None
        clips.append({
            "id": str(vid),
            "title": meta.get("title", f"Gameplay Clip {vid}"),
            "tags": meta.get("tags", []),
            "filename": clip_path.name,
            "preview": preview,
            "relevance": _score_clip_for_prompt(vid, prompt),
        })

    clips.sort(key=lambda c: -c["relevance"])
    return clips


def download_pollinations_image(prompt, out_path, width=1080, height=1920):
    """
    Download image from Pollinations.ai.
    Free, unlimited, no API key, no signup required.
    """
    encoded = urllib.parse.quote(prompt)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={width}&height={height}&nologo=true&seed={abs(hash(prompt)) % 99999}"
    )
    try:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(r.content)
        return True
    except Exception as e:
        print(f"[WARN] Failed to download image: {e}")
        return False


def _is_video(path):
    return Path(path).suffix.lower() in VIDEO_EXTENSIONS


def download_pexels_gameplay(video_id, out_path: Path):
    """Download a free gameplay clip via Pexels redirect (no API key)."""
    url = f"https://www.pexels.com/download/video/{video_id}/"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }
    try:
        r = requests.get(url, headers=headers, timeout=180, allow_redirects=True, stream=True)
        r.raise_for_status()
        if "video" not in r.headers.get("content-type", ""):
            return False
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
        return out_path.stat().st_size > 50_000
    except Exception as e:
        print(f"[WARN] Gameplay download failed (id={video_id}): {e}")
        if out_path.exists():
            out_path.unlink(missing_ok=True)
        return False


def download_gameplay_clips(video_dir: Path, count=GAMEPLAY_COUNT):
    """Download random free gameplay clips into video_dir (cached)."""
    video_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(video_dir.glob("gameplay_*.mp4"))
    if len(existing) >= count:
        print(f"[INFO] Using {len(existing)} cached gameplay clips")
        return existing[:count]

    pool = PEXELS_GAMEPLAY_IDS.copy()
    random.shuffle(pool)
    downloaded = list(existing)
    print(f"[INFO] Downloading gameplay backgrounds ({count} clips)...")

    for video_id in pool:
        if len(downloaded) >= count:
            break
        out_path = video_dir / f"gameplay_{len(downloaded):02d}.mp4"
        if out_path.exists() and out_path.stat().st_size > 50_000:
            downloaded.append(out_path)
            continue
        print(f"[INFO] Downloading gameplay clip {len(downloaded) + 1}/{count} (pexels:{video_id})...")
        if download_pexels_gameplay(video_id, out_path):
            downloaded.append(out_path)
            print(f"[OK] Saved: {out_path.name}")

    if not downloaded:
        print("[ERROR] Could not download any gameplay clips. Check your internet connection.")
    return downloaded


def generate_images(prompt, image_dir: Path, count=IMAGE_COUNT):
    """Generate images. Falls back to gradient placeholders if offline."""
    prompts = [
        f"{prompt} cinematic dramatic scene, high quality, 8k",
        f"{prompt} close up detail shot, dramatic lighting",
        f"{prompt} wide atmospheric scene, moody lighting",
    ]
    for i in range(count):
        out_path = image_dir / f"scene_{i:02d}.jpg"
        if out_path.exists():
            continue
        print(f"[INFO] Generating image {i + 1}/{count}...")
        success = download_pollinations_image(prompts[i % len(prompts)], out_path)
        if not success:
            # Create a dark gradient placeholder so the pipeline still works
            img = Image.new("RGB", (W, H), color=(15, 15, 30))
            draw = ImageDraw.Draw(img)
            for y in range(H):
                color = (15, int(15 + y / H * 40), int(30 + y / H * 60))
                draw.line([(0, y), (W, y)], fill=color)
            img.save(out_path)
            print(f"[WARN] Used placeholder for image {i + 1}")


def _crop_to_ratio(img, target_w, target_h):
    """Center-crop a PIL image to the target aspect ratio."""
    iw, ih = img.size
    target_ratio = target_w / target_h
    current_ratio = iw / ih
    if current_ratio > target_ratio:
        new_w = int(ih * target_ratio)
        left = (iw - new_w) // 2
        return img.crop((left, 0, left + new_w, ih))
    new_h = int(iw / target_ratio)
    top = (ih - new_h) // 2
    return img.crop((0, top, iw, top + new_h))


@lru_cache(maxsize=32)
def _load_blurred_bg_array(image_path_str, size_key):
    """Cached static blurred background — locked frame, no zoom glitches."""
    size = size_key
    img = Image.open(image_path_str).convert("RGB")
    img = img.resize(size, Image.Resampling.LANCZOS)
    img = img.filter(ImageFilter.GaussianBlur(radius=38))
    img = ImageEnhance.Brightness(img).enhance(0.42)
    return np.array(img, dtype=np.uint8)


def create_static_blurred_background(image_path, duration, size=(W, H)):
    """Static blurred fill — never animates, preventing background jitter."""
    arr = _load_blurred_bg_array(str(image_path), size)
    return ImageClip(arr).with_duration(duration)


def create_ken_burns_clip(image_path, duration, size=(W, H), zoom_end=KEN_BURNS_ZOOM_END):
    """
    Dynamic Ken Burns: smooth scale 1.0 → 1.15 over clip duration.
    Image is pre-cropped to 9:16 and oversized for headroom.
    """
    img = _crop_to_ratio(Image.open(image_path).convert("RGB"), size[0], size[1])
    headroom = 1.20
    base_w = int(size[0] * headroom)
    base_h = int(size[1] * headroom)
    arr = np.array(img.resize((base_w, base_h), Image.Resampling.LANCZOS), dtype=np.uint8)

    clip = ImageClip(arr).with_duration(duration)
    zoom_range = zoom_end - 1.0

    def scale(t):
        progress = min(max(t / max(duration, 0.001), 0.0), 1.0)
        return 1.0 + zoom_range * progress

    return clip.resized(scale).with_position("center")


def create_half_ken_burns(image_path, duration, panel_size):
    """Ken Burns clip for split-screen top/bottom panels."""
    return create_ken_burns_clip(image_path, duration, size=panel_size)


def apply_shake(clip, intensity=SHAKE_INTENSITY):
    """Apply a subtle pop/shake at clip start (image cuts & punchlines)."""
    shake_dur = SHAKE_DURATION

    def pos(t):
        if t >= shake_dur:
            return (0, 0)
        decay = 1.0 - (t / shake_dur)
        dx = intensity * decay * math.sin(t * 90)
        dy = intensity * decay * math.cos(t * 70)
        return (dx, dy)

    return clip.with_position(pos)


def _fit_video_vertical(clip, size=(W, H)):
    """Scale + center-crop any clip to 9:16 vertical."""
    target_w, target_h = size
    scale = target_h / clip.h
    fitted = clip.resized(height=target_h)
    if fitted.w > target_w:
        x1 = (fitted.w - target_w) // 2
        return fitted.cropped(x1=x1, width=target_w)
    if fitted.w < target_w:
        scale = target_w / clip.w
        fitted = clip.resized(width=target_w)
        if fitted.h > target_h:
            y1 = (fitted.h - target_h) // 2
            return fitted.cropped(y1=y1, height=target_h)
    return fitted


def create_gameplay_segment(video_path, duration, size=(W, H), rng=None, zoom=True):
    """
    Extract a random segment from a gameplay clip, fit to 9:16, mute audio.
    Loops short clips to fill the requested duration.
    """
    rng = rng or random.Random()
    src = VideoFileClip(str(video_path))
    src_dur = src.duration or 0.1
    need = max(duration, 0.1)

    if src_dur <= need + 0.05:
        base = src.subclipped(0, src_dur).without_audio()
        if base.duration < need:
            loops = int(need / base.duration) + 1
            base = concatenate_videoclips([base] * loops).subclipped(0, need)
    else:
        start = rng.uniform(0, src_dur - need)
        base = src.subclipped(start, start + need).without_audio()

    seg = _fit_video_vertical(base, size)
    if zoom:
        zoom_range = GAMEPLAY_ZOOM_END - 1.0

        def scale(t):
            progress = min(max(t / need, 0.0), 1.0)
            return 1.0 + zoom_range * progress

        seg = seg.resized(scale).with_position("center")

    return seg.with_duration(need)


def plan_visual_cuts(duration, media_paths, rng=None):
    """
    Fast-cutting rhythm: 3–5s per cut, cycling background media.
    Every Nth cut uses split-screen for visual variety.
    """
    rng = rng or random.Random(42)
    cuts = []
    t = 0.0
    idx = 0
    while t < duration - 0.05:
        cut_len = min(rng.uniform(IMAGE_CUT_MIN, IMAGE_CUT_MAX), duration - t)
        use_split = (idx % SPLIT_SCREEN_EVERY == SPLIT_SCREEN_EVERY - 1) and len(media_paths) >= 2
        cuts.append({
            "start": t,
            "duration": cut_len,
            "media_a": media_paths[idx % len(media_paths)],
            "media_b": media_paths[(idx + 1) % len(media_paths)] if use_split else None,
            "split": use_split,
            "shake": True,
            "is_video": _is_video(media_paths[0]),
        })
        t += cut_len
        idx += 1
    return cuts


def build_image_scene(cut, size=(W, H)):
    """Build a scene from static images (Ken Burns + blurred bg)."""
    dur = cut["duration"]
    bg = create_static_blurred_background(cut["media_a"], dur, size)

    if cut["split"] and cut["media_b"]:
        panel_h = size[1] // 2
        panel_size = (size[0], panel_h)
        top = create_half_ken_burns(cut["media_a"], dur, panel_size)
        bottom = create_half_ken_burns(cut["media_b"], dur, panel_size)
        fg = CompositeVideoClip(
            [top.with_position((0, 0)), bottom.with_position((0, panel_h))],
            size=size,
        ).with_duration(dur)
    else:
        fg = create_ken_burns_clip(cut["media_a"], dur, size)

    scene = CompositeVideoClip([bg, fg], size=size).with_duration(dur)
    if cut["shake"]:
        scene = apply_shake(scene)
    return scene


def build_gameplay_scene(cut, size=(W, H), rng=None):
    """Build a scene from gameplay video clips (fullscreen or split-screen)."""
    dur = cut["duration"]
    rng = rng or random.Random()

    if cut["split"] and cut["media_b"]:
        panel_h = size[1] // 2
        panel_size = (size[0], panel_h)
        top = create_gameplay_segment(cut["media_a"], dur, panel_size, rng=rng)
        bottom = create_gameplay_segment(cut["media_b"], dur, panel_size, rng=rng)
        scene = CompositeVideoClip(
            [top.with_position((0, 0)), bottom.with_position((0, panel_h))],
            size=size,
        ).with_duration(dur)
    else:
        scene = create_gameplay_segment(cut["media_a"], dur, size, rng=rng)

    if cut["shake"]:
        scene = apply_shake(scene)
    return scene


def build_visual_scene(cut, size=(W, H), rng=None):
    """Dispatch to gameplay video or static image scene builder."""
    if cut.get("is_video") or _is_video(cut["media_a"]):
        return build_gameplay_scene(cut, size, rng=rng)
    return build_image_scene(cut, size)


def extract_word_timestamps(segments) -> list:
    """
    Extract exact word-level timing from Whisper segments.
    Returns: [{"word": "Hello", "start": 0.1, "end": 0.4}, ...]
    """
    words = []
    for seg in segments:
        seg_words = getattr(seg, "words", None)
        if seg_words:
            for w in seg_words:
                words.append({"word": w.word.strip(), "start": w.start, "end": w.end})
        else:
            words.append({"word": seg.text.strip(), "start": seg.start, "end": seg.end})
    return words

def make_caption_chunks(segments):
    """
    Whisper → viral caption chunks.
    Rules: 1–3 words, ≤1.8s, millisecond-precise timing.
    Flags punchline chunks for shake sync.
    """
    words = []
    for seg in segments:
        seg_words = getattr(seg, "words", None)
        if seg_words:
            for w in seg_words:
                words.append({"text": w.word.strip(), "start": w.start, "end": w.end})
        else:
            words.append({"text": seg.text.strip(), "start": seg.start, "end": seg.end})

    if not words:
        return []

    punchline_endings = frozenset({"!", "?", "...", "…"})
    chunks = []
    current = [words[0]]
    for w in words[1:]:
        chunk_duration = w["end"] - current[0]["start"]
        if len(current) < 3 and chunk_duration < 1.8:
            current.append(w)
        else:
            text = " ".join(x["text"] for x in current)
            chunks.append({
                "text": text,
                "start": current[0]["start"],
                "end": current[-1]["end"],
                "punchline": text.rstrip()[-1:] in punchline_endings
                    or _normalize_word(current[-1]["text"]) in HIGHLIGHT_GREEN,
            })
            current = [w]

    if current:
        text = " ".join(x["text"] for x in current)
        chunks.append({
            "text": text,
            "start": current[0]["start"],
            "end": current[-1]["end"],
            "punchline": text.rstrip()[-1:] in punchline_endings
                or _normalize_word(current[-1]["text"]) in HIGHLIGHT_GREEN,
        })

    return chunks


def extract_audio_peaks(audio_path: Path, num_peaks: int = 100) -> list:
    """
    Extract downsampled audio peaks (array of floats) from an audio/video file.
    """
    try:
        from moviepy.editor import AudioFileClip
        import numpy as np

        clip = AudioFileClip(str(audio_path))
        if clip.duration <= 0:
            return []

        # Read at a low framerate to save memory
        # drastically reduce fps to 50 for large files to avoid blocking
        fps = 50
        sound_array = clip.to_soundarray(fps=fps)
        clip.close()

        if sound_array is None or len(sound_array) == 0:
            return []

        # Mono conversion if stereo
        if len(sound_array.shape) > 1:
            sound_array = np.mean(sound_array, axis=1)

        chunk_size = max(1, len(sound_array) // num_peaks)

        peaks = []
        for i in range(min(num_peaks, len(sound_array) // chunk_size + 1)):
            start = i * chunk_size
            end = min(start + chunk_size, len(sound_array))
            if start >= len(sound_array):
                break
            chunk = sound_array[start:end]
            # peak value in this chunk
            peak = float(np.max(np.abs(chunk)))
            peaks.append(peak)

        # normalize to 0.0 - 1.0
        max_peak = max(peaks) if peaks else 1.0
        if max_peak > 0:
            peaks = [p / max_peak for p in peaks]

        return peaks
    except Exception as e:
        print(f"[ERROR] Failed to extract audio peaks: {e}")
        return []


def transcribe_audio(audio_path: Path):
    """Transcribe audio using local Whisper (free, runs on CPU)."""
    print("[INFO] Loading Whisper model (first run downloads ~150MB)...")
    model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    segments, info = model.transcribe(str(audio_path), word_timestamps=True)
    print(f"[INFO] Detected language: {info.language} (probability: {info.language_probability:.2f})")
    return list(segments)


def assemble_video(media_paths, audio_path: Path, segments, out_path: Path, caption_style=None):
    """
    Industry-grade viral Short assembly:
    - Gameplay video backgrounds (default) or image Ken Burns fallback
    - Fast 3–5s cuts with split-screen variety
    - Micro-shake on cuts and punchline captions
    - Per-word colored captions at the 62% sweet spot
    - Memory-safe compositing with explicit clip cleanup
    """
    audio = AudioFileClip(str(audio_path))
    duration = audio.duration

    if not media_paths:
        raise ValueError("No background media found. Cannot build video.")

    use_video = _is_video(media_paths[0])
    bg_type = "gameplay" if use_video else "images"
    cuts = plan_visual_cuts(duration, media_paths)
    print(f"[INFO] Background: {bg_type} | {len(cuts)} cuts over {duration:.1f}s "
          f"(~{duration / len(cuts):.1f}s avg)")

    scenes = []
    rng = random.Random(42)
    for cut in cuts:
        scene = build_visual_scene(cut, rng=rng)
        scenes.append(scene)

    video = concatenate_videoclips(scenes, method="compose")
    video = video.with_audio(audio)

    chunks = make_caption_chunks(segments)
    # Determine caption vertical position based on style
    pos = (caption_style.caption_position if caption_style is not None else "bottom") if hasattr(caption_style, "caption_position") else "bottom"
    if pos == "top":
        caption_y = int(H * 0.15)
    elif pos == "center":
        caption_y = int(H * CAPTION_Y_CENTER - CAPTION_BOX_HEIGHT / 2)
    else:
        caption_y = int(H * 0.82 - CAPTION_BOX_HEIGHT / 2)

    cap_clips = []
    for i, chunk in enumerate(chunks):
        start = chunk["start"]
        end = chunk["end"]
        clip_dur = max(end - start, 0.04)

        cap_img = render_caption(
            chunk["text"], W, CAPTION_BOX_HEIGHT, seed=i, style=caption_style
        )
        cap_clip = (
            ImageClip(cap_img, is_mask=False)
            .with_start(start)
            .with_duration(clip_dur)
            .with_position(("center", caption_y))
        )
        if chunk.get("punchline"):
            cap_clip = apply_shake(cap_clip, intensity=SHAKE_INTENSITY // 2)
        cap_clips.append(cap_clip)
        del cap_img

    final = CompositeVideoClip([video] + cap_clips, size=(W, H))
    final = final.with_duration(duration)

    print(f"[INFO] Rendering {len(chunks)} caption chunks → {out_path}")
    final.write_videofile(
        str(out_path),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile=str(out_path.with_suffix(".m4a")),
        remove_temp=True,
        threads=4,
        preset="fast",
    )

    for clip in cap_clips:
        clip.close()
    for scene in scenes:
        scene.close()
    video.close()
    audio.close()
    final.close()
    _load_blurred_bg_array.cache_clear()
    gc.collect()
    print("[OK] Video rendered successfully.")


def mix_background_music(video_path: Path, music_path: Path, volume: float = 0.15):
    """
    Layer background music under the voiceover at the given volume (0.0–1.0).
    Loops the music track to match video duration. Overwrites the video file.
    """
    volume = max(0.0, min(1.0, float(volume)))
    if not music_path.exists():
        raise FileNotFoundError(f"Music file not found: {music_path}")

    temp_path = video_path.with_name(f"{video_path.stem}_mixed{video_path.suffix}")
    print(f"[INFO] Mixing background music at {volume * 100:.0f}% volume...")

    video = VideoFileClip(str(video_path))
    voice = video.audio
    if voice is None:
        video.close()
        raise ValueError("Video has no voiceover audio to mix with.")

    music = AudioFileClip(str(music_path))
    duration = video.duration

    if music.duration < duration:
        loops = int(duration / max(music.duration, 0.01)) + 1
        music = concatenate_audioclips([music] * loops).subclipped(0, duration)
    else:
        music = music.subclipped(0, duration)

    music = music.with_volume_scaled(volume)
    mixed_audio = CompositeAudioClip([voice, music])
    final = video.with_audio(mixed_audio)

    final.write_videofile(
        str(temp_path),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile=str(temp_path.with_suffix(".m4a")),
        remove_temp=True,
        threads=4,
        preset="fast",
        logger=None,
    )

    video.close()
    music.close()
    voice.close()
    mixed_audio.close()
    final.close()

    video_path.unlink(missing_ok=True)
    temp_path.rename(video_path)
    print("[OK] Background music mixed successfully.")


async def run_ai_assemble(
    script: str,
    media_paths: list,
    out_dir: Path,
    temp_dir: Path,
    caption_style: CaptionStyle | None = None,
    voice: str = TTS_VOICE,
    music_path: Path | None = None,
    music_volume: float = 0.15,
    out_name: str = "shorts_ai.mp4",
):
    """Final AI assembly with user-approved script, clips, voice, and styling."""
    check_ffmpeg()
    out_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    if not script.strip():
        raise ValueError("Script cannot be empty.")
    if not media_paths:
        raise ValueError("No gameplay clips selected.")

    (out_dir / "script.txt").write_text(script.strip(), encoding="utf-8")

    audio_path = temp_dir / f"voiceover_{abs(hash(script)) % 99999}.mp3"
    await generate_audio(script.strip(), audio_path, voice=voice)

    segments = transcribe_audio(audio_path)
    out_path = out_dir / out_name
    assemble_video(media_paths, audio_path, segments, out_path, caption_style=caption_style)
    if music_path and music_path.exists() and music_volume > 0:
        mix_background_music(out_path, music_path, music_volume)
    return out_path


async def run_ai_pipeline(
    prompt: str,
    out_dir: Path,
    gameplay_dir: Path,
    temp_dir: Path,
    music_path: Path | None = None,
    music_volume: float = 0.15,
):
    """Full one-shot AI pipeline (CLI / legacy)."""
    script = generate_script(prompt)
    media_paths = download_gameplay_clips(gameplay_dir, count=GAMEPLAY_COUNT)
    if not media_paths:
        raise RuntimeError("Could not download gameplay backgrounds.")
    out_path = await run_ai_assemble(
        script, media_paths, out_dir, temp_dir,
        music_path=music_path, music_volume=music_volume,
    )
    return out_path, script


async def run_manual_pipeline(
    video_path: Path,
    text: str,
    out_dir: Path,
    temp_dir: Path,
    caption_style: CaptionStyle,
    music_path: Path | None = None,
    music_volume: float = 0.15,
    voice: str = TTS_VOICE,
    progress_callback=None,
):
    """Manual pipeline: user video + custom text + caption styling."""
    check_ffmpeg()
    out_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")
    if not text.strip():
        raise ValueError("Script text cannot be empty.")

    audio_path = temp_dir / "voiceover_manual.mp3"
    if progress_callback:
        try:
            progress_callback(15, "Generating TTS voiceover...")
        except Exception:
            pass
    await generate_audio(text.strip(), audio_path, voice=voice)
    if progress_callback:
        try:
            progress_callback(35, "Transcribing generated audio...")
        except Exception:
            pass
    segments = transcribe_audio(audio_path)
    out_path = out_dir / "shorts_manual.mp4"
    if progress_callback:
        try:
            progress_callback(60, "Preparing visuals and captions...")
        except Exception:
            pass
    assemble_video([video_path], audio_path, segments, out_path, caption_style=caption_style)
    if music_path and music_path.exists() and music_volume > 0:
        mix_background_music(out_path, music_path, music_volume)
    return out_path


async def main():
    parser = argparse.ArgumentParser(description="Free YouTube Shorts Pipeline")
    parser.add_argument("prompt", nargs="?", help="Topic prompt for the Shorts")
    parser.add_argument("--script", help="Path to a .txt file with your own script")
    parser.add_argument("--images", help="Folder with your own images (static Ken Burns mode)")
    parser.add_argument("--gameplay", help="Folder with your own .mp4 gameplay clips")
    parser.add_argument("--audio", help="Path to existing audio file (skips TTS)")
    parser.add_argument("--out", default="output/shorts_final.mp4", help="Output path")
    args = parser.parse_args()

    if not args.prompt and not args.script:
        parser.print_help()
        sys.exit(1)

    check_ffmpeg()

    out_dir = Path("output")
    temp_dir = Path("temp")
    img_dir = Path("images")
    gameplay_dir = Path("gameplay")
    for d in [out_dir, temp_dir, img_dir, gameplay_dir]:
        d.mkdir(exist_ok=True)

    # 1. Script
    if args.script:
        script_path = Path(args.script)
        if not script_path.exists():
            print(f"[ERROR] Script file not found: {script_path}")
            sys.exit(1)
        script = script_path.read_text(encoding="utf-8").strip()
        print(f"[INFO] Using manual script ({len(script)} chars)")
    else:
        print("[1/5] Generating viral script with Ollama...")
        script = generate_script(args.prompt)
        print(f"[OK] Script:\n{'-'*40}\n{script}\n{'-'*40}\n")

    (out_dir / "script.txt").write_text(script, encoding="utf-8")

    # 2. Audio (TTS)
    if args.audio:
        audio_path = Path(args.audio)
        print(f"[INFO] Using existing audio: {audio_path}")
    else:
        audio_path = temp_dir / "voiceover.mp3"
        print("[2/5] Generating voiceover...")
        await generate_audio(script, audio_path)

    # 3. Background media (gameplay default, images optional)
    if args.gameplay:
        media_dir = Path(args.gameplay)
        media_paths = sorted(media_dir.glob("*.mp4")) + sorted(media_dir.glob("*.mov"))
        print(f"[INFO] Using {len(media_paths)} gameplay clips from: {media_dir}")
    elif args.images:
        media_dir = Path(args.images)
        media_paths = sorted(media_dir.glob("*.jpg")) + sorted(media_dir.glob("*.png"))
        print(f"[INFO] Using {len(media_paths)} images from: {media_dir}")
    elif USE_GAMEPLAY_DEFAULT:
        print("[3/5] Downloading random gameplay backgrounds...")
        media_paths = download_gameplay_clips(gameplay_dir, count=GAMEPLAY_COUNT)
    else:
        print("[3/5] Generating images...")
        generate_images(args.prompt or "shorts content", img_dir, count=IMAGE_COUNT)
        media_paths = sorted(img_dir.glob("*.jpg")) + sorted(img_dir.glob("*.png"))

    if not media_paths:
        print("[ERROR] No background media found.")
        print("       Gameplay download failed — try: python make_shorts.py --gameplay ./your_clips/")
        sys.exit(1)

    # 4. Transcribe
    print("[4/5] Transcribing audio with local Whisper...")
    segments = transcribe_audio(audio_path)

    # 5. Assemble
    print("[5/5] Assembling video with captions and effects...")
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = out_dir / out_path.name

    assemble_video(media_paths, audio_path, segments, out_path)

    print(f"\n🎉 DONE! Your Shorts is ready at:\n   {out_path.absolute()}")
    print("\nTip: Upload to YouTube as a Short. Use a title that starts with the hook!")


if __name__ == "__main__":
    asyncio.run(main())
