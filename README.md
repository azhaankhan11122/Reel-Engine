<div align="center">

# Reel Engine

**A local-first Python/Flask video creation app.**

![GitHub repo size](https://img.shields.io/github/repo-size/your-repo/Reel-Engine?style=for-the-badge)
![UI](https://img.shields.io/badge/Imports-YouTube_%26_Shorts-red?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Stable-success?style=for-the-badge)

</div>

## ✨ Features

<details>
<summary><b>🎬 Studio Mode Editor</b></summary>
A VN-inspired timeline editor built right into your browser. Add video tracks, picture-in-picture, audio, text, and auto-generated captions.
</details>

<details>
<summary><b>▶️ YouTube Import & Clip Extraction</b></summary>

- Auto-detects YouTube vs Instagram links.
- Supports YouTube videos, Shorts, and youtu.be links.
- Import a selected timestamp range or the entire video.
- Extract audio from YouTube clips for voiceover/captions.
- Reuse imported clips in Studio Mode.
</details>

<details>
<summary><b>🤖 AI & Automatic Captions</b></summary>
Generate highly accurate timestamps using `faster-whisper` and convert them into beautifully styled text clips using `moviepy`.
</details>

## 🛠 Architecture

```text
Instagram / YouTube URL → Auto-detect → Clip or Full Import → Studio Timeline / Captions → Export
```

### Local API Endpoints
- `POST /api/media/detect-link`
- `POST /api/media/fetch`
- `POST /api/media/clip`
- `POST /api/media/audio-extract`

### Troubleshooting

- **YouTube video unavailable/private**: Make sure the video is public and your local IP is not being blocked.
- **Timestamp format invalid**: Enter timestamps as raw seconds or `MM:SS`.
- **Full video import is slow**: yt-dlp downloading long videos locally takes time based on your bandwidth.
