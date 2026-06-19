#!/usr/bin/env python3
import sys
import shutil
import random
import re
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

from moviepy import (
    VideoFileClip,
    ImageClip,
    AudioFileClip,
    CompositeVideoClip,
    CompositeAudioClip,
)

# Import shared utilities from the core pipeline
from make_shorts import (
    get_viral_font,
    CaptionStyle,
    render_caption,
    hex_to_rgba,
    CAPTION_BOX_HEIGHT,
)

PROJECT_DIR = Path(__file__).parent.resolve()

def change_clip_speed(clip, speed):
    """Change playback speed of a moviepy clip, with safe fallback versions."""
    if speed == 1.0:
        return clip
    try:
        from moviepy.video.fx.MultiplySpeed import MultiplySpeed
        return clip.with_effects([MultiplySpeed(speed)])
    except Exception:
        try:
            import moviepy.video.fx.all as vfx
            return clip.fx(vfx.speedx, speed)
        except Exception as e:
            print(f"[WARN] Failed to change video speed: {e}")
            return clip

def apply_video_filter(clip, filter_type):
    """Apply visual styling filters to each video frame using PIL."""
    def filter_frame(frame):
        # frame is (H, W, 3) RGB numpy array
        img = Image.fromarray(frame)
        if filter_type == "grayscale":
            img = img.convert("L").convert("RGB")
        elif filter_type == "blur":
            img = img.filter(ImageFilter.GaussianBlur(5))
        elif filter_type == "vintage":
            r, g, b = img.split()
            r = r.point(lambda i: i * 1.1)
            b = b.point(lambda i: i * 0.9)
            img = Image.merge("RGB", (r, g, b))
        elif filter_type == "warm":
            r, g, b = img.split()
            r = r.point(lambda i: min(255, int(i * 1.08)))
            img = Image.merge("RGB", (r, g, b))
        elif filter_type == "cool":
            r, g, b = img.split()
            b = b.point(lambda i: min(255, int(i * 1.08)))
            img = Image.merge("RGB", (r, g, b))
        elif filter_type == "brightness":
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(1.2)
        elif filter_type == "contrast":
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1.2)
        elif filter_type == "saturation":
            enhancer = ImageEnhance.Color(img)
            img = enhancer.enhance(1.2)
        return np.array(img)

    try:
        return clip.fl_image(filter_frame)
    except Exception as e:
        print(f"[WARN] Failed to apply filter {filter_type}: {e}")
        return clip

