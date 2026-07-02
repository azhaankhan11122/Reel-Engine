#!/usr/bin/env python3
"""Web UI for Reel Engine — AI Mode (wizard) & Manual Mode."""

import asyncio
import sys
import subprocess
import threading
import traceback
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, jsonify, render_template, request, send_from_directory
from moviepy.video.io.VideoFileClip import VideoFileClip
from moviepy.video.VideoClip import TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.audio.io.AudioFileClip import AudioFileClip
from werkzeug.utils import secure_filename
import requests
import shutil
import re
try:
    import yt_dlp
except ImportError:
    yt_dlp = None

APP_DIR = Path(__file__).parent
PROJECT_DIR = APP_DIR.parent
sys.path.insert(0, str(PROJECT_DIR))

from make_shorts import (
    FONT_CHOICES,
    TTS_VOICE_CHOICES,
    CaptionStyle,
    generate_script,
    run_ai_assemble,
    run_manual_pipeline,
    search_clips_for_prompt,
    transcribe_audio,
    generate_audio,
    make_caption_chunks,
)
from studio_renderer import render_studio_project


UPLOAD_DIR = PROJECT_DIR / "uploads"
OUTPUT_DIR = PROJECT_DIR / "output"
TEMP_DIR = PROJECT_DIR / "temp"
GAMEPLAY_DIR = PROJECT_DIR / "gameplay"
MUSIC_DIR = PROJECT_DIR / "music"
SESSIONS_DIR = PROJECT_DIR / "sessions"

for d in [UPLOAD_DIR, OUTPUT_DIR, TEMP_DIR, GAMEPLAY_DIR, MUSIC_DIR, SESSIONS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}

app = Flask(
    __name__,
    template_folder=str(APP_DIR / "templates"),
    static_folder=str(APP_DIR / "static"),
)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

jobs: dict[str, dict] = {}
ai_sessions: dict[str, dict] = {}


@app.context_processor
def inject_globals():
    return {
        "font_choices": FONT_CHOICES,
        "voice_choices": TTS_VOICE_CHOICES,
    }


def _run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _start_job(job_id: str, target):
    def worker():
        jobs[job_id]["status"] = "running"
        jobs[job_id]["message"] = "Processing..."
        jobs[job_id].setdefault("percent", 0)
        try:
            result = target()
            jobs[job_id].update({
                "status": "done",
                "message": "Video ready!",
                "result": result,
            })
        except Exception as e:
            jobs[job_id].update({
                "status": "error",
                "message": str(e),
                "trace": traceback.format_exc(),
            })

    threading.Thread(target=worker, daemon=True).start()


def _parse_music_volume(raw, default=0.15):
    try:
        vol = float(raw) / 100.0
        return max(0.0, min(1.0, vol))
    except (TypeError, ValueError):
        return default


def _save_music_upload(file_storage, job_id: str):
    if not file_storage or not file_storage.filename:
        return None
    ext = Path(secure_filename(file_storage.filename)).suffix.lower()
    if ext not in AUDIO_EXTENSIONS:
        raise ValueError("Unsupported audio format. Use MP3, WAV, or M4A.")
    music_path = MUSIC_DIR / f"music_{job_id}{ext}"
    file_storage.save(str(music_path))
    return music_path


def _download_direct_video(url: str, out_path: Path):
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower() or ".mp4"
    out_path = out_path.with_suffix(ext)
    resp = requests.get(url, stream=True, timeout=90)
    resp.raise_for_status()
    content_type = resp.headers.get("content-type", "")
    if "video" not in content_type and ext not in {".mp4", ".mov", ".webm", ".mkv", ".m4v"}:
        raise ValueError("URL must point to a direct video file or a supported reel URL.")
    with open(out_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 256):
            if chunk:
                f.write(chunk)
    return out_path


def _download_remote_video(url: str, job_id: str):
    if yt_dlp is None:
        raise RuntimeError(
            "yt_dlp is not installed. Install yt-dlp or provide a direct video URL."
        )
    video_base = UPLOAD_DIR / f"instagram_{job_id}"
    ydl_opts = {
        "outtmpl": str(video_base.with_suffix(".%(ext)s")),
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": False,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filepath = None
            if info is None:
                raise RuntimeError("Unable to download media from the provided URL.")
            if info.get("requested_downloads"):
                filepath = Path(info["requested_downloads"][0].get("filepath", ""))
            if not filepath and info.get("filepath"):
                filepath = Path(info["filepath"])
            if not filepath:
                filepath = Path(ydl.prepare_filename(info))
            if not filepath.exists():
                raise RuntimeError("Downloaded file was not found on disk.")
            duration = info.get("duration")
            return filepath, duration
    except Exception as exc:
        raise RuntimeError(f"Download failed: {exc}")


def _extract_audio_from_video(video_path: Path, audio_path: Path):
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                str(audio_path),
            ],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"Audio extraction failed: {exc.stderr.decode('utf-8', errors='ignore')}"
        )


def _caption_style_from_form(form) -> CaptionStyle:
    return CaptionStyle(
        font_family=form.get("font_family", "impact"),
        font_size=int(form.get("font_size", 88)),
        text_color=form.get("text_color", "#FFFFFF"),
        highlight_color=form.get("highlight_color", "#FFCC00"),
        accent_color=form.get("accent_color", "#00FF66"),
        pill_color=form.get("pill_color", "#000000"),
        pill_opacity=int(form.get("pill_opacity", 140)),
        dynamic_highlights=form.get("dynamic_highlights", "true") == "true",
        caption_position=form.get("caption_position", "bottom"),
    )


