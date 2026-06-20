<div align="center">

# Reel Engine

**A local-first Python/Flask video creation app with an Apple-inspired UI and motion-rich design.**

![GitHub repo size](https://img.shields.io/github/repo-size/your-repo/Reel-Engine?style=for-the-badge)
![UI](https://img.shields.io/badge/UI-Apple--Inspired-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Stable-success?style=for-the-badge)

</div>

## ✨ Features

<details>
<summary><b>🎬 Studio Mode Editor</b></summary>
A VN-inspired timeline editor built right into your browser. Add video tracks, picture-in-picture, audio, text, and auto-generated captions.
</details>

<details>
<summary><b>💧 Watermark Tool</b></summary>
Securely embed watermarks across any media with dynamic scaling and fluid rendering, fully compatible with MoviePy v2.
</details>

<details>
<summary><b>🤖 AI & Automatic Captions</b></summary>
Generate highly accurate timestamps using `faster-whisper` and convert them into beautifully styled text clips using `moviepy`.
</details>

<details>
<summary><b>💅 Apple-Inspired UI</b></summary>
Clean typography (San Francisco system font stack), generous whitespace, glassmorphism, soft drop shadows, magnetic cursor interactions, and subtle motion-rich mesh gradients.
</details>

## 🛠 Architecture

```text
Upload/Reel → Extract/Process → Studio Timeline → Apply Watermarks → Export
```

### Troubleshooting

- **Watermark fails to apply**: Ensure `ffmpeg` and `imagemagick` are correctly installed on your system. Moviepy relies on these binaries to overlay TextClips properly.
- **Missing Apple Fonts**: If you are not on macOS, the system will gracefully fallback to `Arial` or `sans-serif` while retaining the updated padding and structural UI elements.