def process_video_clip(clip, target_w, target_h, properties):
    """Process video dimensions, position, volume, scale, rotation, opacity, filters, and transitions."""
    crop_mode = properties.get("cropMode", "cover")
    vol = properties.get("volume", 1.0)
    muted = properties.get("muted", False)
    opacity = properties.get("opacity", 1.0)
    scale_factor = properties.get("scale", 1.0)
    rotation = properties.get("rotation", 0)
    x = properties.get("x", target_w / 2)
    y = properties.get("y", target_h / 2)
    speed = properties.get("speed", 1.0)

    # Apply speed first to adjust duration bounds
    clip = change_clip_speed(clip, speed)

    # Apply volume and mute
    if muted:
        clip = clip.without_audio()
    else:
        try:
            clip = clip.with_volume(vol)
        except Exception:
            pass

    # Fit source clip using cropMode
    cw, ch = clip.w, clip.h
    if crop_mode == "cover":
        scale = max(target_w / cw, target_h / ch)
        new_w, new_h = int(cw * scale), int(ch * scale)
        try:
            fitted = clip.resized(newsize=(new_w, new_h))
        except Exception:
            fitted = clip.resize(newsize=(new_w, new_h))
        cx = (fitted.w - target_w) // 2
        cy = (fitted.h - target_h) // 2
        try:
            fitted = fitted.cropped(x1=cx, y1=cy, width=target_w, height=target_h)
        except Exception:
            fitted = fitted.crop(x1=cx, y1=cy, width=target_w, height=target_h)
        clip = fitted
    elif crop_mode == "contain":
        scale = min(target_w / cw, target_h / ch)
        new_w, new_h = int(cw * scale), int(ch * scale)
        try:
            fitted = clip.resized(newsize=(new_w, new_h))
        except Exception:
            fitted = clip.resize(newsize=(new_w, new_h))
        clip = fitted
    elif crop_mode == "fill":
        try:
            clip = clip.resized(newsize=(target_w, target_h))
        except Exception:
            clip = clip.resize(newsize=(target_w, target_h))

    # Apply scale factor (on top of base fit scale)
    if scale_factor != 1.0:
        try:
            clip = clip.resized(scale_factor)
        except Exception:
            clip = clip.resize(scale_factor)

    # Apply rotation
    if rotation != 0:
        try:
            clip = clip.rotated(rotation)
        except Exception:
            try:
                clip = clip.rotate(rotation)
            except Exception:
                pass

    # Apply opacity
    if opacity != 1.0:
        try:
            clip = clip.with_opacity(opacity)
        except Exception:
            try:
                clip = clip.set_opacity(opacity)
            except Exception:
                pass

    # Apply filter
    filter_type = properties.get("filter", "none")
    if filter_type != "none":
        clip = apply_video_filter(clip, filter_type)

    # Apply transitions (fade/cross-dissolve)
    transition = properties.get("transition", "none")
    trans_dur = properties.get("transitionDuration", 0.5)
    if transition == "fade":
        try:
            clip = clip.with_fadein(trans_dur).with_fadeout(trans_dur)
        except Exception:
            try:
                clip = clip.fadein(trans_dur).fadeout(trans_dur)
            except Exception:
                pass

    # Center-offset position relative to canvas top-left
    pos_x = x - clip.w / 2
    pos_y = y - clip.h / 2
    clip = clip.with_position((pos_x, pos_y))

    return clip

def process_image_clip(clip, target_w, target_h, properties):
    """Fit, rotate, apply opacity and position to an Image overlay clip."""
    crop_mode = properties.get("cropMode", "contain") # Contain default for image overlays
    opacity = properties.get("opacity", 1.0)
    scale_factor = properties.get("scale", 1.0)
    rotation = properties.get("rotation", 0)
    x = properties.get("x", target_w / 2)
    y = properties.get("y", target_h / 2)

    cw, ch = clip.w, clip.h
    if crop_mode == "cover":
        scale = max(target_w / cw, target_h / ch)
        try:
            clip = clip.resized(newsize=(int(cw * scale), int(ch * scale)))
        except Exception:
            clip = clip.resize(newsize=(int(cw * scale), int(ch * scale)))
        cx = (clip.w - target_w) // 2
        cy = (clip.h - target_h) // 2
        try:
            clip = clip.cropped(x1=cx, y1=cy, width=target_w, height=target_h)
        except Exception:
            clip = clip.crop(x1=cx, y1=cy, width=target_w, height=target_h)
    elif crop_mode == "contain":
        scale = min(target_w / cw, target_h / ch)
        try:
            clip = clip.resized(newsize=(int(cw * scale), int(ch * scale)))
        except Exception:
            clip = clip.resize(newsize=(int(cw * scale), int(ch * scale)))
    elif crop_mode == "fill":
        try:
            clip = clip.resized(newsize=(target_w, target_h))
        except Exception:
            clip = clip.resize(newsize=(target_w, target_h))

    if scale_factor != 1.0:
        try:
            clip = clip.resized(scale_factor)
        except Exception:
            clip = clip.resize(scale_factor)

    if rotation != 0:
        try:
            clip = clip.rotated(rotation)
        except Exception:
            try:
                clip = clip.rotate(rotation)
            except Exception:
                pass

    if opacity != 1.0:
        try:
            clip = clip.with_opacity(opacity)
        except Exception:
            try:
                clip = clip.set_opacity(opacity)
            except Exception:
                pass

    pos_x = x - clip.w / 2
    pos_y = y - clip.h / 2
    clip = clip.with_position((pos_x, pos_y))
    return clip