def _generate_caption_and_tags(text: str):
    """Simple heuristic to create a punchy caption and a list of hashtags from the script text.
    This is intentionally local and lightweight — extracts keywords and crafts a short hook.
    """
    if not text:
        return {"caption": "", "tags": []}
    s = text.strip()
    # Pick the first sentence or first 70 chars as the hook
    first_sentence = re.split(r'[\.\n!\?]', s)[0][:120].strip()
    # Create a hook: if it already has a question or exclamation, keep; else add a leading hook
    hook = first_sentence
    if not re.search(r'[!?]$', hook):
        if len(hook.split()) < 6:
            hook = hook + ' — you need to see this.'
        else:
            hook = 'This blew my mind: ' + hook

    # Extract keywords: words >4 chars, not stopwords
    stop = set(['there','their','about','which','would','should','could','these','those','when','where','what','this','that','with','your','you','from','have','were','them','they'])
    words = re.findall(r"\b[\w']{4,}\b", s.lower())
    keywords = [w for w in words if w not in stop]
    uniq = []
    for w in keywords:
        if w not in uniq:
            uniq.append(w)
        if len(uniq) >= 8:
            break
    tags = [('#' + re.sub(r'[^a-z0-9]','', w)) for w in uniq[:8]]

    # Add a couple of trending-ish tags heuristically
    if 'how' in s.lower() or 'why' in s.lower():
        tags = tags[:4] + ['#lifehacks', '#viral']
    else:
        tags = tags[:4] + ['#shorts', '#trending']

    return {"caption": hook, "tags": tags}


def _apply_watermark(src_path: Path, watermark_text: str, position: str, opacity_pct: float) -> Path:
    """Apply watermark text to `src_path` and write a new file in OUTPUT_DIR with _wm suffix.
    Position: top-left, top-right, bottom-left, bottom-right, center
    """
    out_name = f"{src_path.stem}_wm{src_path.suffix}"
    out_path = OUTPUT_DIR / out_name
    # Opacity as fraction for moviepy
    opacity = max(0.0, min(1.0, opacity_pct / 100.0))
    try:
        # Load source video
        video = VideoFileClip(str(src_path))
        # Create text clip for watermark (no explicit font to use default system font)
        txt = TextClip(
            text=watermark_text,
            font_size=48,
            color='white',
            stroke_color='black',
            stroke_width=2,
        ).with_opacity(opacity).set_duration(video.duration)
        # Position mapping for moviepy (adds 16px margin)
        pos_map = {
            'top-left': lambda w, h: (16, 16),
            'top-right': lambda w, h: (w - txt.w - 16, 16),
            'bottom-left': lambda w, h: (16, h - txt.h - 16),
            'bottom-right': lambda w, h: (w - txt.w - 16, h - txt.h - 16),
            'center': lambda w, h: ((w - txt.w) // 2, (h - txt.h) // 2),
        }
        get_pos = pos_map.get(position, pos_map['bottom-right'])
        # Compute static position based on video dimensions
        pos = get_pos(int(video.w), int(video.h))
        txt = txt.with_position(pos)
        # Composite video with watermark
        result = CompositeVideoClip([video, txt])
        # Write output preserving audio (copy) - using ffmpeg through moviepy
        result.write_videofile(
            str(out_path),
            codec='libx264',
            audio_codec='aac',
            temp_audiofile='temp-audio.m4a',
            remove_temp=True,
            logger=None,
        )
        # Cleanup
        video.close()
        txt.close()
        result.close()
        return out_path
    except Exception as exc:
        raise RuntimeError(f"Watermarking failed: {exc}")


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/ai")
def ai_mode():
    return render_template("ai_mode.html")


@app.route("/manual")
def manual_mode():
    return render_template("manual_mode.html")


@app.route("/instagram")
def instagram_mode():
    return render_template("instagram_mode.html")


@app.route("/instagram-custom")
def instagram_custom_mode():
    return render_template("instagram_custom.html")


@app.route("/instagram-custom/edit")
def instagram_custom_edit():
    return render_template("instagram_custom_edit.html")



@app.route("/watermark-remove")
def watermark_remove():
    return render_template("watermark_remove.html")

@app.route("/api/watermark/remove/standalone", methods=["POST"])
def api_watermark_remove_standalone():
    video = request.files.get("video")
    if not video:
        return jsonify({"error": "No video uploaded"}), 400

    try:
        x = int(float(request.form.get("x", 0)))
        y = int(float(request.form.get("y", 0)))
        w = int(float(request.form.get("w", 0)))
        h = int(float(request.form.get("h", 0)))
    except ValueError:
        return jsonify({"error": "Invalid coordinates"}), 400

    job_id = str(uuid.uuid4())[:8]
    ext = Path(secure_filename(video.filename)).suffix or ".mp4"
    src_name = f"wm_remove_src_{job_id}{ext}"
    src_path = UPLOAD_DIR / src_name
    video.save(str(src_path))

    out_name = f"wm_remove_out_{job_id}.mp4"
    out_path = OUTPUT_DIR / out_name

    filter_str = f"delogo=x={x}:y={y}:w={w}:h={h}"

    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", str(src_path), "-vf", filter_str, "-c:a", "copy", str(out_path)
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError as exc:
        err_msg = exc.stderr.decode("utf-8", errors="ignore")
        return jsonify({"error": f"FFmpeg error: {err_msg}"}), 500

    return jsonify({"url": f"/output/{out_name}"})

@app.route('/watermark')
def watermark_mode():
    return render_template('watermark.html')


@app.route("/api/instagram/fetch", methods=["POST"])
def api_instagram_fetch():
    data = request.get_json(silent=True) or {}
    # Accept either a single 'url' or a newline-separated 'urls' list
    urls = []
    if data.get("urls"):
        urls = [u.strip() for u in data.get("urls") if u and u.strip()]
    else:
        raw = (data.get("url") or "").strip()
        if raw:
            urls = [u.strip() for u in raw.splitlines() if u.strip()]
    if not urls:
        return jsonify({"error": "Please enter at least one Instagram Reel link."}), 400

    results = []
    for u in urls:
        job_id = str(uuid.uuid4())[:10]
        try:
            path, duration = _download_remote_video(u, job_id)
            if duration is None:
                with VideoFileClip(str(path)) as clip:
                    duration = clip.duration or 0
            results.append({
                "filename": path.name,
                "duration": round(duration, 1),
                "preview_url": f"/uploads/{path.name}",
            })
        except Exception as e:
            results.append({"error": str(e), "url": u})

    return jsonify({"results": results})


@app.route("/api/instagram/transcribe", methods=["POST"])
def api_instagram_transcribe():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Please enter the Reel link for voice extraction."}), 400

    job_id = str(uuid.uuid4())[:10]
    try:
        video_path, duration = _download_remote_video(url, job_id)
        audio_path = TEMP_DIR / f"instagram_voice_{job_id}.mp3"
        _extract_audio_from_video(video_path, audio_path)
        segments = transcribe_audio(audio_path)
        text = " ".join(seg.text.strip() for seg in segments if getattr(seg, "text", None))
        # also include audio duration for client-side comparison
        try:
            from moviepy.editor import AudioFileClip
            audio_dur = AudioFileClip(str(audio_path)).duration
        except Exception:
            audio_dur = None
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "filename": video_path.name,
        "duration": round(duration or 0, 1),
        "audio_duration": round(audio_dur or 0, 1),
        "transcript": text or "No spoken audio was detected.",
    })


