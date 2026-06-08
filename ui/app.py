#!/usr/bin/env python3
"""Web UI for Make Shorts — AI Mode (wizard) & Manual Mode."""

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
from moviepy import VideoFileClip
from werkzeug.utils import secure_filename
import requests
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
)

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
    )


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


@app.route("/api/instagram/fetch", methods=["POST"])
def api_instagram_fetch():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Please enter the Instagram Reel link."}), 400

    job_id = str(uuid.uuid4())[:10]
    try:
        path, duration = _download_remote_video(url, job_id)
        if duration is None:
            with VideoFileClip(str(path)) as clip:
                duration = clip.duration or 0
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "filename": path.name,
        "duration": round(duration, 1),
        "preview_url": f"/uploads/{path.name}",
    })


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
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "filename": video_path.name,
        "duration": round(duration or 0, 1),
        "transcript": text or "No spoken audio was detected.",
    })


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
    job_id = str(uuid.uuid4())[:8]

    try:
        music_path = _save_music_upload(request.files.get("music"), job_id) if add_music else None
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    jobs[job_id] = {
        "status": "queued",
        "message": "Assembling Instagram Short...",
        "mode": "instagram",
        "created": datetime.now().isoformat(),
    }

    def task():
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
            )
        )
        return {"video_url": f"/output/{out_path.name}"}

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
        return {
            "video_url": f"/output/{out_path.name}",
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


if __name__ == "__main__":
    port = 5000
    try:
        app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
    except OSError:
        port = 5001
        print(f"\n  Port {port-1} in use, trying {port}...\n")
        print("  Make Shorts UI")
        print(f"  Open http://127.0.0.1:{port} in your browser\n")
        app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
