<div align="center">

# Reel Engine & Creator Vault

**A local-first Python/Flask video creation app with an Apple-inspired UI and motion-rich design.**

![GitHub repo size](https://img.shields.io/github/repo-size/your-repo/Reel-Engine?style=for-the-badge)
![UI](https://img.shields.io/badge/UI-Apple--Inspired-blue?style=for-the-badge)
![Storage](https://img.shields.io/badge/Storage-Creator_Vault-ff00ff?style=for-the-badge)

</div>

## ✨ Features

<details>
<summary><b>🎬 Studio Mode Editor</b></summary>
A VN-inspired timeline editor built right into your browser. Add video tracks, picture-in-picture, audio, text, and auto-generated captions.
</details>

<details>
<summary><b>🗃️ Creator Vault</b></summary>
Save imported Reels, extracted audio, generated voiceovers, and uploaded media into a local reusable asset library.
<br/><br/>
All files are saved locally to `media_library/` for quick reuse across different sessions.
</details>

<details>
<summary><b>🤖 AI & Automatic Captions</b></summary>
Generate highly accurate timestamps using `faster-whisper` and convert them into beautifully styled text clips using `moviepy`.
</details>

<details>
<summary><b>💅 Apple-Inspired UI</b></summary>
Clean typography (San Francisco system font stack), generous whitespace, glassmorphism, soft drop shadows, and subtle motion-rich gradients.
</details>

## 🗃️ Creator Vault — Save Once, Reuse Forever

> Save imported Reels, extracted audio, generated voiceovers, and uploaded media into a local reusable asset library.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Reel Video │ Reel Audio │ TTS Voice │ Uploads                      │
└─────┬──────┴─────┬──────┴─────┬─────┴──────┬──────────────────────┘
      ▼            ▼            ▼            ▼
              🗃️ Creator Vault
      Rename · Search · Favorite · Reuse · Add to Studio
                          ▼
                  🎛️ Studio Timeline
                          ▼
                  1080×1920 MP4 Export
```

## 🛠 Architecture

```text
Upload/Reel → Extract/Process → Creator Vault → Studio Timeline → Export
```

### Local API Endpoints

- `GET /api/library/assets`
- `POST /api/library/assets/add`
- `POST /api/library/assets/<id>/rename`
- `POST /api/library/assets/<id>/favorite`
- `POST /api/watermark` (patched for robust relative positioning and scaling)

### Troubleshooting

- **Watermark fails to apply**: Ensure `ffmpeg` and `imagemagick` are correctly installed on your system. Moviepy relies on these binaries to overlay TextClips properly.
- **Missing Apple Fonts**: If you are not on macOS, the system will gracefully fallback to `Arial` or `sans-serif` while retaining the updated padding and structural UI elements.
