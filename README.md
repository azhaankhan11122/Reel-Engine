
<p align="center">
  <img src="https://media.giphy.com/media/3o7aD6vQpQ7q2jVQqY/giphy.gif" alt="sparkle" width="220" />
</p>

<h1 align="center">✨ Make Shorts — Ship Viral Videos Locally</h1>
<h3 align="center">Gen-Z ready editor for Shorts, Reels & TikTok — fast, free, and on your machine.</h3>

<p align="center">
  <strong>AI Mode</strong> · <strong>Manual Mode</strong> · <strong>Instagram Mode</strong> · <strong>Watermark</strong> · <strong>Viral Captioning</strong>
</p>

---

## ⚡ Quick Pitch

Make Shorts turns simple ideas into ready-to-post vertical videos. Paste a prompt or a Reel link, tweak captions, add music, and export — all offline. Think of it as your local micro-studio that helps you go viral without cloud costs.

The app exports a **1080×1920 MP4** with automatic captions, voiceover, and optional music.

---

## 🖥 Launch the UI

Install dependencies and run the UI (local development):

```bash
cd /Users/azhaankhan/Downloads/make_shorts
pip install -r requirements.txt
# Start the web UI (defaults to port 5000; falls back to 5001 if occupied)
python ui/app.py
```

Open the URL printed by the server, typically `http://127.0.0.1:5000` (or `:5001` if 5000 is in use).

---

## 🧩 Supported Modes

### 🤖 AI Mode
- Paste a topic prompt.
- AI writes a hook-first script.
- The app downloads free gameplay clips.
- Voiceover is generated with Edge-TTS.
- Captions are synced using Whisper.
- Rendered video is ready to download.

### ✋ Manual Mode
- Upload your own background video.
- Enter custom voiceover/script text.
- Pick caption font, colors, and highlight style.
- Optionally upload background music.
- The app generates captions and renders the final video.

### 🎥 Instagram Mode
- Paste an Instagram Reel link for the background source.
- A preview of the downloaded reel appears in Step 1 for confirmation.
- Paste a second reel link for the voiceover source.
- The app downloads, extracts audio, and transcribes the voice.
- Edit the extracted transcript before rendering.
- Generate captions, voiceover, and final video from the confirmed reel.

### ✍️ Instagram + Custom Captions
- Paste a Reel link and fetch the background video.
- Add your own script in the editor to create a custom voiceover and matching captions.
- Good for dubbing reels or replacing the original audio with a scripted narration.

### 💧 Watermark Mode
- Upload a video and add a text watermark with adjustable opacity.
- The app uses `ffmpeg` to render a bottom-right watermark with a semi-transparent box for contrast.
- Useful for quickly branding videos before posting.

New (June 2026): Instagram Mode enhancements
- Paste multiple Reel URLs (one per line) in Step 1 — the app downloads each and shows a selectable preview list.
- Choose which reel to use as the background; confirm to proceed.
- The transcribe step now returns both `duration` (video) and `audio_duration` (extracted audio) so you can compare audio vs video length.
- If audio/video lengths differ, the UI will suggest options:
  - Auto-adjust: add more script text (based on default speaking speed) if the video is longer than the audio.
  - Trim video: the app includes a trimming API so you can cut a chosen reel segment before rendering.
  - Choose caption position (top/center/bottom) in Step 4.

