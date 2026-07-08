function pollJob(jobId, onUpdate) {
  return new Promise((resolve) => {
    const source = new EventSource(`/api/status/stream/${jobId}`);
    source.onmessage = function(event) {
      const data = JSON.parse(event.data);
      onUpdate(data);
      if (data.status === "done" || data.status === "error") {
        source.close();
        resolve();
      }
    };
    source.onerror = function() {
      source.close();
      onUpdate({status: "error", message: "SSE Connection lost."});
      resolve();
    };
  });
}

function showStatus(panelId, message) {
  const panel = document.getElementById(panelId);
  panel.classList.add("visible");
  panel.querySelector(".status-msg").textContent = message;
}

function hideResult(resultId) {
  const el = document.getElementById(resultId);
  el.classList.remove("visible");
  el.innerHTML = "";
}

function showError(containerId, msg) {
  const el = document.getElementById(containerId);
  el.innerHTML = `<div class="error-msg">${msg}</div>`;
}

function setupFileUpload(zoneId, inputId, nameId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const nameEl = document.getElementById(nameId);
  if (!zone || !input) return;

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      nameEl.textContent = e.dataTransfer.files[0].name;
    }
  });
  input.addEventListener("change", () => {
    if (input.files.length) nameEl.textContent = input.files[0].name;
  });
}

function setupRange(rangeId, valId) {
  const range = document.getElementById(rangeId);
  const val = document.getElementById(valId);
  if (!range || !val) return;
  const update = () => { val.textContent = range.value; };
  range.addEventListener("input", update);
  update();
}

function setupMusicToggle(checkboxId, optionsId) {
  const cb = document.getElementById(checkboxId);
  const opts = document.getElementById(optionsId);
  if (!cb || !opts) return;
  const toggle = () => opts.classList.toggle("hidden", !cb.checked);
  cb.addEventListener("change", toggle);
  toggle();
}

document.addEventListener("DOMContentLoaded", () => {
  const transitionLinks = document.querySelectorAll(".transition-link");
  transitionLinks.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const href = link.getAttribute("href");
      document.body.classList.add("page-transitioning");
      setTimeout(() => {
        window.location.href = href;
      }, 400); // matches CSS transition time
    });
  });

  // Handle back button caching issue with opacity
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      document.body.classList.remove("page-transitioning");
    }
  });
});