@app.route('/api/analyze-text', methods=['POST'])
def api_analyze_text():
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'Missing text to analyze.'}), 400
    out = _generate_caption_and_tags(text)
    return jsonify(out)


@app.route("/api/instagram/assemble", methods=["POST"])
def api_instagram_assemble():
    background_file = (request.form.get("background_file") or "").strip()
    text = (request.form.get("text") or "").strip()
    voice = request.form.get("voice", "en-US-GuyNeural")

    if not background_file:
        return jsonify({"error": "Missing Instagram background video."}), 400
    if not text:
        return jsonify({"error": "Please provide the edited transcript text."}), 400

    background_path = UPLOAD_DIR / secure_filename(background_file)
    if not background_path.exists():
        return jsonify({"error": "Background video not found. Fetch it again."}), 400

    style = _caption_style_from_form(request.form)
    add_music = request.form.get("add_music") == "true"
    music_volume = _parse_music_volume(request.form.get("music_volume", 15))
    watermark_text = (request.form.get('watermark_text') or '').strip()
    watermark_position = request.form.get('watermark_position', 'bottom-right')
    try:
        watermark_opacity = float(request.form.get('watermark_opacity', 50))
    except Exception:
        watermark_opacity = 50.0
    job_id = str(uuid.uuid4())[:8]

    try:
        music_path = _save_music_upload(request.files.get("music"), job_id) if add_music else None
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    jobs[job_id] = {
        "status": "queued",
        "message": "Assembling Instagram Short...",
        "percent": 0,
        "mode": "instagram",
        "created": datetime.now().isoformat(),
    }

    def task():
        def progress_cb(pct, msg=None):
            jobs[job_id]["percent"] = int(pct)
            if msg:
                jobs[job_id]["message"] = msg

        # mark rendering started
        jobs[job_id]["percent"] = 5
        out_path = _run_async(
            run_manual_pipeline(
                background_path,
                text,
                OUTPUT_DIR,
                TEMP_DIR,
                style,
                music_path=music_path,
                music_volume=music_volume if music_path else 0,
                voice=voice,
                progress_callback=progress_cb,
            )
        )
        # Optionally apply watermark post-process
        final_path = out_path
        if watermark_text:
            final_path = _apply_watermark(final_path, watermark_text, watermark_position, watermark_opacity)
        jobs[job_id]["percent"] = 100
        return {"video_url": f"/output/{final_path.name}"}

    _start_job(job_id, task)
    return jsonify({"job_id": job_id})


@app.route("/api/ai/voices")
def api_ai_voices():
    return jsonify({
        "voices": [{"id": v, "label": l} for v, l in TTS_VOICE_CHOICES],
    })


@app.route("/api/ai/search-clips", methods=["POST"])
def api_ai_search_clips():
    """Step 1: Search & download relevant gameplay clips for the prompt."""
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Please enter a topic prompt."}), 400

    session_id = str(uuid.uuid4())[:10]
    session_dir = SESSIONS_DIR / session_id

    try:
        clips = search_clips_for_prompt(prompt, session_dir, count=8)
    except Exception as e:
        return jsonify({"error": f"Clip search failed: {e}"}), 500

    if not clips:
        return jsonify({"error": "No clips found. Check your internet connection."}), 500

    ai_sessions[session_id] = {
        "prompt": prompt,
        "session_dir": str(session_dir),
        "clips": clips,
        "created": datetime.now().isoformat(),
    }

    for clip in clips:
        clip["preview_url"] = f"/ai-session/{session_id}/{clip['preview']}" if clip.get("preview") else None
        clip["video_url"] = f"/ai-session/{session_id}/{clip['filename']}"

    return jsonify({
        "session_id": session_id,
        "prompt": prompt,
        "clips": clips,
    })


@app.route("/api/ai/generate-script", methods=["POST"])
def api_ai_generate_script():
    """Step 3: Generate script from prompt (user can edit before assemble)."""
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id", "").strip()
    prompt = (data.get("prompt") or "").strip()

    session = ai_sessions.get(session_id)
    if session:
        prompt = prompt or session.get("prompt", "")

    if not prompt:
        return jsonify({"error": "Missing prompt."}), 400

    try:
        script = generate_script(prompt)
    except Exception as e:
        return jsonify({"error": f"Script generation failed: {e}"}), 500

    if session:
        session["script"] = script

    return jsonify({"script": script})