def render_text_to_image(text, font_family, font_size, text_color, bg_color=None, bg_opacity=255, alignment="center"):
    """Draw custom font text multi-line block onto a transparent RGBA image with optional background pill."""
    font = get_viral_font(font_size, font_family)
    temp_img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    draw = ImageDraw.Draw(temp_img)

    lines = text.split("\n")
    line_heights = []
    line_widths = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        line_widths.append(bbox[2] - bbox[0])
        line_heights.append(bbox[3] - bbox[1])

    max_w = max(line_widths) if line_widths else 0
    total_h = sum(line_heights) + 12 * (len(lines) - 1)

    padding_x = 24
    padding_y = 20
    img_w = max_w + padding_x * 2
    img_h = total_h + padding_y * 2

    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if bg_color:
        bg_rgba = hex_to_rgba(bg_color, bg_opacity)
        draw.rounded_rectangle([0, 0, img_w, img_h], radius=16, fill=bg_rgba)

    current_y = padding_y
    text_rgba = hex_to_rgba(text_color, 255)
    for i, line in enumerate(lines):
        lw = line_widths[i]
        lh = line_heights[i]
        if alignment == "center":
            lx = padding_x + (max_w - lw) // 2
        elif alignment == "right":
            lx = padding_x + (max_w - lw)
        else:
            lx = padding_x
        draw.text((lx, current_y), line, font=font, fill=text_rgba)
        current_y += lh + 12

    return np.array(img)

