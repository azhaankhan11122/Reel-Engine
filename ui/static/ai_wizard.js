/* AI Mode multi-step wizard */

const wizardState = {
  sessionId: null,
  prompt: "",
  clips: [],
  script: "",
  currentStep: 1,
};

function goToStep(n) {
  wizardState.currentStep = n;
  document.querySelectorAll(".wizard-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`step${n}`)?.classList.add("active");
  document.querySelectorAll(".wizard-steps .step").forEach((s) => {
    const sn = parseInt(s.dataset.step, 10);
    s.classList.toggle("active", sn === n);
    s.classList.toggle("done", sn < n);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function searchClips() {
  const prompt = document.getElementById("prompt").value.trim();
  const errors = document.getElementById("errors");
  const btn = document.getElementById("searchClipsBtn");
  errors.innerHTML = "";

  if (!prompt) {
    showError("errors", "Please enter a topic prompt.");
    return;
  }

  btn.disabled = true;
  showStatus("searchStatus", "Searching relevant gameplay clips...");

  try {
    const res = await fetch("/api/ai/search-clips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError("errors", data.error || "Search failed.");
      btn.disabled = false;
      document.getElementById("searchStatus").classList.remove("visible");
      return;
    }

    wizardState.sessionId = data.session_id;
    wizardState.prompt = data.prompt;
    wizardState.clips = data.clips;
    document.getElementById("sessionId").value = data.session_id;

    renderClipGrid(data.clips);
    document.getElementById("searchStatus").classList.remove("visible");
    btn.disabled = false;
    goToStep(2);
  } catch (e) {
    showError("errors", e.message);
    btn.disabled = false;
    document.getElementById("searchStatus").classList.remove("visible");
  }
}

function renderClipGrid(clips) {
  const grid = document.getElementById("clipGrid");
  grid.innerHTML = clips.map((clip) => `
    <label class="clip-card selected" data-id="${clip.id}">
      <input type="checkbox" class="clip-check" value="${clip.id}" checked>
      <div class="clip-thumb">
        ${clip.preview_url
          ? `<img src="${clip.preview_url}" alt="${clip.title}">`
          : `<div class="clip-placeholder">🎮</div>`}
        <video class="clip-preview-video" src="${clip.video_url}" muted loop playsinline
               onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0;"></video>
      </div>
      <div class="clip-info">
        <strong>${clip.title}</strong>
        <span class="clip-tags">${(clip.tags || []).slice(0, 3).join(" · ")}</span>
      </div>
    </label>
  `).join("");

  grid.querySelectorAll(".clip-card").forEach((card) => {
    const cb = card.querySelector(".clip-check");
    cb.addEventListener("change", () => {
      card.classList.toggle("selected", cb.checked);
      updateClipCount();
    });
  });
  updateClipCount();
}

function selectAllClips(val) {
  document.querySelectorAll(".clip-check").forEach((cb) => {
    cb.checked = val;
    cb.closest(".clip-card").classList.toggle("selected", val);
  });
  updateClipCount();
}

function updateClipCount() {
  const n = document.querySelectorAll(".clip-check:checked").length;
  document.getElementById("clipCount").textContent = `${n} selected`;
}

function getSelectedClipIds() {
  return [...document.querySelectorAll(".clip-check:checked")].map((cb) => cb.value);
}

async function goToScript() {
  const selected = getSelectedClipIds();
  if (!selected.length) {
    showError("errors", "Select at least one gameplay clip.");
    return;
  }
  document.getElementById("errors").innerHTML = "";
  document.getElementById("selectedClipsJson").value = JSON.stringify(selected);
  goToStep(3);

  const textarea = document.getElementById("scriptText");
  textarea.value = "";
  showStatus("scriptStatus", "AI is writing your viral script...");

  try {
    const res = await fetch("/api/ai/generate-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: wizardState.sessionId,
        prompt: wizardState.prompt,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError("errors", data.error || "Script generation failed.");
      document.getElementById("scriptStatus").classList.remove("visible");
      goToStep(2);
      return;
    }
    wizardState.script = data.script;
    textarea.value = data.script;
    document.getElementById("scriptStatus").classList.remove("visible");
  } catch (e) {
    showError("errors", e.message);
    document.getElementById("scriptStatus").classList.remove("visible");
    goToStep(2);
  }
}

function setupColorPickers() {
  [
    ["text_color", "text_color_picker"],
    ["highlight_color", "highlight_color_picker"],
    ["accent_color", "accent_color_picker"],
    ["pill_color", "pill_color_picker"],
  ].forEach(([textId, pickerId]) => {
    const text = document.getElementById(textId);
    const picker = document.getElementById(pickerId);
    if (!text || !picker) return;
    picker.addEventListener("input", () => { text.value = picker.value; });
    text.addEventListener("input", () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(text.value)) picker.value = text.value;
    });
  });
}

function initAIWizard() {
  document.getElementById("assembleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errors = document.getElementById("errors");
    errors.innerHTML = "";

    const script = document.getElementById("scriptText").value.trim();
    if (!script) {
      showError("errors", "Script cannot be empty. Go back and edit it.");
      return;
    }

    const selected = getSelectedClipIds();
    if (!selected.length) {
      showError("errors", "No clips selected.");
      return;
    }

    const fd = new FormData(e.target);
    fd.set("script", script);
    fd.set("selected_clips", JSON.stringify(selected));
    if (!document.getElementById("add_music")?.checked) {
      fd.delete("add_music");
      fd.delete("music");
    }
    if (!document.getElementById("dynamic_highlights")?.checked) {
      fd.set("dynamic_highlights", "false");
    }

    document.getElementById("assembleBtn").disabled = true;
    goToStep(5);
    showStatus("renderStatus", "Assembling your Short...");

    try {
      const res = await fetch("/api/ai/assemble", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        showError("errors", data.error || "Assembly failed.");
        document.getElementById("assembleBtn").disabled = false;
        goToStep(4);
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
              <h2>Your Short is ready!</h2>
              <video class="preview" controls src="${r.video_url}"></video>
              ${r.script ? `<div class="script-preview"><strong>Script:</strong><br>${r.script}</div>` : ""}
              <a href="${r.video_url}" download class="btn btn-primary" style="margin-top:1rem; text-decoration:none;">
                Download MP4
              </a>
            </div>`;
          document.getElementById("resultNav").style.display = "flex";
          document.getElementById("assembleBtn").disabled = false;
        }
        if (job.status === "error") {
          document.getElementById("renderStatus").classList.remove("visible");
          showError("errors", job.message || "Render failed.");
          document.getElementById("assembleBtn").disabled = false;
          goToStep(4);
        }
      });
    } catch (err) {
      showError("errors", err.message);
      document.getElementById("assembleBtn").disabled = false;
      goToStep(4);
    }
  });

  document.getElementById("prompt")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchClips();
  });
}