@app.route("/api/ai/assemble", methods=["POST"])
def api_ai_assemble():
    """Final step: assemble video with user-selected clips, script, voice & style."""
    session_id = (request.form.get("session_id") or "").strip()
    script = (request.form.get("script") or "").strip()
    selected_raw = request.form.get("selected_clips", "[]")
    voice = request.form.get("voice", "en-US-GuyNeural")

    import json
    try:
        selected_ids = json.loads(selected_raw)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid clip selection."}), 400

    if not session_id or session_id not in ai_sessions:
        return jsonify({"error": "Session expired. Please start over."}), 400
    if not script:
        return jsonify({"error": "Script cannot be empty."}), 400
    if not selected_ids:
        return jsonify({"error": "Select at least one gameplay clip."}), 400

    session = ai_sessions[session_id]
    session_dir = Path(session["session_dir"])
    clip_map = {c["id"]: c for c in session.get("clips", [])}

    media_paths = []
    for cid in selected_ids:
        info = clip_map.get(str(cid))
        if info:
            path = session_dir / info["filename"]
            if path.exists():
                media_paths.append(path)

    if not media_paths:
        return jsonify({"error": "Selected clips not found on disk."}), 400

    style = _caption_style_from_form(request.form)
    add_music = request.form.get("add_music") == "true"
    music_volume = _parse_music_volume(request.form.get("music_volume", 15))
    watermark_text = (request.form.get('watermark_text') or '').strip()
    watermark_position = request.form.get('watermark_position', 'bottom-right')
    try:
        watermark_opacity = float(request.form.get('watermark_opacity', 50))
    except Exception:
        watermark_opacity = 50.0

    job_id = str(uuid.uuid4())[:8]
    try:
        music_path = _save_music_upload(request.files.get("music"), job_id) if add_music else None
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    jobs[job_id] = {
        "status": "queued",
        "message": "Assembling your Short...",
        "mode": "ai",
        "created": datetime.now().isoformat(),
    }

    out_name = f"shorts_ai_{job_id}.mp4"

    def task():
        out_path = _run_async(
            run_ai_assemble(
                script,
                media_paths,
                OUTPUT_DIR,
                TEMP_DIR,
                caption_style=style,
                voice=voice,
                music_path=music_path,
                music_volume=music_volume if music_path else 0,
                out_name=out_name,
            )
        )
        final = out_path
        if watermark_text:
            final = _apply_watermark(final, watermark_text, watermark_position, watermark_opacity)
        return {
            "video_url": f"/output/{final.name}",
            "script": script,
        }

    _start_job(job_id, task)
    return jsonify({"job_id": job_id})