def render_studio_project(project_data, output_path, progress_callback=None):
    """
    Renders a Studio project JSON representation to an MP4 video.
    """
    width = project_data.get("width", 1080)
    height = project_data.get("height", 1920)
    fps = project_data.get("fps", 30)
    total_duration = float(project_data.get("duration", 0))

    # Compute maximum end time from tracks if total duration is 0
    if total_duration <= 0:
        for track in project_data.get("tracks", []):
            for clip_data in track.get("clips", []):
                clip_end = float(clip_data.get("start", 0)) + float(clip_data.get("duration", 0))
                if clip_end > total_duration:
                    total_duration = clip_end

    if total_duration <= 0:
        total_duration = 5.0 # Fallback default

    if progress_callback:
        progress_callback(10, "Parsing tracks...")

    assets_map = {a["id"]: a for a in project_data.get("assets", [])}

    video_clips = []
    audio_clips = []

    tracks = project_data.get("tracks", [])
    total_steps = sum(len(track.get("clips", [])) for track in tracks)
    processed_steps = 0

    for track in tracks:
        track_type = track.get("type")
        track_clips = track.get("clips", [])

        for clip_data in track_clips:
            processed_steps += 1
            if progress_callback:
                pct = 10 + int(70 * (processed_steps / max(1, total_steps)))
                progress_callback(pct, f"Processing {track_type} clip {processed_steps}/{total_steps}...")

            start = float(clip_data.get("start", 0))
            duration = float(clip_data.get("duration", 0))
            if duration <= 0:
                continue

            if track_type in ["video", "overlay"]:
                asset_id = clip_data.get("assetId")
                asset = assets_map.get(asset_id)
                if not asset or not asset.get("path"):
                    continue

                path = Path(asset["path"])
                # Fallback search path in uploads/studio_uploads
                if not path.exists():
                    path = PROJECT_DIR / "studio_uploads" / Path(asset["path"]).name
                    if not path.exists():
                        path = PROJECT_DIR / "uploads" / Path(asset["path"]).name

                if not path.exists():
                    print(f"[WARN] Video file not found: {asset.get('path')}")
                    continue

                try:
                    v_clip = VideoFileClip(str(path))
                except Exception as e:
                    print(f"[ERROR] Failed to load video {path}: {e}")
                    continue

                trim_start = float(clip_data.get("trimStart", 0))
                speed = float(clip_data.get("speed", 1.0))
                # Adjust source trim duration to account for custom playback speed
                source_duration = duration * speed
                try:
                    v_clip = v_clip.subclipped(trim_start, trim_start + source_duration)
                except Exception:
                    try:
                        v_clip = v_clip.subclip(trim_start, trim_start + source_duration)
                    except Exception:
                        pass

                v_clip = v_clip.with_start(start).with_duration(duration)

                # Process sizing, positioning, opacity, speed, volume, filters
                try:
                    v_clip = process_video_clip(v_clip, width, height, clip_data)
                except Exception as e:
                    print(f"[ERROR] Failed to process video clip styling: {e}")

                video_clips.append(v_clip)

            elif track_type == "image":
                asset_id = clip_data.get("assetId")
                asset = assets_map.get(asset_id)
                if not asset or not asset.get("path"):
                    continue

                path = Path(asset["path"])
                if not path.exists():
                    path = PROJECT_DIR / "studio_uploads" / Path(asset["path"]).name
                    if not path.exists():
                        path = PROJECT_DIR / "uploads" / Path(asset["path"]).name

                if not path.exists():
                    print(f"[WARN] Image file not found: {asset.get('path')}")
                    continue

                try:
                    img_pil = Image.open(str(path)).convert("RGBA")
                    img_clip = ImageClip(np.array(img_pil))
                except Exception as e:
                    print(f"[ERROR] Failed to load image {path}: {e}")
                    continue

                img_clip = img_clip.with_start(start).with_duration(duration)

                try:
                    img_clip = process_image_clip(img_clip, width, height, clip_data)
                except Exception as e:
                    print(f"[ERROR] Failed to process image overlay styling: {e}")

                video_clips.append(img_clip)

            elif track_type == "text":
                text_content = clip_data.get("text", "")
                if not text_content:
                    continue

                font_family = clip_data.get("fontFamily", "impact")
                font_size = int(clip_data.get("fontSize", 88))
                color = clip_data.get("color", "#FFFFFF")
                bg_color = clip_data.get("backgroundColor")
                bg_opacity = int(clip_data.get("backgroundOpacity", 140))
                alignment = clip_data.get("alignment", "center")
                opacity = float(clip_data.get("opacity", 1.0))
                x = float(clip_data.get("x", width / 2))
                y = float(clip_data.get("y", height / 2))

                try:
                    img_arr = render_text_to_image(
                        text_content, font_family, font_size, color, bg_color, bg_opacity, alignment
                    )
                    txt_clip = ImageClip(img_arr).with_start(start).with_duration(duration)

                    rotation = float(clip_data.get("rotation", 0))
                    if rotation != 0:
                        try:
                            txt_clip = txt_clip.rotated(rotation)
                        except Exception:
                            try:
                                txt_clip = txt_clip.rotate(rotation)
                            except Exception:
                                pass

                    if opacity != 1.0:
                        txt_clip = txt_clip.with_opacity(opacity)

                    pos_x = x - txt_clip.w / 2
                    pos_y = y - txt_clip.h / 2
                    txt_clip = txt_clip.with_position((pos_x, pos_y))
                    video_clips.append(txt_clip)
                except Exception as e:
                    print(f"[ERROR] Failed to render text overlay {text_content}: {e}")

            elif track_type == "captions":
                text_content = clip_data.get("text", "")
                if not text_content:
                    continue

                style_data = clip_data.get("style", {})
                style = CaptionStyle(
                    font_family=style_data.get("fontFamily", "impact"),
                    font_size=int(style_data.get("fontSize", 88)),
                    text_color=style_data.get("textColor", "#FFFFFF"),
                    highlight_color=style_data.get("highlightColor", "#FFCC00"),
                    accent_color=style_data.get("accentColor", "#00FF66"),
                    pill_color=style_data.get("pillColor", "#000000"),
                    pill_opacity=int(style_data.get("pillOpacity", 140)),
                    dynamic_highlights=style_data.get("dynamicHighlights", True),
                    caption_position=style_data.get("captionPosition", "bottom"),
                )

                if style.caption_position == "top":
                    caption_y = int(height * 0.18 - CAPTION_BOX_HEIGHT / 2)
                elif style.caption_position == "center":
                    caption_y = int(height * 0.5 - CAPTION_BOX_HEIGHT / 2)
                else:
                    caption_y = int(height * 0.82 - CAPTION_BOX_HEIGHT / 2)

                try:
                    cap_img = render_caption(
                        text_content, width, CAPTION_BOX_HEIGHT, seed=hash(text_content), style=style
                    )
                    cap_clip = (
                        ImageClip(cap_img, is_mask=False)
                        .with_start(start)
                        .with_duration(duration)
                        .with_position(("center", caption_y))
                    )
                    video_clips.append(cap_clip)
                except Exception as e:
                    print(f"[ERROR] Failed to render caption clip: {e}")

            elif track_type == "audio":
                asset_id = clip_data.get("assetId")
                asset = assets_map.get(asset_id)
                if not asset or not asset.get("path"):
                    continue

                path = Path(asset["path"])
                if not path.exists():
                    path = PROJECT_DIR / "studio_uploads" / Path(asset["path"]).name
                    if not path.exists():
                        path = PROJECT_DIR / "uploads" / Path(asset["path"]).name

                if not path.exists():
                    print(f"[WARN] Audio file not found: {asset.get('path')}")
                    continue

                try:
                    a_clip = AudioFileClip(str(path))
                except Exception as e:
                    print(f"[ERROR] Failed to load audio {path}: {e}")
                    continue

                trim_start = float(clip_data.get("trimStart", 0))
                try:
                    a_clip = a_clip.subclipped(trim_start, trim_start + duration)
                except Exception:
                    try:
                        a_clip = a_clip.subclip(trim_start, trim_start + duration)
                    except Exception:
                        pass

                a_clip = a_clip.with_start(start).with_duration(duration)

                vol = float(clip_data.get("volume", 1.0))
                if clip_data.get("muted", False):
                    vol = 0.0
                try:
                    a_clip = a_clip.with_volume(vol)
                except Exception:
                    pass

                fade_in = float(clip_data.get("fadeIn", 0))
                fade_out = float(clip_data.get("fadeOut", 0))
                if fade_in > 0:
                    try:
                        a_clip = a_clip.with_fadein(fade_in)
                    except Exception:
                        pass
                if fade_out > 0:
                    try:
                        a_clip = a_clip.with_fadeout(fade_out)
                    except Exception:
                        pass

                audio_clips.append(a_clip)

    if progress_callback:
        progress_callback(80, "Compositing clips...")

    # Ensure we have at least one video layer
    if not video_clips:
        from moviepy.video.VideoClip import ColorClip
        video_clips.append(ColorClip(size=(width, height), color=(0, 0, 0), duration=total_duration))

    # Composite layers
    final_video = CompositeVideoClip(video_clips, size=(width, height)).with_duration(total_duration)

    # Composite audio
    if audio_clips:
        all_audios = []
        # Incorporate visual clip audio tracks if they exist
        video_audio = final_video.audio
        if video_audio:
            all_audios.append(video_audio)
        all_audios.extend(audio_clips)

        final_audio = CompositeAudioClip(all_audios).with_duration(total_duration)
        final_video = final_video.with_audio(final_audio)

    if progress_callback:
        progress_callback(85, "Rendering output file...")

    # Write output MP4
    final_video.write_videofile(
        str(output_path),
        fps=fps,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile=str(PROJECT_DIR / "temp" / f"temp_audio_{random.randint(0, 100000)}.m4a"),
        remove_temp=True,
        logger=None,
    )

    # Cleanup clips to release file handles
    final_video.close()
    for c in video_clips:
        c.close()
    for c in audio_clips:
        c.close()

    if progress_callback:
        progress_callback(100, "Done!")

    return output_path
