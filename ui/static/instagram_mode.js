const instagramState = {
  backgroundFile: null,
  backgroundDuration: null,
  transcript: "",
  currentStep: 1,
};

function goToInstagramStep(n) {
  instagramState.currentStep = n;
  document.querySelectorAll(".wizard-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`step${n}`)?.classList.add("active");
  document.querySelectorAll(".wizard-steps .step").forEach((s) => {
    const sn = parseInt(s.dataset.step, 10);
    s.classList.toggle("active", sn === n);
    s.classList.toggle("done", sn < n);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function fetchReelBackground() {
  const url = document.getElementById("reelUrl").value.trim();
  const errors = document.getElementById("errors");
  const btn = document.getElementById("fetchReelBtn");
  errors.innerHTML = "";

  if (!url) {
    showError("errors", "Please paste a valid Instagram Reel link.");
    return;
  }

  btn.disabled = true;
  showStatus("bgStatus", "Downloading the reel background...");

  try {
    const res = await fetch("/api/instagram/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError("errors", data.error || "Could not download the reel.");
      btn.disabled = false;
      document.getElementById("bgStatus").classList.remove("visible");
      return;
    }

    instagramState.backgroundFile = data.filename;
    instagramState.backgroundDuration = data.duration;
    document.getElementById("backgroundFile").value = data.filename;

    const preview = document.getElementById("backgroundPreview");
    preview.innerHTML = `
      <div class="card">
        <h3>Reel loaded</h3>
        <p class="subtitle">Length: ${data.duration}s</p>
        <video class="preview" controls src="/uploads/${data.filename}"></video>
      </div>
    `;
    preview.classList.remove("hidden");
    document.getElementById("confirmBackgroundBtn").classList.remove("hidden");

    document.getElementById("bgStatus").classList.remove("visible");
    btn.disabled = false;
  } catch (err) {
    showError("errors", err.message || "Failed to fetch reel.");
    btn.disabled = false;
    document.getElementById("bgStatus").classList.remove("visible");
  }
}

async function extractVoiceTranscript() {
  const url = document.getElementById("voiceUrl").value.trim();
  const errors = document.getElementById("errors");
  const btn = document.getElementById("fetchVoiceBtn");
  errors.innerHTML = "";

  if (!url) {
    showError("errors", "Please paste the voice reel link.");
    return;
  }

  btn.disabled = true;
  showStatus("voiceStatus", "Downloading and transcribing the voice reel...");

  try {
    const res = await fetch("/api/instagram/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError("errors", data.error || "Voice extraction failed.");
      btn.disabled = false;
      document.getElementById("voiceStatus").classList.remove("visible");
      return;
    }

    instagramState.transcript = data.transcript;
    const textarea = document.getElementById("transcriptText");
    textarea.value = data.transcript;

    document.getElementById("voiceStatus").classList.remove("visible");
    btn.disabled = false;
    goToInstagramStep(3);
  } catch (err) {
    showError("errors", err.message || "Transcription failed.");
    btn.disabled = false;
    document.getElementById("voiceStatus").classList.remove("visible");
  }
}

function confirmBackground() {
  if (!instagramState.backgroundFile) {
    showError("errors", "Please fetch and confirm a reel background first.");
    return;
  }
  goToInstagramStep(2);
}

function initInstagramWizard() {
  document.getElementById("instagramForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errors = document.getElementById("errors");
    errors.innerHTML = "";

    const text = document.getElementById("transcriptText").value.trim();
    if (!text) {
      showError("errors", "Please edit the transcript text before generating.");
      return;
    }
    if (!instagramState.backgroundFile) {
      showError("errors", "Background reel is required.");
      return;
    }

    const form = e.target;
    const fd = new FormData(form);
    fd.set("text", text);
    if (!document.getElementById("dynamic_highlights")?.checked) {
      fd.set("dynamic_highlights", "false");
    }
    if (!document.getElementById("add_music")?.checked) {
      fd.delete("add_music");
      fd.delete("music");
    }

    document.getElementById("instagramAssembleBtn").disabled = true;
    goToInstagramStep(5);
    showStatus("renderStatus", "Assembling your Instagram Short...");

    try {
      const res = await fetch("/api/instagram/assemble", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        showError("errors", data.error || "Assembly failed.");
        document.getElementById("instagramAssembleBtn").disabled = false;
        goToInstagramStep(4);
        return;
      }

      await pollJob(data.job_id, (job) => {
        showStatus("renderStatus", job.message || job.status);
        if (job.status === "done") {
          document.getElementById("renderStatus").classList.remove("visible");
          const r = job.result;
          const panel = document.getElementById("resultPanel");
          panel.classList.add("visible");
          panel.innerHTML = `
            <div class="card">
              <h2>Your Instagram Short is ready!</h2>
              <video class="preview" controls src="${r.video_url}"></video>
              <a href="${r.video_url}" download class="btn btn-primary" style="margin-top:1rem; text-decoration:none;">
                Download MP4
              </a>
            </div>`;
          document.getElementById("resultNav").style.display = "flex";
          document.getElementById("instagramAssembleBtn").disabled = false;
        }
        if (job.status === "error") {
          document.getElementById("renderStatus").classList.remove("visible");
          showError("errors", job.message || "Render failed.");
          document.getElementById("instagramAssembleBtn").disabled = false;
          goToInstagramStep(4);
        }
      });
    } catch (err) {
      showError("errors", err.message);
      document.getElementById("instagramAssembleBtn").disabled = false;
      goToInstagramStep(4);
    }
  });
}