Progress feedback: rendering now displays a visual progress bar and percentage (via the `/api/status/<job_id>` response's `percent` field).

Notes: For best caption results, prefer reels without on-screen text overlays and confirm the chosen background before continuing.

> Note: Use Reels with minimal on-screen text to get the best caption overlay results.

---

## ✨ Features

### Automatic voice + captions
- Edge-TTS creates voiceover audio.
- Whisper transcription produces time-aligned captions.
- Captions render in pill style with dynamic color highlights.
- Text is positioned to avoid platform UI overlays.
- New: caption vertical position selectable (`top`, `center`, `bottom`).

### Background visuals
- AI Mode uses gameplay footage downloaded from Pexels.
- Manual Mode uses user-uploaded video directly.
- Instagram Mode uses the confirmed reel video as background.

### Styling controls
- Choose from 11 caption fonts.
- Customize text color, highlight color, accent color, pill color, and opacity.
- Toggle automatic power-word highlighting.
- Optional background music upload with volume control.

### Local-first pipeline
- Runs on your machine with no paid cloud services.
- Uses `ffmpeg`, `moviepy`, `edge-tts`, `faster-whisper`, and `yt-dlp`.

---

## 🚀 Quick Start

### Prerequisites

| Tool | Required | Notes |
|------|----------|-------|
| Python 3.9+ | ✅ | Use system Python or a virtualenv |
| ffmpeg | ✅ | `brew install ffmpeg` on macOS |
| Ollama | Recommended for AI Mode | `ollama pull llama3.2` |

### Install

```bash
cd /Users/azhaankhan/Downloads/make_shorts
pip install -r requirements.txt
```

### Run the UI

```bash
python ui/app.py
```

### Run CLI modes

```bash
python make_shorts.py "your topic"
python make_shorts.py --script my_script.txt --gameplay ./my_clips/
python make_shorts.py --script my_script.txt --images ./my_photos/
```

---

## 📁 Project Structure

```
make_shorts/
├── make_shorts.py        # Core render pipeline
├── requirements.txt      # Python dependencies
├── ui/
│   ├── app.py            # Flask UI server
│   ├── templates/        # HTML templates for modes
│   └── static/           # JS and CSS assets
├── fonts/                # Bundled caption fonts
├── gameplay/             # Downloaded gameplay clips
├── uploads/              # Uploaded/reel videos
├── music/                # Uploaded music files
├── output/               # Rendered MP4 outputs
└── temp/                 # Temporary audio/video assets
```

---

## 🔧 Dependencies

The app uses:
- `flask` for the web UI
- `moviepy` for video composition
- `edge-tts` for voice generation
- `faster-whisper` for transcription
- `requests` for HTTP downloads
- `yt-dlp` for Instagram Reel downloads

## 🧭 API Endpoints (useful for automation)

- `POST /api/instagram/fetch` — Accepts JSON `{ "url": "..." }` or `{ "urls": ["...","..."] }`. Returns `results` array with `{ filename, duration, preview_url }` for each fetched reel.
- `POST /api/instagram/transcribe` — Accepts `{ "url": "..." }`. Returns `{ filename, duration, audio_duration, transcript }`.
- `POST /api/instagram/assemble` — Form POST used by the UI to render the final video; returns `{ job_id }` to poll with `/api/status/<job_id>`.
- `GET /api/status/<job_id>` — Returns job progress including `status`, `message`, and `percent` (0–100).
- `POST /api/instagram/trim` — JSON `{ "filename": "...", "start": 3.2, "end": 12.5 }`. Returns `{ filename, preview_url }` for the trimmed result.

- `POST /api/clear-storage` — Clears local storage directories used by the app: `uploads/`, `temp/`, `output/`, `sessions/`, `music/`, and `gameplay/`. Use the Home page button or call this endpoint to permanently delete stored media and session data (local only).

These endpoints are intended for local automation or to integrate with simple scripts.

---

## 🛠 Notes

- AI Mode requires Ollama for prompt-to-script generation.
- The web UI defaults to `http://127.0.0.1:5000`.
- If port `5000` is occupied, use another available port.

---

## ⚠️ Troubleshooting

### `moviepy.editor` import issue
If `python ui/app.py` fails with `No module named 'moviepy.editor'`, install the requirements and try again.

```bash
pip install -r requirements.txt
```

### Ollama issues
Start Ollama before using AI Mode:

```bash
ollama pull llama3.2
ollama serve
```
```bash
ollama serve
# or open the Ollama desktop app
ollama pull llama3.2
```
</details>

<details>
<summary><strong>ffmpeg not found</strong></summary>

```bash
# Mac
brew install ffmpeg
export PATH="/opt/homebrew/bin:$PATH"

# Linux
sudo apt install ffmpeg
```
</details>

<details>
<summary><strong>Video looks blank / dark</strong></summary>

Gameplay download may have failed. Use **Manual Mode** and upload your own MP4, or check your internet connection.
</details>

<details>
<summary><strong>Render is slow</strong></summary>

Normal for local CPU rendering. A 50s Short takes ~2–5 min. Speed tips:
- Set `WHISPER_MODEL = "tiny"` in `make_shorts.py`
- Lower `FPS` to 24
</details>

---

## 🎓 Pro Tips for Viral Shorts

1. **Hook in 1 second** — start with a bold claim or question
2. **Title = first line** of your script
3. **Music at 10–20%** volume — audible but never competing with voice
4. **Robotic fonts** (Orbitron, Audiowide) crush it for tech/gaming niches
5. **Post 11 AM–1 PM** and **7–9 PM** in your audience's timezone

---

## 📜 License

Do whatever you want. Build your channel. No attribution required.

<p align="center">
  <strong>Built for creators who ship.</strong><br/>
  <sub>Zero API keys · Zero limits · Zero excuses.</sub><br/>
  <strong>Made by Azhaan Khan</strong>
</p>