@app.route("/api/manual/generate", methods=["POST"])
def api_manual_generate():
    text = (request.form.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Please enter your script text."}), 400

    video = request.files.get("video")
    if not video or not video.filename:
        return jsonify({"error": "Please upload a background video."}), 400

    ext = Path(secure_filename(video.filename)).suffix.lower()
    if ext not in {".mp4", ".mov", ".webm", ".mkv", ".m4v"}:
        return jsonify({"error": "Unsupported video format. Use MP4, MOV, or WEBM."}), 400

    style = _caption_style_from_form(request.form)
    add_music = request.form.get("add_music") == "true"
    music_volume = _parse_music_volume(request.form.get("music_volume", 15))
    watermark_text = (request.form.get('watermark_text') or '').strip()
    watermark_position = request.form.get('watermark_position', 'bottom-right')
    try:
        watermark_opacity = float(request.form.get('watermark_opacity', 50))
    except Exception:
        watermark_opacity = 50.0

    job_id = str(uuid.uuid4())[:8]
    saved_name = f"manual_{job_id}{ext}"
    video_path = UPLOAD_DIR / saved_name
    video.save(str(video_path))

    try:
        music_path = _save_music_upload(request.files.get("music"), job_id) if add_music else None
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    jobs[job_id] = {
        "status": "queued",
        "message": "Starting manual pipeline...",
        "mode": "manual",
        "created": datetime.now().isoformat(),
    }

    def task():
        out_path = _run_async(
            run_manual_pipeline(
                video_path, text, OUTPUT_DIR, TEMP_DIR, style,
                music_path=music_path,
                music_volume=music_volume if music_path else 0,
            )
        )
        final = out_path
        if watermark_text:
            final = _apply_watermark(final, watermark_text, watermark_position, watermark_opacity)
            return {"video_url": f"/output/{final.name}"}
        return {"video_url": f"/output/{out_path.name}"}

    _start_job(job_id, task)
    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>")
def api_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404
    payload = {
        "status": job["status"],
        "message": job["message"],
        "mode": job.get("mode"),
        "percent": int(job.get("percent", 0)),
    }
    if job["status"] == "done":
        payload["result"] = job.get("result", {})
    if job["status"] == "error" and app.debug:
        payload["trace"] = job.get("trace")
    return jsonify(payload)


@app.route("/ai-session/<session_id>/<path:filename>")
def serve_session_file(session_id, filename):
    session_dir = SESSIONS_DIR / session_id
    if not session_dir.exists():
        return "Session not found", 404
    return send_from_directory(session_dir, filename)


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/output/<path:filename>")
def serve_output(filename):
    return send_from_directory(OUTPUT_DIR, filename)


@app.route("/api/instagram/trim", methods=["POST"])
def api_instagram_trim():
    data = request.get_json(silent=True) or {}
    filename = (data.get("filename") or "").strip()
    try:
        start = float(data.get("start", 0))
        end = float(data.get("end", 0))
    except Exception:
        return jsonify({"error": "Invalid start/end values."}), 400
    if not filename:
        return jsonify({"error": "Missing filename to trim."}), 400
    src = UPLOAD_DIR / secure_filename(filename)
    if not src.exists():
        return jsonify({"error": "Source file not found."}), 404
    out_name = f"{src.stem}_trim_{int(start)}_{int(end)}{src.suffix}"
    out_path = UPLOAD_DIR / out_name
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", str(src), "-ss", str(start), "-to", str(end), "-c", "copy", str(out_path)
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError as exc:
        return jsonify({"error": f"Trim failed: {exc.stderr.decode('utf-8', errors='ignore')}"}), 500
    return jsonify({"filename": out_name, "preview_url": f"/uploads/{out_name}"})


@app.route("/api/clear-storage", methods=["POST"])
def api_clear_storage():
    """Delete files under upload/temp/output/sessions/music/gameplay directories.
    This is meant for local development use only and will permanently remove files.
    """
    targets = [UPLOAD_DIR, TEMP_DIR, OUTPUT_DIR, SESSIONS_DIR, MUSIC_DIR, GAMEPLAY_DIR]
    results = {}
    for d in targets:
        removed = 0
        if not d.exists():
            results[str(d.name)] = "missing"
            continue
        for child in list(d.iterdir()):
            try:
                if child.is_dir():
                    shutil.rmtree(child)
                    removed += 1
                else:
                    child.unlink()
                    removed += 1
            except Exception as e:
                results.setdefault(str(d.name), []).append(f"err:{child.name}:{e}")
        if str(d.name) not in results:
            results[str(d.name)] = f"removed:{removed}"
    return jsonify({"ok": True, "message": "Storage cleared.", "details": results})


@app.route('/api/watermark', methods=['POST'])
def api_watermark():
    """Apply a simple text watermark using ffmpeg and run as a background job."""
    watermark_text = (request.form.get('watermark_text') or '').strip()
    try:
        opacity_pct = int(request.form.get('opacity', 50))
    except Exception:
        opacity_pct = 50
    video = request.files.get('video')
    if not video or not video.filename:
        return jsonify({'error': 'Please upload a video file.'}), 400
    job_id = str(uuid.uuid4())[:8]
    ext = Path(secure_filename(video.filename)).suffix or '.mp4'
    src_name = f'watermark_src_{job_id}{ext}'
    src_path = UPLOAD_DIR / src_name
    video.save(str(src_path))

    out_name = f'shorts_watermark_{job_id}.mp4'
    out_path = OUTPUT_DIR / out_name

    jobs[job_id] = {
        'status': 'queued',
        'message': 'Preparing watermark job...',
        'percent': 0,
        'mode': 'watermark',
        'created': datetime.now().isoformat(),
    }

    def task():
        try:
            jobs[job_id]['status'] = 'running'
            jobs[job_id]['percent'] = 5
            jobs[job_id]['message'] = 'Applying watermark...'
            # Use MoviePy based watermark implementation
            final_path = _apply_watermark(src_path, watermark_text, 'bottom-right', opacity_pct)
            jobs[job_id]['percent'] = 100
            jobs[job_id]['message'] = 'Watermark complete.'
            return {'video_url': f'/output/{final_path.name}'}
        except Exception as exc:
            jobs[job_id].update({'status': 'error', 'message': str(exc)})
            raise

    _start_job(job_id, task)
    return jsonify({'job_id': job_id})



# ============================ STUDIO ENDPOINTS ============================
STUDIO_UPLOAD_DIR = PROJECT_DIR / "studio_uploads"
STUDIO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
STUDIO_SESSIONS_DIR = SESSIONS_DIR / "studio"
STUDIO_SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


@app.route("/api/studio/media/extended", methods=["GET"])
def api_studio_media_extended():
    media = []
    # Fetch from UPLOAD_DIR
    if UPLOAD_DIR.exists():
        for p in UPLOAD_DIR.iterdir():
            if p.is_file() and p.suffix.lower() in [".mp4", ".jpg", ".jpeg", ".png", ".webp", ".webm"]:
                media.append({
                    "name": p.name,
                    "url": f"/uploads/{p.name}",
                    "path": str(p),
                    "type": "video" if p.suffix.lower() in [".mp4", ".webm"] else "image"
                })
    # Fetch from GAMEPLAY_DIR
    if GAMEPLAY_DIR.exists():
        for p in GAMEPLAY_DIR.iterdir():
            if p.is_file() and p.suffix.lower() in [".mp4", ".webm"]:
                media.append({
                    "name": p.name,
                    "url": f"/gameplay/{p.name}",
                    "path": str(p),
                    "type": "video"
                })
    return jsonify({"media": media})

@app.route("/gameplay/<path:filename>")
def serve_gameplay(filename):
    return send_from_directory(GAMEPLAY_DIR, filename)


@app.route("/studio_uploads/<path:filename>")
def serve_studio_upload(filename):
    return send_from_directory(STUDIO_UPLOAD_DIR, filename)

@app.route("/studio")
def studio_editor():
    return render_template("studio.html")

@app.route("/api/studio/projects", methods=["GET"])
def api_studio_projects_list():
    import json
    projects = []
    if STUDIO_SESSIONS_DIR.exists():
        for d in STUDIO_SESSIONS_DIR.iterdir():
            if d.is_dir():
                proj_file = d / "project.json"
                if proj_file.exists():
                    try:
                        with open(proj_file, "r", encoding="utf-8") as f:
                            pdata = json.load(f)
                            projects.append({
                                "id": pdata.get("id"),
                                "name": pdata.get("name", "Untitled Project"),
                                "updated": d.stat().st_mtime
                            })
                    except Exception:
                        pass
    projects.sort(key=lambda x: x["updated"], reverse=True)
    return jsonify({"projects": projects})

@app.route("/api/studio/project/create", methods=["POST"])
def api_studio_project_create():
    import json
    project_id = f"studio_{uuid.uuid4().hex[:8]}"
    project_dir = STUDIO_SESSIONS_DIR / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    
    project_data = {
        "id": project_id,
        "name": "Untitled Studio Project",
        "width": 1080,
        "height": 1920,
        "fps": 30,
        "duration": 0,
        "assets": [],
        "tracks": [
            { "id": "video_main", "type": "video", "clips": [] },
            { "id": "video_overlay", "type": "overlay", "clips": [] },
            { "id": "image_overlay", "type": "image", "clips": [] },
            { "id": "text", "type": "text", "clips": [] },
            { "id": "captions", "type": "captions", "clips": [] },
            { "id": "voice", "type": "audio", "clips": [] },
            { "id": "music", "type": "audio", "clips": [] }
        ]
    }
    
    with open(project_dir / "project.json", "w", encoding="utf-8") as f:
        json.dump(project_data, f, indent=2)
        
    return jsonify(project_data)

@app.route("/api/studio/project/<project_id>", methods=["GET"])
def api_studio_project_load(project_id):
    import json
    project_file = STUDIO_SESSIONS_DIR / project_id / "project.json"
    if not project_file.exists():
        return jsonify({"error": "Project not found"}), 404
        
    with open(project_file, "r", encoding="utf-8") as f:
        project_data = json.load(f)
        
    return jsonify(project_data)

@app.route("/api/studio/project/<project_id>/save", methods=["POST"])
def api_studio_project_save(project_id):
    import json
    project_file = STUDIO_SESSIONS_DIR / project_id / "project.json"
    if not project_file.parent.exists():
        return jsonify({"error": "Project does not exist"}), 404
        
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"error": "No project data received"}), 400
        
    with open(project_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        
    return jsonify({"success": True})

@app.route("/api/studio/media/upload", methods=["POST"])
def api_studio_media_upload():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No file uploaded"}), 400
        
    filename = secure_filename(file.filename)
    filename_unique = f"{uuid.uuid4().hex[:6]}_{filename}"
    dest = STUDIO_UPLOAD_DIR / filename_unique
    file.save(str(dest))
    
    asset_type = "image"
    duration = 0.0
    width = 0
    height = 0
    
    ext = Path(filename).suffix.lower()
    
    if ext in {".mp4", ".mov", ".webm", ".mkv", ".m4v"}:
        asset_type = "video"
        try:
            with VideoFileClip(str(dest)) as clip:
                duration = float(clip.duration or 0.0)
                width = int(clip.w)
                height = int(clip.h)
        except Exception as e:
            print(f"[WARN] MoviePy fail to read uploaded video info: {e}")
    elif ext in AUDIO_EXTENSIONS:
        asset_type = "audio"
        try:
            with AudioFileClip(str(dest)) as clip:
                duration = float(clip.duration or 0.0)
        except Exception as e:
            print(f"[WARN] MoviePy fail to read uploaded audio info: {e}")
    else:
        asset_type = "image"
        try:
            with Image.open(str(dest)) as img:
                width, height = img.size
        except Exception as e:
            print(f"[WARN] PIL fail to read uploaded image info: {e}")
            
    preview_url = f"/studio_uploads/{filename_unique}"
    if asset_type == "video":
        thumb_name = f"{dest.stem}_thumb.jpg"
        thumb_path = STUDIO_UPLOAD_DIR / thumb_name
        try:
            from make_shorts import _extract_thumbnail
            if _extract_thumbnail(dest, thumb_path):
                preview_url = f"/studio_uploads/{thumb_name}"
        except Exception as e:
            print(f"[WARN] Thumbnail generation failed: {e}")
            
    asset_info = {
        "id": f"asset_{uuid.uuid4().hex[:8]}",
        "type": asset_type,
        "name": filename,
        "url": f"/studio_uploads/{filename_unique}",
        "preview_url": preview_url,
        "path": str(dest),
        "duration": round(duration, 2),
        "width": width,
        "height": height
    }
    return jsonify(asset_info)


def detect_media_platform(url: str) -> dict:
    url = url.strip()
    if 'instagram.com/reel/' in url or 'instagram.com/p/' in url:
        return {"platform": "instagram", "kind": "reel", "normalized_url": url, "is_supported": True}
    elif 'youtube.com/watch' in url or 'youtu.be/' in url or 'youtube.com/shorts/' in url:
        return {"platform": "youtube", "kind": "video", "normalized_url": url, "is_supported": True}
    return {"platform": "unsupported", "kind": None, "normalized_url": url, "is_supported": False, "error": "Unsupported URL. Please paste an Instagram Reel or YouTube link."}

def _download_youtube_clip(url: str, job_id: str, start: str, end: str):
    video_base = UPLOAD_DIR / f"youtube_clip_{job_id}"
    out_path = video_base.with_suffix(".mp4")

    # Simple fallback: download full video then trim with ffmpeg
    try:
        full_path, _ = _download_remote_video(url, job_id)

        # Trim it
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(start), "-to", str(end),
            "-i", str(full_path), "-c:v", "libx264", "-c:a", "aac",
            str(out_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Remove original
        if full_path.exists():
            full_path.unlink()

        with VideoFileClip(str(out_path)) as clip:
            duration = float(clip.duration or 0.0)

        return out_path, duration
    except Exception as exc:
        if out_path.exists():
            out_path.unlink()
        raise RuntimeError(f"Clip download failed: {exc}")

@app.route("/api/media/detect-link", methods=["POST"])
def api_media_detect_link():
    data = request.get_json(silent=True) or {}
    url = data.get("url", "")
    return jsonify(detect_media_platform(url))

@app.route("/api/media/fetch", methods=["POST"])
def api_media_fetch():
    data = request.get_json(silent=True) or {}
    url = data.get("url", "").strip()
    platform_info = detect_media_platform(url)

    if not platform_info["is_supported"]:
        return jsonify({"error": platform_info["error"]}), 400

    job_id = str(uuid.uuid4())[:10]
    try:
        path, duration = _download_remote_video(url, job_id)
        prefix = "youtube" if platform_info["platform"] == "youtube" else "reel"
        filename = f"{prefix}_{job_id}_{path.name}"
        dest = STUDIO_UPLOAD_DIR / filename
        shutil.move(str(path), str(dest))

        width = 1080
        height = 1920
        try:
            with VideoFileClip(str(dest)) as clip:
                duration = float(clip.duration or duration or 0.0)
                width = int(clip.w)
                height = int(clip.h)
        except Exception as e:
            print(f"[WARN] MoviePy error on fetch load: {e}")

        thumb_name = f"{dest.stem}_thumb.jpg"
        thumb_path = STUDIO_UPLOAD_DIR / thumb_name
        preview_url = f"/studio_uploads/{filename}"
        try:
            from make_shorts import _extract_thumbnail
            if _extract_thumbnail(dest, thumb_path):
                preview_url = f"/studio_uploads/{thumb_name}"
        except Exception as e:
            pass

        asset_info = {
            "id": f"asset_{uuid.uuid4().hex[:8]}",
            "type": "video",
            "name": f"{platform_info['platform'].title()} Video ({job_id})",
            "url": f"/studio_uploads/{filename}",
            "preview_url": preview_url,
            "path": str(dest),
            "duration": round(duration or 0.0, 2),
            "width": width,
            "height": height,
            "platform": platform_info["platform"]
        }
        return jsonify(asset_info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/media/clip", methods=["POST"])
def api_media_clip():
    data = request.get_json(silent=True) or {}
    url = data.get("url", "").strip()
    start = data.get("start", "0")
    end = data.get("end", "0")

    platform_info = detect_media_platform(url)
    if not platform_info["is_supported"]:
        return jsonify({"error": platform_info["error"]}), 400

    job_id = str(uuid.uuid4())[:10]
    try:
        path, duration = _download_youtube_clip(url, job_id, start, end)
        filename = f"youtube_clip_{job_id}_{path.name}"
        dest = STUDIO_UPLOAD_DIR / filename
        shutil.move(str(path), str(dest))

        width = 1080
        height = 1920
        try:
            with VideoFileClip(str(dest)) as clip:
                duration = float(clip.duration or duration or 0.0)
                width = int(clip.w)
                height = int(clip.h)
        except Exception as e:
            print(f"[WARN] MoviePy error on clip load: {e}")

        thumb_name = f"{dest.stem}_thumb.jpg"
        thumb_path = STUDIO_UPLOAD_DIR / thumb_name
        preview_url = f"/studio_uploads/{filename}"
        try:
            from make_shorts import _extract_thumbnail
            if _extract_thumbnail(dest, thumb_path):
                preview_url = f"/studio_uploads/{thumb_name}"
        except Exception as e:
            pass

        asset_info = {
            "id": f"asset_{uuid.uuid4().hex[:8]}",
            "type": "video",
            "name": f"YouTube Clip ({start}-{end})",
            "url": f"/studio_uploads/{filename}",
            "preview_url": preview_url,
            "path": str(dest),
            "duration": round(duration or 0.0, 2),
            "width": width,
            "height": height,
            "platform": platform_info["platform"]
        }
        return jsonify(asset_info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/media/audio-extract", methods=["POST"])
def api_media_audio_extract():
    data = request.get_json(silent=True) or {}
    url = data.get("url", "").strip()
    mode = data.get("mode", "full")
    start = data.get("start", "0")
    end = data.get("end", "0")

    platform_info = detect_media_platform(url)
    if not platform_info["is_supported"]:
        return jsonify({"error": platform_info["error"]}), 400

    job_id = str(uuid.uuid4())[:10]
    try:
        if mode == "clip" and platform_info["platform"] == "youtube":
            video_path, _ = _download_youtube_clip(url, job_id, start, end)
        else:
            video_path, _ = _download_remote_video(url, job_id)

        audio_name = f"extracted_{job_id}.mp3"
        dest = STUDIO_UPLOAD_DIR / audio_name

        _extract_audio_from_video(video_path, dest)

        if video_path.exists():
            video_path.unlink()

        duration = 0.0
        try:
            with AudioFileClip(str(dest)) as clip:
                duration = float(clip.duration or 0.0)
        except Exception:
            pass

        asset_info = {
            "id": f"asset_{uuid.uuid4().hex[:8]}",
            "type": "audio",
            "name": f"{platform_info['platform'].title()} Audio ({job_id})",
            "url": f"/studio_uploads/{audio_name}",
            "preview_url": f"/studio_uploads/{audio_name}",
            "path": str(dest),
            "duration": round(duration, 2),
            "platform": platform_info["platform"]
        }
        return jsonify(asset_info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/studio/media/reel-video", methods=["POST"])
def api_studio_media_reel_video():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Please enter an Instagram Reel link"}), 400
        
    job_id = str(uuid.uuid4())[:10]
    try:
        path, duration = _download_remote_video(url, job_id)
        filename = f"reel_{job_id}_{path.name}"
        dest = STUDIO_UPLOAD_DIR / filename
        shutil.move(str(path), str(dest))
        
        width = 1080
        height = 1920
        try:
            with VideoFileClip(str(dest)) as clip:
                duration = float(clip.duration or duration or 0.0)
                width = int(clip.w)
                height = int(clip.h)
        except Exception as e:
            print(f"[WARN] MoviePy error on reel load: {e}")
            
        thumb_name = f"{dest.stem}_thumb.jpg"
        thumb_path = STUDIO_UPLOAD_DIR / thumb_name
        preview_url = f"/studio_uploads/{filename}"
        try:
            from make_shorts import _extract_thumbnail
            if _extract_thumbnail(dest, thumb_path):
                preview_url = f"/studio_uploads/{thumb_name}"
        except Exception as e:
            print(f"[WARN] Thumbnail extraction failed: {e}")
            
        asset_info = {
            "id": f"asset_{uuid.uuid4().hex[:8]}",
            "type": "video",
            "name": f"Instagram Reel ({job_id})",
            "url": f"/studio_uploads/{filename}",
            "preview_url": preview_url,
            "path": str(dest),
            "duration": round(duration or 0.0, 2),
            "width": width,
            "height": height
        }
        return jsonify(asset_info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/studio/audio/reel-extract", methods=["POST"])
def api_studio_audio_reel_extract():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Please enter an Instagram Reel link"}), 400
        
    job_id = str(uuid.uuid4())[:10]
    try:
        video_path, duration = _download_remote_video(url, job_id)
        audio_name = f"extracted_{job_id}.mp3"
        dest = STUDIO_UPLOAD_DIR / audio_name
        
        _extract_audio_from_video(video_path, dest)
        
        if video_path.exists():
            video_path.unlink()
            
        duration = 0.0
        try:
            with AudioFileClip(str(dest)) as clip:
                duration = float(clip.duration or 0.0)
        except Exception as e:
            print(f"[WARN] Failed to get audio duration: {e}")
            
        asset_info = {
            "id": f"asset_{uuid.uuid4().hex[:8]}",
            "type": "audio",
            "name": f"Reel Audio ({job_id})",
            "url": f"/studio_uploads/{audio_name}",
            "preview_url": f"/studio_uploads/{audio_name}",
            "path": str(dest),
            "duration": round(duration, 2)
        }
        return jsonify(asset_info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/studio/audio/tts", methods=["POST"])
def api_studio_audio_tts():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    voice = (data.get("voice") or "en-US-GuyNeural").strip()
    if not text:
        return jsonify({"error": "Please enter text to convert to speech"}), 400
        
    job_id = str(uuid.uuid4())[:10]
    audio_name = f"tts_{job_id}.mp3"
    dest = STUDIO_UPLOAD_DIR / audio_name
    
    try:
        _run_async(generate_audio(text, dest, voice=voice))
        
        duration = 0.0
        try:
            with AudioFileClip(str(dest)) as clip:
                duration = float(clip.duration or 0.0)
        except Exception as e:
            print(f"[WARN] Failed to get TTS duration: {e}")
            
        asset_info = {
            "id": f"asset_{uuid.uuid4().hex[:8]}",
            "type": "audio",
            "name": f"TTS: {text[:20]}...",
            "url": f"/studio_uploads/{audio_name}",
            "path": str(dest),
            "duration": round(duration, 2)
        }
        return jsonify(asset_info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/studio/captions/generate", methods=["POST"])
def api_studio_captions_generate():
    data = request.get_json(silent=True) or {}
    asset_url = data.get("assetUrl")
    
    path = None
    if asset_url:
        filename = Path(asset_url).name
        p1 = STUDIO_UPLOAD_DIR / filename
        p2 = UPLOAD_DIR / filename
        path = p1 if p1.exists() else p2
        
    if not path or not path.exists():
        return jsonify({"error": "Media file not found for caption generation"}), 404
        
    is_video = path.suffix.lower() in {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
    transcribe_path = path
    temp_audio = None
    
    try:
        if is_video:
            temp_audio = TEMP_DIR / f"temp_transcribe_{uuid.uuid4().hex[:8]}.mp3"
            _extract_audio_from_video(path, temp_audio)
            transcribe_path = temp_audio
            
        segments = transcribe_audio(transcribe_path)
        chunks = make_caption_chunks(segments)
        
        if temp_audio and temp_audio.exists():
            temp_audio.unlink()
            
        return jsonify({"chunks": chunks})
    except Exception as e:
        if temp_audio and temp_audio.exists():
            temp_audio.unlink()
        return jsonify({"error": f"Caption generation failed: {str(e)}"}), 500

@app.route("/api/studio/render", methods=["POST"])
def api_studio_render():
    project_data = request.get_json(silent=True) or {}
    project_id = project_data.get("id")
    if not project_id:
        return jsonify({"error": "Missing project ID"}), 400
        
    job_id = str(uuid.uuid4())[:8]
    out_name = f"render_{project_id}_{job_id}.mp4"
    out_path = OUTPUT_DIR / out_name
    
    jobs[job_id] = {
        "status": "queued",
        "message": "Initializing render...",
        "percent": 0,
        "mode": "studio",
        "created": datetime.now().isoformat(),
    }
    
    def task():
        def progress_cb(pct, msg=None):
            jobs[job_id]["percent"] = int(pct)
            if msg:
                jobs[job_id]["message"] = msg
                
        render_studio_project(project_data, out_path, progress_callback=progress_cb)
        return {"video_url": f"/output/{out_name}"}
        
    _start_job(job_id, task)
    return jsonify({"job_id": job_id})


if __name__ == "__main__":
    import socket
    def is_port_in_use(port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(('127.0.0.1', port)) == 0

    port = 5000
    if is_port_in_use(port):
        port = 5001
        if is_port_in_use(port):
            port = 5002
            
    print(f"\n  Starting Reel Engine UI on http://127.0.0.1:{port}\n")
    try:
        app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
    except Exception as e:
        print(f"Failed to start server: {e}")

