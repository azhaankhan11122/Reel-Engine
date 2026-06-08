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
  const raw = document.getElementById("reelUrls").value.trim();
  const errors = document.getElementById("errors");
  const btn = document.getElementById("fetchReelBtn");
  errors.innerHTML = "";

  if (!raw) {
    showError("errors", "Please paste one or more Instagram Reel links.");
    return;
  }

  const urls = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!urls.length) {
    showError("errors", "Please paste one or more valid Reel links.");
    return;
  }

  btn.disabled = true;
  showStatus("bgStatus", "Downloading the reel backgrounds...");

  try {
    const res = await fetch("/api/instagram/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError("errors", data.error || "Could not download the reels.");
      btn.disabled = false;
      document.getElementById("bgStatus").classList.remove("visible");
      return;
    }

    const preview = document.getElementById("backgroundPreview");
    preview.innerHTML = `<div class="card"><h3>Choose a background reel</h3><div id="reelList"></div></div>`;
    const list = preview.querySelector('#reelList');
    list.innerHTML = '';
    data.results.forEach((r, idx) => {
      if (r.error) {
        const el = document.createElement('div');
        el.className = 'reel-item error';
        el.textContent = `Failed: ${r.url || ''} — ${r.error}`;
        list.appendChild(el);
        return;
      }
      const id = `reelChoice_${idx}`;
      const item = document.createElement('div');
      item.className = 'reel-item';
      item.innerHTML = `
        <label style="display:flex; gap:0.75rem; align-items:center;">
          <input type="radio" name="reel_choice" id="${id}" value="${r.filename}" ${idx===0? 'checked' : ''}>
          <div style="flex:1;">
            <strong>${r.filename}</strong>
            <div class="subtitle">Length: ${r.duration}s</div>
            <video class="preview" controls src="/uploads/${r.filename}" style="max-width:320px; display:block; margin-top:0.5rem;"></video>
          </div>
        </label>
      `;
      list.appendChild(item);
    });

    preview.classList.remove("hidden");
    document.getElementById("confirmBackgroundBtn").classList.remove("hidden");

    document.getElementById("bgStatus").classList.remove("visible");
    btn.disabled = false;
  } catch (err) {
    showError("errors", err.message || "Failed to fetch reels.");
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
  const sel = document.querySelector('input[name="reel_choice"]:checked');
  if (!sel) {
    showError("errors", "Please select a background reel.");
    return;
  }
  instagramState.backgroundFile = sel.value;
  // try to capture duration from preview card
  const vid = sel.closest('.reel-item')?.querySelector('video');
  instagramState.backgroundDuration = vid ? Math.round((vid.duration || 0) * 10)/10 : null;
  document.getElementById('backgroundFile').value = instagramState.backgroundFile;
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
        // update progress bar
        const pct = Math.max(0, Math.min(100, parseInt(job.percent || 0)));
        const bar = document.getElementById('progressBar');
        const fill = document.getElementById('progressFill');
        const pctTxt = document.getElementById('progressPercent');
        if (bar && fill && pctTxt) {
          bar.style.display = 'block';
          pctTxt.style.display = 'block';
          fill.style.width = pct + '%';
          pctTxt.textContent = pct + '%';
        }
        if (job.status === "done") {
          document.getElementById("renderStatus").classList.remove("visible");
          // ensure progress shows 100%
          const fill = document.getElementById('progressFill');
          const pctTxt = document.getElementById('progressPercent');
          if (fill) fill.style.width = '100%';
          if (pctTxt) pctTxt.textContent = '100%';
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
