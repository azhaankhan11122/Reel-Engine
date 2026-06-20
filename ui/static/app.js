async function pollJob(jobId, onUpdate) {
  while (true) {
    const res = await fetch(`/api/status/${jobId}`);
    const data = await res.json();
    onUpdate(data);
    if (data.status === "done" || data.status === "error") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
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


// Magnetic cursor effect for buttons
document.addEventListener('DOMContentLoaded', () => {
    const magneticElements = document.querySelectorAll('.mode-card, .btn');

    magneticElements.forEach(elem => {
        elem.classList.add('magnetic-btn');
        elem.addEventListener('mousemove', (e) => {
            const rect = elem.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            // Subtle pull
            elem.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`;
        });

        elem.addEventListener('mouseleave', () => {
            elem.style.transform = `translate(0px, 0px)`;
        });
    });

    // Add fade-in-up class to sections
    const cards = document.querySelectorAll('.mode-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.animationDelay = `${index * 0.1}s`;
        card.classList.add('fade-in-up');
    });
});
