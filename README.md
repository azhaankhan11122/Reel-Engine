<div align="center">

<pre>
██████╗ ███████╗███████╗██╗         ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗
██╔══██╗██╔════╝██╔════╝██║         ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝
██████╔╝█████╗  █████╗  ██║         █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗
██╔══██╗██╔══╝  ██╔══╝  ██║         ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝
██║  ██║███████╗███████╗███████╗    ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗
╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝    ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝
</pre>

<p align="center">
  <strong>Ship Viral Shorts, Reels & TikToks Locally. Fast, Free, and 100% on Your Machine.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.9%2B-0a0a0a?style=for-the-badge&logo=python&logoColor=00d4ff&labelColor=141414&color=00d4ff" alt="Python 3.9+" />
  <img src="https://img.shields.io/badge/Flask-UI-0a0a0a?style=for-the-badge&logo=flask&logoColor=00d4ff&labelColor=141414&color=00d4ff" alt="Flask UI" />
  <img src="https://img.shields.io/badge/MoviePy-Engine-0a0a0a?style=for-the-badge&logo=python&logoColor=00d4ff&labelColor=141414&color=00d4ff" alt="MoviePy" />
  <img src="https://img.shields.io/badge/ffmpeg-Rendering-0a0a0a?style=for-the-badge&logo=ffmpeg&logoColor=00d4ff&labelColor=141414&color=00d4ff" alt="ffmpeg" />
</p>

</div>

## 🚀 About

**Reel Engine** is your local micro-studio. No cloud costs, no paid subscriptions, no data harvesting. It turns simple ideas, plain text prompts, or existing Reel links into ready-to-post vertical videos (1080x1920 MP4) complete with whisper-synced captions, AI voiceovers, and auto-generated visuals.

Zero fluff. Just a local pipeline that takes you from idea to viral content in minutes.

---

## 🔥 What's New: The Studio Update!

We just dropped the **Studio Mode**—a full-blown, browser-based multi-track timeline editor built right into Reel Engine.

- **Multi-Track Timeline:** Layer main video, PIP, images, text, captions, voiceover, and music. All in a slick UI.
- **Asset Library Hub:** Drag and drop uploads, fetch Reels via `yt-dlp`, extract audio, and generate TTS on the fly.
- **Custom Compositing:** Powered by `moviepy` and `PIL`. Trim clips, change playback speeds, add visual filters, adjust volume, and perfectly sync your whisper captions.
- **Project Sessions:** Save your edits locally and pick up right where you left off.

---

## 💎 Why This is Cool

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ 🚫 No paid cloud API keys       │ ✅ Runs 100% locally on your machine  │
│ 🚫 Manual tedious captioning    │ ✅ Auto-synced viral Whisper captions │
│ 🚫 Generic web editors          │ ✅ Dedicated vertical-first pipeline  │
│ 🚫 Wasting hours editing        │ ✅ Prompt -> Script -> Video workflow │
└─────────────────────────────────────────────────────────────────────────┘
```

Reel Engine is a **developer-first** tool that democratizes video editing for the creator economy. Whether you want to automate a faceless channel using **AI Mode** (Ollama + LLaMA3), remix existing content with **Instagram Mode**, or get deep in the weeds with the **Studio Mode**, it's all right here.

---

## 🛠 Installation & Setup

Get Reel Engine running on your machine. It's built on Python and requires a few system-level dependencies.

### 1. Prerequisites
- **Python 3.9+**
- **ffmpeg** (Essential for rendering)
  - *Mac:* `brew install ffmpeg`
  - *Linux:* `sudo apt install ffmpeg`
- **Ollama** (Optional, but required for AI script generation)

### 2. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/reel-engine.git
cd reel-engine

# We highly recommend using a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install the Python goodies
pip install -r requirements.txt
```

### 3. Launch the UI
```bash
python ui/app.py
```
*Boom.* Head over to `http://127.0.0.1:5000` in your browser.

---

## 🕹 The Modes

* **🤖 AI Mode:** Paste a topic. Local LLaMA generates a hook-first script, downloads gameplay background, synthesizes TTS, auto-captions, and renders.
* **🎥 Instagram Mode:** Paste a Reel URL. Use its background or extract its audio to remix into something new.
* **✋ Manual Mode:** Upload your own MP4, add your script, tweak fonts/colors, and render.
* **🎞️ Studio Mode:** Multi-track timeline editing. Drag, drop, split, scale, and filter to your heart's content.
* **💧 Watermark Mode:** Quick ffmpeg utility to slap your brand onto any video.

---

<div align="center">

<p><strong>Built for creators who ship.</strong></p>
<p><sub>Zero API keys · Zero limits · Zero excuses.</sub></p>

</div>
