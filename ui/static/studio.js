let currentMediaFilter = 'all';
/**
 * Reel Studio Client Editor
 * Core timelines, preview canvas rendering, assets uploads, and clip properties inspectors.
 */

// Global state
let project = null;
let activeClip = null;
let playheadTime = 0.0;
let isPlaying = false;
let animationFrameId = null;
let pxPerSecond = 50.0; // Timeline scale: 50 pixels = 1 second
let historyStack = [];
let historyIndex = -1;
const elementsCache = {};

// Font choices helper mapping to canvas standard families
const fontMapping = {
  'impact': 'Impact, Arial Black',
  'arial_black': '"Arial Black", sans-serif',
  'montserrat': '"Montserrat Black", "Arial Black", sans-serif',
  'bold': 'system-ui, -apple-system, sans-serif',
  'orbitron': '"Orbitron", monospace',
  'audiowide': '"Audiowide", cursive',
  'share_tech': '"Share Tech Mono", monospace',
  'press_start': '"Press Start 2P", monospace'
};

const extraFonts = {
  'arsen': '"Arsen", sans-serif',
  'avelline': '"Avelline", sans-serif',
  'avenir': '"Avenir", sans-serif',
  'bebas_neue': '"Bebas Neue", sans-serif',
  'bodoni': '"Bodoni", sans-serif',
  'canela': '"Canela", sans-serif',
  'caslon': '"Caslon", sans-serif',
  'chivo': '"Chivo", sans-serif',
  'cinzel': '"Cinzel", sans-serif',
  'cormorant_garamond': '"Cormorant Garamond", sans-serif',
  'deloiré': '"Deloiré", sans-serif',
  'deluce': '"Deluce", sans-serif',
  'didot': '"Didot", sans-serif',
  'ethos_nova': '"Ethos Nova", sans-serif',
  'futura': '"Futura", sans-serif',
  'gt_walsheim': '"GT Walsheim", sans-serif',
  'gamgote': '"Gamgote", sans-serif',
  'garamond': '"Garamond", sans-serif',
  'gatling': '"Gatling", sans-serif',
  'giften_cray': '"Giften Cray", sans-serif',
  'gilda_script': '"Gilda Script", sans-serif',
  'glamour': '"Glamour", sans-serif',
  'grandiose': '"Grandiose", sans-serif',
  'helvetica_neue': '"Helvetica Neue", sans-serif',
  'inter': '"Inter", sans-serif',
  'italic': '"Italic", sans-serif',
  'jost': '"Jost", sans-serif',
  'kento': '"Kento", sans-serif',
  'lora': '"Lora", sans-serif',
  'luxury_modish': '"Luxury Modish", sans-serif',
  'maison_neue': '"Maison Neue", sans-serif',
  'marlin': '"Marlin", sans-serif',
  'merriweather': '"Merriweather", sans-serif',
  'mikea': '"Mikea", sans-serif',
  'mindset': '"Mindset", sans-serif',
  'monreal': '"Monreal", sans-serif',
  'montelia': '"Montelia", sans-serif',
  'montserrat': '"Montserrat", sans-serif',
  'neue_haas_unica': '"Neue Haas Unica", sans-serif',
  'noto_serif_display': '"Noto Serif Display", sans-serif',
  'open_sans': '"Open Sans", sans-serif',
  'pacifico': '"Pacifico", sans-serif',
  'parisienne': '"Parisienne", sans-serif',
  'playfair_display': '"Playfair Display", sans-serif',
  'priscyla': '"Priscyla", sans-serif',
  'proximity_sans': '"Proximity Sans", sans-serif',
  'quattrocento': '"Quattrocento", sans-serif',
  'quirtty': '"Quirtty", sans-serif',
  'raleway': '"Raleway", sans-serif',
  'recoleta': '"Recoleta", sans-serif',
  'roboto': '"Roboto", sans-serif',
  'sacramento': '"Sacramento", sans-serif',
  'saudah': '"Saudah", sans-serif',
  'senja_mentor': '"Senja Mentor", sans-serif',
  'sifonn': '"Sifonn", sans-serif',
  'source_sans_pro': '"Source Sans Pro", sans-serif',
  'spectral': '"Spectral", sans-serif',
  'syne': '"Syne", sans-serif',
  'tundra': '"Tundra", sans-serif',
  'valencia': '"Valencia", sans-serif',
  'variable_sans': '"Variable Sans", sans-serif',
  'walkester': '"Walkester", sans-serif',
  'wyattruly': '"Wyattruly", sans-serif',
};

Object.assign(fontMapping, extraFonts);
document.addEventListener('DOMContentLoaded', () => {
  initUI();






  loadProjectList();
  
  // Create a new project on start if none exists
  createNewProject();
});

// Initialize UI layout and register events
function initUI() {

  // Watermark removal in Studio Mode
  const btnRemoveWatermark = document.getElementById('btnRemoveWatermark');
  let isDrawingWatermark = false;
  let isDrawingWatermarkActive = false;
  let wmStartX = 0, wmStartY = 0;

  if (btnRemoveWatermark && previewCanvas) {
    btnRemoveWatermark.addEventListener('click', () => {
      if (!activeClip || (activeClip.type !== 'video' && activeClip.type !== 'overlay')) return;
      isDrawingWatermarkActive = !isDrawingWatermarkActive;
      if (isDrawingWatermarkActive) {
        btnRemoveWatermark.classList.add('active');
        btnRemoveWatermark.style.backgroundColor = 'var(--danger-color)';
        btnRemoveWatermark.textContent = 'Cancel Watermark Selection';
        previewCanvas.style.cursor = 'crosshair';
      } else {
        btnRemoveWatermark.classList.remove('active');
        btnRemoveWatermark.style.backgroundColor = '';
        btnRemoveWatermark.innerHTML = '<i class="fa-solid fa-eraser"></i> Remove Watermark';
        previewCanvas.style.cursor = 'default';
        renderCanvas();
      }
    });

    previewCanvas.addEventListener('mousedown', (e) => {
      if (!isDrawingWatermarkActive) return;
      isDrawingWatermark = true;
      const rect = previewCanvas.getBoundingClientRect();
      const scaleX = previewCanvas.width / rect.width;
      const scaleY = previewCanvas.height / rect.height;
      wmStartX = (e.clientX - rect.left) * scaleX;
      wmStartY = (e.clientY - rect.top) * scaleY;
    });

    previewCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawingWatermarkActive || !isDrawingWatermark) return;
      const rect = previewCanvas.getBoundingClientRect();
      const scaleX = previewCanvas.width / rect.width;
      const scaleY = previewCanvas.height / rect.height;
      const currentX = (e.clientX - rect.left) * scaleX;
      const currentY = (e.clientY - rect.top) * scaleY;

      renderCanvas(); // clear and redraw base

      const ctx = previewCanvas.getContext('2d');
      ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
      const w = currentX - wmStartX;
      const h = currentY - wmStartY;
      ctx.fillRect(wmStartX, wmStartY, w, h);
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(wmStartX, wmStartY, w, h);
    });

    previewCanvas.addEventListener('mouseup', (e) => {
      if (!isDrawingWatermarkActive || !isDrawingWatermark) return;
      isDrawingWatermark = false;
      const rect = previewCanvas.getBoundingClientRect();
      const scaleX = previewCanvas.width / rect.width;
      const scaleY = previewCanvas.height / rect.height;
      const pos = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };

      const x = Math.min(wmStartX, pos.x);
      const y = Math.min(wmStartY, pos.y);
      const w = Math.abs(pos.x - wmStartX);
      const h = Math.abs(pos.y - wmStartY);

      if (w > 10 && h > 10) {
        const scale = activeClip.scale || 1.0;
        const clipX = activeClip.x || 540;
        const clipY = activeClip.y || 960;
        const clipW = activeClip.width || 1080;
        const clipH = activeClip.height || 1920;

        const left = clipX - (clipW * scale) / 2;
        const top = clipY - (clipH * scale) / 2;

        const relX = x - left;
        const relY = y - top;

        const sourceX = relX / scale;
        const sourceY = relY / scale;
        const sourceW = w / scale;
        const sourceH = h / scale;

        activeClip.watermark_delogo = {
          x: Math.max(0, Math.round(sourceX)),
          y: Math.max(0, Math.round(sourceY)),
          w: Math.round(sourceW),
          h: Math.round(sourceH)
        };

        saveState();
        alert('Watermark region selected and saved to clip.');

        isDrawingWatermarkActive = false;
        btnRemoveWatermark.classList.remove('active');
        btnRemoveWatermark.style.backgroundColor = '';
        btnRemoveWatermark.innerHTML = '<i class="fa-solid fa-eraser"></i> Remove Watermark';
        previewCanvas.style.cursor = 'default';
        renderCanvas();
      }
    });
  }

  // Magnetic Cursor
  const cursor = document.getElementById('magnetic-cursor');
  if (cursor) {
    document.addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    });

    const interactables = document.querySelectorAll('button, a, input, select, .timeline-track, .preset-text-btn, .font-combo-btn');
    interactables.forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('cursor-hover'));
    });
  }

  // Tabs switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Load project list modal close
  document.getElementById('btnProjectsModalClose').addEventListener('click', () => {
    document.getElementById('projectsModal').classList.remove('active');
  });


  // Timeline Resizer Logic
  const timelineResizer = document.getElementById('timelineResizer');
  const timelinePanel = document.getElementById('timelinePanel');
  let isResizingTimeline = false;

  if (timelineResizer && timelinePanel) {
    timelineResizer.addEventListener('mousedown', (e) => {
      isResizingTimeline = true;
      timelineResizer.classList.add('resizing');
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizingTimeline) return;
      const newHeight = window.innerHeight - e.clientY;
      const minHeight = 100;
      const maxHeight = window.innerHeight * 0.8;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        timelinePanel.style.height = newHeight + 'px';
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizingTimeline) {
        isResizingTimeline = false;
        timelineResizer.classList.remove('resizing');
        document.body.style.cursor = '';
      }
    });
  }

    // Extended Media Library Logic - Opens in New Window
  const btnExtendedMediaLibrary = document.getElementById('btnExtendedMediaLibrary');
  if (btnExtendedMediaLibrary) {
    btnExtendedMediaLibrary.addEventListener('click', () => {
      window.open('/studio/extended-library', '_blank', 'width=1200,height=800');
    });
  }



  document.getElementById('btnLoadProject').addEventListener('click', () => {
    document.getElementById('projectsModal').classList.add('active');






  loadProjectList();
  });

  const btnTextPresets = document.getElementById('btnTextPresets');
  const btnTextCombos = document.getElementById('btnTextCombos');
  const textPresetsGrid = document.getElementById('textPresetsGrid');
  const fontCombosGrid = document.getElementById('fontCombosGrid');

  if (btnTextPresets && btnTextCombos) {
    btnTextPresets.addEventListener('click', () => {
      btnTextPresets.classList.replace('secondary-btn', 'primary-btn');
      btnTextCombos.classList.replace('primary-btn', 'secondary-btn');
      textPresetsGrid.style.display = 'grid';
      fontCombosGrid.style.display = 'none';
    });
    btnTextCombos.addEventListener('click', () => {
      btnTextCombos.classList.replace('secondary-btn', 'primary-btn');
      btnTextPresets.classList.replace('primary-btn', 'secondary-btn');
      fontCombosGrid.style.display = 'grid';
      textPresetsGrid.style.display = 'none';
    });
  }

  document.querySelectorAll('.font-combo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const heading = btn.getAttribute('data-heading');
      const body = btn.getAttribute('data-body');

      const headingKey = heading.toLowerCase().replace(/ /g, '_');
      const bodyKey = body.toLowerCase().replace(/ /g, '_');

      const textTrack = project.tracks.find(t => t.id === 'text');

      const headingClip = {
        id: `clip_txt_${uuid()}`,
        text: "HEADING TEXT",
        start: playheadTime,
        duration: 5.0,
        fontFamily: headingKey,
        fontSize: 100,
        color: '#ffffff',
        backgroundColor: '#000000',
        backgroundOpacity: 0,
        alignment: 'center',
        x: 540,
        y: 600,
        opacity: 1.0,
        rotation: 0
      };

      const bodyClip = {
        id: `clip_txt_${uuid()}`,
        text: "This is the body text for your combo.",
        start: playheadTime,
        duration: 5.0,
        fontFamily: bodyKey,
        fontSize: 40,
        color: '#ffffff',
        backgroundColor: '#000000',
        backgroundOpacity: 0,
        alignment: 'center',
        x: 540,
        y: 800,
        opacity: 1.0,
        rotation: 0
      };

      textTrack.clips.push(headingClip);
      textTrack.clips.push(bodyClip);

      saveState();
      renderTimeline();
      selectClip(headingClip.id);
      drawFrame();
    });
  });

  document.getElementById('btnCreateNewProject').addEventListener('click', () => {
    createNewProject();
    document.getElementById('projectsModal').classList.remove('active');
  });

  // Undo/Redo
  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);

  // Save project
  document.getElementById('btnSave').addEventListener('click', saveProject);

  // Export video & Presets
  document.getElementById('btnExport').addEventListener('click', () => {
    document.getElementById('exportSettingsModal').classList.add('active');
  });
  document.getElementById('closeExportSettings').addEventListener('click', () => {
    document.getElementById('exportSettingsModal').classList.remove('active');
  });
  document.getElementById('confirmExport').addEventListener('click', () => {
    const res = document.getElementById('exportResolution').value.split('x');
    project.width = parseInt(res[0]);
    project.height = parseInt(res[1]);
    project.fps = parseInt(document.getElementById('exportFps').value);

    document.getElementById('exportSettingsModal').classList.remove('active');
    startExport();
  });
  document.getElementById('btnExportModalClose').addEventListener('click', () => {
    document.getElementById('exportModal').classList.remove('active');
  });

  // Project name input
  document.getElementById('projectName').addEventListener('change', (e) => {
    if (project) {
      project.name = e.target.value || "Untitled Studio Project";
      saveState();
    }
  });

  // Drag and Drop Uploads - Media Tab
  const mediaZone = document.getElementById('mediaUploadZone');
  mediaZone.addEventListener('click', () => document.getElementById('mediaFileInput').click());
  document.getElementById('mediaFileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) uploadFile(e.target.files[0], 'media');
  });
  setupDragDrop(mediaZone, (file) => uploadFile(file, 'media'));

  // Drag and Drop Uploads - Audio Tab
  const audioZone = document.getElementById('audioUploadZone');
  audioZone.addEventListener('click', () => document.getElementById('audioFileInput').click());
  document.getElementById('audioFileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) uploadFile(e.target.files[0], 'audio');
  });
  setupDragDrop(audioZone, (file) => uploadFile(file, 'audio'));

  // Instagram Reel video fetch
  document.getElementById('btnImportReelVideo').addEventListener('click', importReelVideo);
  // Instagram Reel audio extraction
  document.getElementById('btnImportReelAudio').addEventListener('click', importReelAudio);
  // TTS Voiceover generate
  document.getElementById('btnGenerateTTS').addEventListener('click', generateTTSVoiceover);
  // Auto Caption generation
  document.getElementById('btnGenerateAutoCaptions').addEventListener('click', generateAutoCaptions);
  // Add manual caption
  document.getElementById('btnAddManualCaption').addEventListener('click', addManualCaptionSegment);

  // Export SRT
  document.getElementById('btnExportSrt').addEventListener('click', exportSrt);

  // Player controls
  document.getElementById('btnPlayPause').addEventListener('click', togglePlayPause);
  document.getElementById('btnPrevFrame').addEventListener('click', () => seekTime(playheadTime - 1.0 / 30));
  document.getElementById('btnNextFrame').addEventListener('click', () => seekTime(playheadTime + 1.0 / 30));

  // Keyboard events
  window.addEventListener('keydown', handleGlobalKeydowns);

  // Timeline Toolbar Actions
  document.getElementById('btnSplitClip').addEventListener('click', splitSelectedClip);
  document.getElementById('btnDuplicateClip').addEventListener('click', duplicateSelectedClip);
  document.getElementById('btnDeleteClip').addEventListener('click', deleteSelectedClip);

  // Zoom timeline sliders
  const zoomSlider = document.getElementById('timelineZoom');
  zoomSlider.addEventListener('input', (e) => {
    // Translate slider value (1-100) to pxPerSecond (10 to 300)
    const val = parseFloat(e.target.value);
    pxPerSecond = 10.0 + (val / 100.0) * 290.0;
    renderTimeline();
    updatePlayheadPosition();
  });
  document.getElementById('btnZoomIn').addEventListener('click', () => {
    zoomSlider.value = Math.min(100, parseInt(zoomSlider.value) + 10);
    zoomSlider.dispatchEvent(new Event('input'));
  });
  document.getElementById('btnZoomOut').addEventListener('click', () => {
    zoomSlider.value = Math.max(1, parseInt(zoomSlider.value) - 10);
    zoomSlider.dispatchEvent(new Event('input'));
  });

  // Track Ruler interaction
  const ruler = document.getElementById('timeRuler');
  ruler.addEventListener('mousedown', handleRulerSeek);

  // Properties bindings
  bindPropertiesInspector();

  // Load voices dropdown

  // Custom Slider track fill logic
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    const updateSlider = (el) => {
      const min = el.min || 0;
      const max = el.max || 100;
      const percent = ((el.value - min) / (max - min)) * 100;
      el.style.background = `linear-gradient(to right, #A855F7 0%, #3B82F6 ${percent}%, var(--surface-studio) ${percent}%, var(--surface-studio) 100%)`;
    };
    slider.addEventListener('input', (e) => updateSlider(e.target));
    // initial set
    updateSlider(slider);
  });

  // Accordion mutual exclusivity
  document.querySelectorAll('details.prop-details').forEach((details) => {
    details.addEventListener('toggle', (e) => {
      if (details.open) {
        document.querySelectorAll('details.prop-details').forEach((other) => {
          if (other !== details && other.parentElement === details.parentElement && other.open) {
            other.open = false;
          }
        });
      }
    });
  });


  // Media Filter Tabs logic
  document.querySelectorAll('.media-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.media-tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentMediaFilter = e.target.getAttribute('data-filter');
      rebuildAssetsLibrary();
    });
  });

  loadTTSVoices();
}

function handleGlobalKeydowns(e) {
  // Ignore shortcuts if user is typing in form inputs/textarea
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === 'KeyS') {
    splitSelectedClip();
  } else if (e.code === 'Delete' || e.code === 'Backspace') {
    deleteSelectedClip();
  } else if (e.code === 'Minus') {
    document.getElementById('btnZoomOut').click();
  } else if (e.code === 'Equal') {
    document.getElementById('btnZoomIn').click();
  } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
    e.preventDefault();
    saveProject();
  } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyE') {
    e.preventDefault();
    startExport();
  } else if (e.code === 'ArrowLeft') {
    nudgeSelectedClip(-0.1);
  } else if (e.code === 'ArrowRight') {
    nudgeSelectedClip(0.1);
  }
}

// Caching elements for HTML5 players preview
function getAssetElement(asset) {
  if (elementsCache[asset.id]) {
    return elementsCache[asset.id];
  }
  let el = null;
  if (asset.type === 'video') {
    el = document.createElement('video');
    el.src = asset.url;
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.muted = true;
    el.playsInline = true;
  } else if (asset.type === 'audio') {
    el = document.createElement('audio');
    el.src = asset.url;
    el.preload = 'auto';
  } else if (asset.type === 'image') {
    el = document.createElement('img');
    el.src = asset.url;
    el.crossOrigin = 'anonymous';
  }
  
  if (el) {
    document.getElementById('studio-hidden-players').appendChild(el);
    elementsCache[asset.id] = el;
  }
  return el;
}

// Drag & drop file uploads helper
function setupDragDrop(zone, onFileReceived) {
  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    }, false);
  });
  
  zone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      onFileReceived(files[0]);
    }
  }, false);
}

// API CALLS
async function uploadFile(file, type) {
  showCanvasLoading(`Uploading ${file.name}...`);
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const res = await fetch('/api/studio/media/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
    } else {
      addAssetToLibrary(data);
    }
  } catch (err) {
    alert("Upload failed: " + err);
  } finally {
    hideCanvasLoading();
  }
}

async function importReelVideo() {
  const url = document.getElementById('reelVideoUrl').value.trim();
  if (!url) return alert("Please paste an Instagram Reel URL.");
  
  showCanvasLoading("Downloading Reel video (via yt-dlp)...");
  try {
    const res = await fetch('/api/studio/media/reel-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.error) {
      alert("Import failed: " + data.error);
    } else {
      addAssetToLibrary(data);
      document.getElementById('reelVideoUrl').value = '';
    }
  } catch (err) {
    alert("API call failed: " + err);
  } finally {
    hideCanvasLoading();
  }
}

async function importReelAudio() {
  const url = document.getElementById('reelAudioUrl').value.trim();
  if (!url) return alert("Please paste an Instagram Reel URL.");
  
  showCanvasLoading("Extracting Reel audio...");
  try {
    const res = await fetch('/api/studio/audio/reel-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.error) {
      alert("Extraction failed: " + data.error);
    } else {
      addAssetToLibrary(data);
      document.getElementById('reelAudioUrl').value = '';
    }
  } catch (err) {
    alert("API call failed: " + err);
  } finally {
    hideCanvasLoading();
  }
}

async function generateTTSVoiceover() {
  const text = document.getElementById('ttsText').value.trim();
  const voice = document.getElementById('ttsVoiceSelect').value;
  if (!text) return alert("Please enter text for voiceover.");
  
  showCanvasLoading("Generating Edge-TTS Voiceover...");
  try {
    const res = await fetch('/api/studio/audio/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice })
    });
    const data = await res.json();
    if (data.error) {
      alert("TTS generation failed: " + data.error);
    } else {
      addAssetToLibrary(data);
      // Auto drag TTS to timeline voice track at playhead position
      addAssetToTimeline(data.id, 'voice', playheadTime);
      document.getElementById('ttsText').value = '';
    }
  } catch (err) {
    alert("TTS API failed: " + err);
  } finally {
    hideCanvasLoading();
  }
}

async function generateAutoCaptions() {
  const assetUrl = document.getElementById('captionAssetSelect').value;
  if (!assetUrl) return alert("Please select a video/audio track first.");
  
  showCanvasLoading("Transcribing audio using Whisper (faster-whisper)...");
  try {
    const res = await fetch('/api/studio/captions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetUrl })
    });
    const data = await res.json();
    if (data.error) {
      alert("Transcription failed: " + data.error);
    } else {
      // Convert caption chunks to clips on the captions track
      const chunks = data.chunks || [];
      if (chunks.length === 0) {
        alert("No spoken words detected in the selected file.");
      } else {
        const captionsTrack = project.tracks.find(t => t.id === 'captions');
        captionsTrack.clips = []; // Clear existing captions
        
        // Attach word timestamps to their respective chunks
        const words = data.words || [];
        chunks.forEach((chunk, index) => {
          // Find all words that fall within this chunk's time window
          const chunkWords = words.filter(w => w.start >= chunk.start - 0.1 && w.end <= chunk.end + 0.1);
          const capClip = {
            id: `clip_cap_${uuid()}`,
            text: chunk.text,
            start: chunk.start,
            duration: chunk.end - chunk.start,
            words: chunkWords, // Inject word-level data for kinetic rendering
            style: {
              fontFamily: 'impact',
              fontSize: 76,
              textColor: '#FFFFFF',
              highlightColor: '#FFCC00',
              accentColor: '#00FF66',
              pillColor: '#000000',
              pillOpacity: 140,
              dynamicHighlights: true,
              captionPosition: 'bottom'
            }
          };
          captionsTrack.clips.push(capClip);
        });
        
        saveState();
        renderTimeline();
        alert(`Successfully generated ${chunks.length} caption clips!`);
      }
    }
  } catch (err) {
    alert("Captions generation failed: " + err);
  } finally {
    hideCanvasLoading();
  }
}

async function loadTTSVoices() {
  try {
    const res = await fetch('/api/ai/voices');
    const data = await res.json();
    const select = document.getElementById('ttsVoiceSelect');
    select.innerHTML = '';
    data.voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.label;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load TTS voices", err);
  }
}

// PROJECT STATE MANAGEMENT
async function createNewProject() {
  try {
    const res = await fetch('/api/studio/project/create', { method: 'POST' });
    const data = await res.json();
    setProject(data);
    
    // Clear history stack
    historyStack = [JSON.stringify(project)];
    historyIndex = 0;
    updateUndoRedoButtons();
  } catch (err) {
    console.error("Failed to create project", err);
  }
}

async function loadProject(id) {
  showCanvasLoading("Loading project JSON...");
  try {
    const res = await fetch(`/api/studio/project/${id}`);
    const data = await res.json();
    if (data.error) {
      alert("Failed to load project: " + data.error);
    } else {
      setProject(data);
      historyStack = [JSON.stringify(project)];
      historyIndex = 0;
      updateUndoRedoButtons();
      document.getElementById('projectsModal').classList.remove('active');
    }
  } catch (err) {
    alert("Load failed: " + err);
  } finally {
    hideCanvasLoading();
  }
}

async function loadProjectList() {
  const container = document.getElementById('projectsModalList');
  container.innerHTML = '<p class="modal-loading-hint">Loading projects...</p>';
  try {
    const res = await fetch('/api/studio/projects');
    const data = await res.json();
    container.innerHTML = '';
    
    if (data.projects.length === 0) {
      container.innerHTML = '<p class="modal-loading-hint" style="color:var(--text-muted);">No saved projects found.</p>';
      return;
    }
    
    data.projects.forEach(p => {
      const dateStr = new Date(p.updated * 1000).toLocaleString();
      const item = document.createElement('div');
      item.className = 'project-item';
      item.innerHTML = `
        <span class="project-item-name"><i class="fa-solid fa-file-video"></i> ${p.name}</span>
        <span class="project-item-date">${dateStr}</span>
      `;
      item.addEventListener('click', () => loadProject(p.id));
      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = '<p class="modal-loading-hint" style="color:var(--danger-color);">Error loading projects.</p>';
  }
}

async function saveProject() {
  if (!project) return;
  const saveBtn = document.getElementById('btnSave');
  const origText = saveBtn.innerHTML;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  
  try {
    const res = await fetch(`/api/studio/project/${project.id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });
    const data = await res.json();
    if (data.success) {
      saveBtn.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--accent-green)"></i> Saved';
      setTimeout(() => { saveBtn.innerHTML = origText; }, 1500);
    } else {
      alert("Failed to save: " + data.error);
      saveBtn.innerHTML = origText;
    }
  } catch (err) {
    alert("Save API failed: " + err);
    saveBtn.innerHTML = origText;
  }
}

function setProject(p) {
  project = p;
  document.getElementById('projectName').value = project.name;
  
  // Re-build element players
  document.getElementById('studio-hidden-players').innerHTML = '';
  Object.keys(elementsCache).forEach(k => delete elementsCache[k]);
  
  project.assets.forEach(a => getAssetElement(a));
  
  // Repopulate sidebar grid lists
  rebuildAssetsLibrary();
  rebuildCaptionAssetSelects();
  
  // Reset preview variables
  playheadTime = 0.0;
  activeClip = null;
  selectClip(null);
  
  // Update UI and Timeline length
  renderTimeline();
  updatePlayheadPosition();
  updateTotalDurationLabel();
  drawFrame();
}

function saveState() {
  if (!project) return;
  
  // Auto calculate total project length based on final element boundaries
  let maxTime = 0.0;
  project.tracks.forEach(track => {
    track.clips.forEach(clip => {
      const end = clip.start + clip.duration;
      if (end > maxTime) maxTime = end;
    });
  });
  project.duration = maxTime;
  updateTotalDurationLabel();
  
  // Add to history
  const serialized = JSON.stringify(project);
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }
  historyStack.push(serialized);
  historyIndex = historyStack.length - 1;
  updateUndoRedoButtons();
  
  // Auto local save project JSON in the background
  saveProject();
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    const state = JSON.parse(historyStack[historyIndex]);
    setProjectSilent(state);
  }
}

function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    const state = JSON.parse(historyStack[historyIndex]);
    setProjectSilent(state);
  }
}

function setProjectSilent(p) {
  project = p;
  document.getElementById('projectName').value = project.name;
  project.assets.forEach(a => getAssetElement(a));
  rebuildAssetsLibrary();
  rebuildCaptionAssetSelects();
  activeClip = null;
  selectClip(null);
  renderTimeline();
  updatePlayheadPosition();
  updateTotalDurationLabel();
  drawFrame();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  document.getElementById('btnUndo').disabled = (historyIndex <= 0);
  document.getElementById('btnRedo').disabled = (historyIndex >= historyStack.length - 1);
}

// DYNAMIC PROPERTIES UPDATE
window.updateActiveClipProperty = function(key, value) {
  if (!activeClip) return;
  if (key === 'properties') {
    activeClip.properties = { ...activeClip.properties, ...value };
  } else {
    activeClip[key] = value;
  }
  saveState();
  drawFrame();
};

// ASSETS MANAGEMENT
function addAssetToLibrary(asset) {
  // Avoid duplicate assets
  if (!project.assets.some(a => a.id === asset.id)) {
    project.assets.push(asset);
    getAssetElement(asset);
    saveState();
    rebuildAssetsLibrary();
    rebuildCaptionAssetSelects();
  }
}

function rebuildAssetsLibrary() {
  const mediaGrid = document.getElementById('mediaAssetsGrid');
  const audioList = document.getElementById('audioAssetsList');
  
  mediaGrid.innerHTML = '';
  audioList.innerHTML = '';
  
  project.assets.forEach(asset => {
    if (currentMediaFilter !== 'all' && asset.type !== currentMediaFilter) return;

    if (asset.type === 'video' || asset.type === 'image') {
      const card = document.createElement('div');
      card.className = 'asset-card';
      card.setAttribute('data-type', asset.type);
      card.draggable = true;
      card.setAttribute('data-asset-id', asset.id);
      
      const formattedDuration = asset.type === 'video' ? formatTimeCode(asset.duration) : '';
      const previewTag = asset.type === 'video' 
        ? `<img src="${asset.preview_url || asset.url}" alt="${asset.name}"><div class="asset-duration">${formattedDuration}</div>`
        : `<img src="${asset.url}" alt="${asset.name}">`;
        
      card.innerHTML = `
        <div class="asset-preview-box">
          ${previewTag}
        </div>
        <div class="asset-card-info">${asset.name}</div>
      `;
      
      // Drag events
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      
      // Double click to add instantly to timeline at playhead
      card.addEventListener('dblclick', () => {
        const trackId = asset.type === 'video' ? 'video_main' : 'image_overlay';
        addAssetToTimeline(asset.id, trackId, playheadTime);
      });
      
      mediaGrid.appendChild(card);
    } else if (asset.type === 'audio') {
      const item = document.createElement('div');
      item.className = 'asset-list-item';
      item.setAttribute('data-type', asset.type);
      item.draggable = true;
      item.setAttribute('data-asset-id', asset.id);
      item.innerHTML = `
        <i class="fa-solid fa-volume-high"></i>
        <span class="asset-list-title">${asset.name}</span>
        <span class="asset-list-duration">${formatTimeCode(asset.duration)}</span>
      `;
      
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      
      item.addEventListener('dblclick', () => {
        addAssetToTimeline(asset.id, 'music', playheadTime);
      });
      
      audioList.appendChild(item);
    }
  });
}

function rebuildCaptionAssetSelects() {
  const select = document.getElementById('captionAssetSelect');
  select.innerHTML = '<option value="">-- Choose imported media --</option>';
  
  project.assets.forEach(asset => {
    if (asset.type === 'video' || asset.type === 'audio') {
      const opt = document.createElement('option');
      opt.value = asset.url;
      opt.textContent = `${asset.name} (${asset.type})`;
      select.appendChild(opt);
    }
  });
}

// TIMELINE COMPILATIONS
function addAssetToTimeline(assetId, trackId, startTime) {
  const asset = project.assets.find(a => a.id === assetId);
  if (!asset) return;
  
  const track = project.tracks.find(t => t.id === trackId);
  if (!track) return;
  
  let clipDuration = asset.duration || 5.0;
  if (asset.type === 'image') {
    clipDuration = 5.0; // Default images overlay duration to 5s
  }
  
  // Check if clip placement conflicts or overlaps (VN timelines allow multi-layers but we snap overlays cleanly)
  const newClip = {
    id: `clip_${asset.type}_${uuid()}`,
    assetId: asset.id,
    start: startTime,
    duration: clipDuration,
    name: asset.name
  };
  
  if (trackId === 'video_main' || trackId === 'video_overlay') {
    newClip.trimStart = 0.0;
    newClip.speed = 1.0;
    newClip.volume = 1.0;
    newClip.muted = false;
    newClip.cropMode = 'cover';
    newClip.opacity = 1.0;
    newClip.scale = 1.0;
    newClip.rotation = 0;
    newClip.x = 540;
    newClip.y = 960;
    newClip.filter = 'none';
    newClip.transition = 'none';
  } else if (trackId === 'image_overlay') {
    newClip.opacity = 1.0;
    newClip.scale = 0.4; // Scaled down as overlay overlay default
    newClip.rotation = 0;
    newClip.x = 540;
    newClip.y = 960;
    newClip.cropMode = 'contain';
  } else if (trackId === 'music' || trackId === 'voice') {
    newClip.trimStart = 0.0;
    newClip.volume = 1.0;
    newClip.muted = false;
    newClip.fadeIn = 0.0;
    newClip.fadeOut = 0.0;
  }
  
  // Snap clip horizontally to playhead or closest neighbor
  const snapTime = getSnapPosition(newClip.start, newClip.duration, newClip.id, trackId);
  newClip.start = snapTime;
  
  track.clips.push(newClip);
  
  saveState();
  renderTimeline();
  selectClip(newClip.id);
  drawFrame();
}

function rebuildTextPreset(presetType) {
  const textTrack = project.tracks.find(t => t.id === 'text');
  
  let size = 80;
  let text = "Text Content";
  let fontFamily = "impact";
  
  if (presetType === 'heading') {
    size = 100;
    text = "DOUBLE CLICK TO EDIT";
  } else if (presetType === 'subheading') {
    size = 64;
    text = "Custom Subtitle";
  } else {
    size = 40;
    text = "Body text block content details";
    fontFamily = "bold";
  }
  
  const newClip = {
    id: `clip_txt_${uuid()}`,
    text: text,
    start: playheadTime,
    duration: 5.0,
    fontFamily: fontFamily,
    fontSize: size,
    color: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 140,
    alignment: 'center',
    x: 540,
    y: 960,
    opacity: 1.0,
    rotation: 0
  };
  
  textTrack.clips.push(newClip);
  saveState();
  renderTimeline();
  selectClip(newClip.id);
  drawFrame();
}

document.querySelectorAll('.preset-text-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.getAttribute('data-preset');
    rebuildTextPreset(preset);
  });
});

function calculateViralScore() {
  let score = 0;

  // 1. Duration (10 to 60 seconds is ideal for shorts)
  let projectDuration = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.start + clip.duration > projectDuration) {
        projectDuration = clip.start + clip.duration;
      }
    }
  }

  if (projectDuration > 0) {
    if (projectDuration <= 60 && projectDuration >= 10) {
      score += 30;
    } else if (projectDuration < 10) {
      score += 15; // too short
    } else if (projectDuration <= 90) {
      score += 20; // okay, but slightly long
    } else {
      score += 10; // too long
    }
  }

  // 2. Pace (Number of cuts/clips per minute)
  let numClips = 0;
  let hasHook = false;
  let wordCount = 0;

  for (const track of project.tracks) {
    if (track.type !== 'captions') {
      numClips += track.clips.length;
    } else {
      // Analyze captions
      for (const clip of track.clips) {
        let textLength = clip.content ? clip.content.split(/\s+/).length : 0;
        wordCount += textLength;
        // Hook check in first 5 seconds
        if (clip.start < 5.0 && clip.content) {
          const contentLower = clip.content.toLowerCase();
          const hookWords = ['you', 'how', 'why', 'secret', 'stop', 'hack', 'truth'];
          for (let word of hookWords) {
            if (contentLower.includes(word)) {
              hasHook = true;
              break;
            }
          }
        }
      }
    }
  }

  let cutsPerMinute = projectDuration > 0 ? (numClips / projectDuration) * 60 : 0;
  if (cutsPerMinute >= 15 && cutsPerMinute <= 40) {
    score += 30; // fast-paced
  } else if (cutsPerMinute > 40) {
    score += 20; // too frantic
  } else if (cutsPerMinute > 5) {
    score += 10; // a bit slow
  }

  // 3. Captions density (Words Per Minute)
  let wpm = projectDuration > 0 ? (wordCount / projectDuration) * 60 : 0;
  if (wpm >= 130 && wpm <= 180) {
    score += 25;
  } else if (wpm > 0) {
    score += 15;
  }

  // 4. Hook presence
  if (hasHook) {
    score += 15;
  }

  if (projectDuration === 0) {
    score = 0;
  }

  // Update UI
  const badgeElement = document.getElementById('viralScoreValue');
  if (badgeElement) {
    badgeElement.textContent = `${Math.min(100, Math.floor(score))} / 100`;
  }
}

// TIMELINE RENDERER AND DRAG ACTIONS
function renderTimeline() {
  calculateViralScore();
  const container = document.getElementById('tracksContainer');
  
  // Clear existing clip elements in the DOM
  document.querySelectorAll('.timeline-clip').forEach(el => el.remove());
  
  // Clear dynamic ticks
  document.querySelectorAll('.ruler-tick, .ruler-label').forEach(el => el.remove());
  
  // Build Ruler ticks based on total duration (minimum 15s, maximum length + 10s)
  const maxLimit = Math.max(15, project.duration + 10);
  const trackWidth = maxLimit * pxPerSecond;
  
  // Resize tracks layout dynamically
  document.querySelectorAll('.timeline-track').forEach(t => {
    t.style.width = `${trackWidth}px`;
  });
  document.getElementById('timeRuler').style.width = `${trackWidth}px`;
  
  // Drawing Rulers
  const ruler = document.getElementById('timeRuler');
  const tickSpacing = pxPerSecond; // 1 second interval
  
  let majorStep = 5; // Major numbers every 5 seconds
  if (pxPerSecond < 15) majorStep = 10;
  if (pxPerSecond > 100) majorStep = 1;
  
  for (let s = 0; s < maxLimit; s++) {
    const left = s * pxPerSecond;
    const isMajor = (s % majorStep === 0);
    
    const tick = document.createElement('div');
    tick.className = `ruler-tick ${isMajor ? 'major' : 'minor'}`;
    tick.style.left = `${left}px`;
    ruler.appendChild(tick);
    
    if (isMajor) {
      const label = document.createElement('div');
      label.className = 'ruler-label';
      label.textContent = formatRulerTime(s);
      label.style.left = `${left}px`;
      ruler.appendChild(label);
    }
  }

  // Populate clips in timeline tracks
  project.tracks.forEach(track => {
    const trackEl = document.querySelector(`.timeline-track[data-track-id="${track.id}"]`);
    if (!trackEl) return;
    
    track.clips.forEach(clip => {
      const clipEl = document.createElement('div');
      clipEl.className = `timeline-clip clip-${track.type}`;
      clipEl.setAttribute('data-clip-id', clip.id);
      clipEl.setAttribute('data-track-id', track.id);
      
      const width = clip.duration * pxPerSecond;
      const left = clip.start * pxPerSecond;
      
      clipEl.style.width = `${width}px`;
      clipEl.style.left = `${left}px`;
      
      // Fetch clip title
      let title = clip.name || clip.text || "Clip Element";
      if (title.length > 25) title = title.substring(0, 22) + "...";
      clipEl.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = title;
      clipEl.appendChild(span);
      
      // Render Waveform Canvas if clip has audio_peaks
      const asset = clip.assetId ? project.assets.find(a => a.id === clip.assetId) : null;
      if (asset && asset.audio_peaks && asset.audio_peaks.length > 0 && (track.type === 'video' || track.type === 'audio')) {
        const waveCanvas = document.createElement('canvas');
        waveCanvas.className = 'timeline-waveform-canvas';
        // Give canvas some absolute style to fit inside clipEl without interfering with drag
        waveCanvas.style.position = 'absolute';
        waveCanvas.style.left = '0';
        waveCanvas.style.bottom = '0';
        waveCanvas.style.width = '100%';
        waveCanvas.style.height = '100%';
        waveCanvas.style.pointerEvents = 'none'; // so we can still click clip handles
        clipEl.appendChild(waveCanvas);

        // Render waveform logic
        setTimeout(() => { // slight delay to allow layout
          // use the exact pixel width of the clip container
          const w = clipEl.clientWidth;
          const h = clipEl.clientHeight;
          waveCanvas.width = w;
          waveCanvas.height = h;
          const wCtx = waveCanvas.getContext('2d');

          wCtx.clearRect(0, 0, w, h);
          wCtx.fillStyle = track.type === 'audio' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.15)';

          const peaks = asset.audio_peaks;
          const numPeaks = peaks.length;

          // Depending on clip trim, we might want to slice the peaks array, but for simplicity
          // let's map the whole asset audio peaks and draw just the trimmed portion,
          // or scale based on the visible duration vs total duration.

          const clipStartRatio = (clip.trimStart || 0) / asset.duration;
          const clipEndRatio = ((clip.trimStart || 0) + clip.duration) / asset.duration;

          const startIdx = Math.floor(clipStartRatio * numPeaks);
          const endIdx = Math.floor(clipEndRatio * numPeaks);

          const visiblePeaks = peaks.slice(startIdx, Math.max(endIdx, startIdx + 1));

          if (visiblePeaks.length > 0) {
              const step = w / visiblePeaks.length;
              for (let i = 0; i < visiblePeaks.length; i++) {
                  const peakHeight = visiblePeaks[i] * (h * 0.8); // max height 80% of track height
                  const y = (h - peakHeight) / 2; // vertically centered symmetrical style
                  const x = i * step;
                  // draw symmetric bar
                  wCtx.fillRect(x, y, step > 1 ? step - 1 : 1, peakHeight);
              }
          }
        }, 10);
      }

      // Trim handles
      const lHandle = document.createElement('div');
      lHandle.className = 'clip-handle clip-handle-left';
      const rHandle = document.createElement('div');
      rHandle.className = 'clip-handle clip-handle-right';
      
      clipEl.appendChild(lHandle);
      clipEl.appendChild(rHandle);
      
      if (activeClip && activeClip.id === clip.id) {
        clipEl.classList.add('selected');
      }
      
      // Interactive mouse drag actions
      clipEl.addEventListener('mousedown', (e) => handleClipMousedown(e, clip, track.id, clipEl));
      
      trackEl.appendChild(clipEl);
    });
  });
  
  // Dropping drag assets onto target tracks
  setupTrackDropZones();
}

function setupTrackDropZones() {
  document.querySelectorAll('.timeline-track').forEach(trackEl => {
    trackEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    
    trackEl.addEventListener('drop', (e) => {
      e.preventDefault();

      let assetId = e.dataTransfer.getData('text/plain');

      // External drag from Extended Library or Overlay Panel
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData);
          if (data.type === 'overlay') {
             // Treat overlay template as a new asset immediately
             if (!project.assets.find(a => a.id === data.id)) {
                 project.assets.push(data);
             }
             assetId = data.id;
          } else if (!assetId) {

          let existingAsset = project.assets.find(a => a.path === data.path);
          if (!existingAsset) {
            existingAsset = {
              id: 'asset_' + uuid(),
              type: data.type,
              name: data.name,
              url: data.url,
              preview_url: data.preview_url,
              path: data.path,
              duration: 5.0,
              width: 1080,
              height: 1920
            };
            project.assets.push(existingAsset);
            renderMediaLibrary();
          }
          assetId = existingAsset.id;
          }
        } catch(err) {
          console.error(err);
          return;
        }
      }
      const trackId = trackEl.getAttribute('data-track-id');
      const trackType = trackEl.getAttribute('data-track-type');
      
      const asset = project.assets.find(a => a.id === assetId);
      if (!asset) return;
      
      // Match track type restriction
      let allowed = false;
      if (trackType === 'video' && asset.type === 'video') allowed = true;
      if (trackType === 'overlay' && asset.type === 'video') allowed = true;
      if (trackType === 'image' && asset.type === 'image') allowed = true;
      if (trackType === 'text') allowed = false; // Add text via preset buttons
      if (trackType === 'captions') allowed = false;
      if (trackType === 'audio' && asset.type === 'audio') allowed = true;
      
      if (!allowed) {
        alert(`Cannot place ${asset.type} asset onto ${trackId} track.`);
        return;
      }
      
      // Calculate start time relative to dropped position
      const rect = trackEl.getBoundingClientRect();
      const scrollLeft = document.getElementById('timelineWrapper').scrollLeft;
      const offsetX = e.clientX - rect.left + scrollLeft;
      const startTime = Math.max(0.0, offsetX / pxPerSecond);
      
      addAssetToTimeline(assetId, trackId, startTime);
    });
  });
}

// CLIP DRAGGING & TRIMMING LOGIC
function handleClipMousedown(e, clip, trackId, clipEl) {
  e.stopPropagation();
  selectClip(clip.id);
  
  const isLeftHandle = e.target.classList.contains('clip-handle-left');
  const isRightHandle = e.target.classList.contains('clip-handle-right');
  
  const startX = e.clientX;
  const initialStart = clip.start;
  const initialDuration = clip.duration;
  const initialTrimStart = clip.trimStart || 0.0;
  
  const scrollWrapper = document.getElementById('timelineWrapper');
  
  function handleMouseMove(moveEvent) {
    const deltaX = moveEvent.clientX - startX;
    const deltaTime = deltaX / pxPerSecond;
    
    if (isLeftHandle) {
      // Trim start handle
      let proposedStart = initialStart + deltaTime;
      let proposedDuration = initialDuration - deltaTime;
      
      if (proposedDuration < 0.1) {
        proposedDuration = 0.1;
        proposedStart = initialStart + initialDuration - 0.1;
      }
      
      // Apply snapping
      const snaped = getSnapPosition(proposedStart, proposedDuration, clip.id, trackId);
      const snapOffset = snaped - proposedStart;
      proposedStart += snapOffset;
      proposedDuration -= snapOffset;
      
      clip.start = Math.max(0.0, proposedStart);
      clip.duration = Math.max(0.1, proposedDuration);
      
      // Offset trim start to preserve video sync window
      if (clip.trimStart !== undefined) {
        clip.trimStart = Math.max(0.0, initialTrimStart + (clip.start - initialStart));
      }
    } else if (isRightHandle) {
      // Trim end handle
      let proposedDuration = initialDuration + deltaTime;
      
      // Apply snap to end
      const proposedEnd = initialStart + proposedDuration;
      const snapedEnd = getSnapPosition(proposedEnd, 0, clip.id, trackId);
      proposedDuration = Math.max(0.1, snapedEnd - initialStart);
      
      clip.duration = proposedDuration;
    } else {
      // Move clip
      let proposedStart = initialStart + deltaTime;
      proposedStart = Math.max(0.0, proposedStart);
      
      // Apply snap to neighbors or playhead
      const snaped = getSnapPosition(proposedStart, clip.duration, clip.id, trackId);
      clip.start = snaped;
    }
    
    // Fast update UI layouts instantly
    clipEl.style.left = `${clip.start * pxPerSecond}px`;
    clipEl.style.width = `${clip.duration * pxPerSecond}px`;
    
    updatePropertiesInspector();
    drawFrame();
  }
  
  function handleMouseUp() {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    saveState();
    renderTimeline();
  }
  
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
}

// Snapping algorithm to line up clips cleanly with neighboring boundaries or playhead
function getSnapPosition(time, duration, excludeClipId, trackId) {
  const snapThreshold = 0.2; // seconds
  let minDiff = snapThreshold;
  let targetTime = time;
  
  // Snap to playhead
  if (Math.abs(time - playheadTime) < minDiff) {
    minDiff = Math.abs(time - playheadTime);
    targetTime = playheadTime;
  }
  // Snap right edge of current clip to playhead
  if (duration > 0 && Math.abs((time + duration) - playheadTime) < minDiff) {
    minDiff = Math.abs((time + duration) - playheadTime);
    targetTime = playheadTime - duration;
  }
  
  // Snap to adjacent clips in the same track
  const track = project.tracks.find(t => t.id === trackId);
  if (track) {
    track.clips.forEach(neighbor => {
      if (neighbor.id === excludeClipId) return;
      
      const neighborStart = neighbor.start;
      const neighborEnd = neighbor.start + neighbor.duration;
      
      // Left edge snap to neighbor's right edge
      if (Math.abs(time - neighborEnd) < minDiff) {
        minDiff = Math.abs(time - neighborEnd);
        targetTime = neighborEnd;
      }
      
      // Right edge snap to neighbor's left edge
      if (duration > 0 && Math.abs((time + duration) - neighborStart) < minDiff) {
        minDiff = Math.abs((time + duration) - neighborStart);
        targetTime = neighborStart - duration;
      }
      
      // Alignment snap
      if (Math.abs(time - neighborStart) < minDiff) {
        minDiff = Math.abs(time - neighborStart);
        targetTime = neighborStart;
      }
    });
  }
  
  return targetTime;
}

// PLAYHEAD TIME MANAGEMENT
function handleRulerSeek(e) {
  const rect = document.getElementById('timeRuler').getBoundingClientRect();
  const scrollLeft = document.getElementById('timelineWrapper').scrollLeft;
  
  function updateSeek(clientX) {
    const offsetX = clientX - rect.left + scrollLeft;
    const seekVal = Math.max(0.0, offsetX / pxPerSecond);
    seekTime(seekVal);
  }
  
  updateSeek(e.clientX);
  
  function handleMouseMove(moveEvent) {
    updateSeek(moveEvent.clientX);
  }
  
  function handleMouseUp() {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }
  
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
}

function seekTime(time) {
  // Bound to project total length
  playheadTime = Math.max(0.0, time);
  
  // Lock playhead inside total tracks limit unless track is empty
  const maxLimit = Math.max(10, project.duration);
  if (playheadTime > maxLimit) playheadTime = maxLimit;
  
  updatePlayheadPosition();
  
  // Sync hidden audio players
  syncHiddenAudioPlayers();
  
  drawFrame();
}

function updatePlayheadPosition() {
  const left = playheadTime * pxPerSecond;
  document.getElementById('timelinePlayhead').style.left = `${left}px`;
  document.getElementById('timeCurrent').textContent = formatFullTimeCode(playheadTime);
  
  // Auto scroll timeline container to keep playhead in view
  const wrapper = document.getElementById('timelineWrapper');
  const playheadX = left;
  const viewLeft = wrapper.scrollLeft;
  const viewWidth = wrapper.clientWidth - 120; // subtracting track label column width
  
  if (playheadX > (viewLeft + viewWidth)) {
    wrapper.scrollLeft = playheadX - viewWidth + 100;
  } else if (playheadX < viewLeft) {
    wrapper.scrollLeft = Math.max(0, playheadX - 100);
  }
}

function syncHiddenAudioPlayers() {
  // Scan voice & music tracks
  const audioTracks = ['voice', 'music', 'video_main', 'video_overlay'];
  
  audioTracks.forEach(trackId => {
    const track = project.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    track.clips.forEach(clip => {
      const asset = project.assets.find(a => a.id === clip.assetId);
      if (!asset || (asset.type !== 'audio' && asset.type !== 'video')) return;
      
      const el = getAssetElement(asset);
      if (!el) return;
      
      const clipActive = (playheadTime >= clip.start && playheadTime < (clip.start + clip.duration));
      
      if (clipActive) {
        const offset = clip.trimStart || 0.0;
        const speed = clip.speed || 1.0;
        const elapsed = playheadTime - clip.start;
        const targetTime = offset + elapsed * speed;
        
        // Sync volume
        const vol = clip.muted ? 0.0 : (clip.volume !== undefined ? clip.volume : 1.0);
        el.volume = vol;
        
        // Only set currentTime if playing or significantly desynced
        if (!isPlaying || Math.abs(el.currentTime - targetTime) > 0.15) {
          el.currentTime = targetTime;
        }
        
        // Play audio if editor is playing
        if (isPlaying && el.paused) {
          // Play audio safe fallback handling autoplay block restrictions
          el.play().catch(err => console.log("Hidden audio player autoplay blocked:", err));
        } else if (!isPlaying && !el.paused) {
          el.pause();
        }
      } else {
        // Stop audio clip if not active
        if (!el.paused) el.pause();
      }
    });
  });
}

// PLAYBACK PLAY LOOP
function togglePlayPause() {
  if (isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (isPlaying) return;
  isPlaying = true;
  document.getElementById('btnPlayPause').innerHTML = '<i class="fa-solid fa-pause"></i>';
  document.getElementById('btnPlayPause').classList.add('playing');
  
  // Fast trigger play on hidden audio nodes
  syncHiddenAudioPlayers();
  
  let lastTime = performance.now();
  
  function playFrame(now) {
    if (!isPlaying) return;
    
    const delta = (now - lastTime) / 1000.0;
    lastTime = now;
    
    playheadTime += delta;
    
    // Stop at end boundary of project
    const maxLimit = Math.max(1.0, project.duration);
    if (playheadTime >= maxLimit) {
      playheadTime = maxLimit;
      pausePlayback();
    }
    
    updatePlayheadPosition();
    drawFrame();
    
    animationFrameId = requestAnimationFrame(playFrame);
  }
  
  animationFrameId = requestAnimationFrame(playFrame);
}

function pausePlayback() {
  if (!isPlaying) return;
  isPlaying = false;
  document.getElementById('btnPlayPause').innerHTML = '<i class="fa-solid fa-play"></i>';
  document.getElementById('btnPlayPause').classList.remove('playing');
  
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Pause all playing audio elements
  syncHiddenAudioPlayers();
}

// CANVAS DRAW PREVIEW IN 9:16
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const W = 1080;
const H = 1920;

// Direct Canvas Manipulation State
let isDraggingCanvasLayer = false;
let isScalingCanvasLayer = false;
let isRotatingCanvasLayer = false;
let canvasActiveHandle = null;
let canvasInteractionStartX = 0;
let canvasInteractionStartY = 0;
let canvasOriginalClipState = null;

if (canvas) {
  canvas.addEventListener('mousedown', handleCanvasMousedown);
  window.addEventListener('mousemove', handleCanvasMousemove);
  window.addEventListener('mouseup', handleCanvasMouseup);
}

// Map handles for bounding box (8 corners/midpoints + 1 rotation)
const transformHandles = [
  { id: 'tl', cursor: 'nwse-resize' },
  { id: 't', cursor: 'ns-resize' },
  { id: 'tr', cursor: 'nesw-resize' },
  { id: 'r', cursor: 'ew-resize' },
  { id: 'br', cursor: 'nwse-resize' },
  { id: 'b', cursor: 'ns-resize' },
  { id: 'bl', cursor: 'nesw-resize' },
  { id: 'l', cursor: 'ew-resize' },
  { id: 'rot', cursor: 'grab' }
];

function getEventCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function handleCanvasMousedown(e) {
  if (window.isDrawingWatermarkActive) return; // don't interfere with watermark tool
  const coords = getEventCanvasCoords(e);

  if (activeClip && (activeClip.type === 'video' || activeClip.type === 'overlay' || activeClip.type === 'image' || activeClip.type === 'text')) {
    // Check if clicked on a handle
    const handle = getHandleAtPos(coords.x, coords.y, activeClip);
    if (handle) {
      e.preventDefault();
      canvasActiveHandle = handle;
      if (handle.id === 'rot') isRotatingCanvasLayer = true;
      else isScalingCanvasLayer = true;

      canvasInteractionStartX = coords.x;
      canvasInteractionStartY = coords.y;
      canvasOriginalClipState = { x: activeClip.x || W/2, y: activeClip.y || H/2, scale: activeClip.scale || 1.0, rotation: activeClip.rotation || 0 };
      return;
    }

    // Check if clicked inside active clip bounds
    if (isPosInsideClip(coords.x, coords.y, activeClip)) {
      e.preventDefault();
      isDraggingCanvasLayer = true;
      canvasInteractionStartX = coords.x;
      canvasInteractionStartY = coords.y;
      canvasOriginalClipState = { x: activeClip.x || W/2, y: activeClip.y || H/2 };
      return;
    }
  }

  // If we clicked outside, try to select a clip
  const clickedClip = findClipAtPos(coords.x, coords.y);
  if (clickedClip) {
    selectClip(clickedClip.id);
  } else {
    // Deselect if clicking empty space
    document.querySelectorAll('.timeline-clip').forEach(el => el.classList.remove('selected'));
    activeClip = null;
    hidePropertyInspector();
  }
  renderCanvas();
}

function handleCanvasMousemove(e) {
  if (!isDraggingCanvasLayer && !isScalingCanvasLayer && !isRotatingCanvasLayer) {
    // Just hover effects for cursor
    if (canvas && activeClip && !window.isDrawingWatermarkActive) {
      const coords = getEventCanvasCoords(e);
      const handle = getHandleAtPos(coords.x, coords.y, activeClip);
      if (handle) {
        canvas.style.cursor = handle.cursor;
      } else if (isPosInsideClip(coords.x, coords.y, activeClip)) {
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'default';
      }
    }
    return;
  }

  const coords = getEventCanvasCoords(e);
  const dx = coords.x - canvasInteractionStartX;
  const dy = coords.y - canvasInteractionStartY;

  // Physics-based easing applied to dragging
  const easeFactor = 0.85;

  if (isDraggingCanvasLayer && activeClip) {
    activeClip.x = canvasOriginalClipState.x + (dx * easeFactor);
    activeClip.y = canvasOriginalClipState.y + (dy * easeFactor);
    updateInspectorFields();
    renderCanvas();
  } else if (isScalingCanvasLayer && activeClip) {
    // Basic scaling based on Y drag (pull down to enlarge)
    const scaleDelta = dy * 0.005 * easeFactor;
    activeClip.scale = Math.max(0.1, canvasOriginalClipState.scale - scaleDelta);
    updateInspectorFields();
    renderCanvas();
  } else if (isRotatingCanvasLayer && activeClip) {
    // Rotate based on X drag
    const rotDelta = dx * 0.5 * easeFactor;
    activeClip.rotation = canvasOriginalClipState.rotation + rotDelta;
    updateInspectorFields();
    renderCanvas();
  }
}

function handleCanvasMouseup(e) {
  if (isDraggingCanvasLayer || isScalingCanvasLayer || isRotatingCanvasLayer) {
    isDraggingCanvasLayer = false;
    isScalingCanvasLayer = false;
    isRotatingCanvasLayer = false;
    canvasActiveHandle = null;
    saveState(); // Save to undo stack when interaction finishes
    // Slight "snap" finish
    renderCanvas();
  }
}

function getClipRect(clip) {
  // Rough bounding box approximation for click detection
  const x = clip.x || W/2;
  const y = clip.y || H/2;
  const scale = clip.scale || 1.0;

  // Default bounds
  let cw = 800 * scale;
  let ch = 800 * scale;

  if (clip.trackId === 'text' || clip.type === 'text') {
    cw = 600 * scale;
    ch = 200 * scale;
  }

  return { left: x - cw/2, right: x + cw/2, top: y - ch/2, bottom: y + ch/2, w: cw, h: ch, cx: x, cy: y };
}

function isPosInsideClip(x, y, clip) {
  if (!clip) return false;
  // Simplistic rect check, ignores rotation for now for click-selection ease
  const rect = getClipRect(clip);
  return (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
}

function getHandleAtPos(x, y, clip) {
  if (!clip) return null;
  const rect = getClipRect(clip);
  const hs = 40; // handle hit size in canvas pixels

  const handles = [
    { id: 'tl', x: rect.left, y: rect.top, cursor: 'nwse-resize' },
    { id: 'tr', x: rect.right, y: rect.top, cursor: 'nesw-resize' },
    { id: 'bl', x: rect.left, y: rect.bottom, cursor: 'nesw-resize' },
    { id: 'br', x: rect.right, y: rect.bottom, cursor: 'nwse-resize' },
    { id: 't', x: rect.cx, y: rect.top, cursor: 'ns-resize' },
    { id: 'b', x: rect.cx, y: rect.bottom, cursor: 'ns-resize' },
    { id: 'l', x: rect.left, y: rect.cy, cursor: 'ew-resize' },
    { id: 'r', x: rect.right, y: rect.cy, cursor: 'ew-resize' },
    { id: 'rot', x: rect.cx, y: rect.top - 80, cursor: 'grab' } // rotation handle above top middle
  ];

  for (let h of handles) {
    if (Math.abs(x - h.x) < hs && Math.abs(y - h.y) < hs) return h;
  }
  return null;
}

function findClipAtPos(x, y) {
  if (!project) return null;
  const currentTime = playheadTime;

  // Search in reverse draw order (top layers first)
  const drawOrder = ['captions', 'text', 'image_overlay', 'video_overlay', 'video_main'];

  for (let trackId of drawOrder) {
    const track = project.tracks.find(t => t.id === trackId);
    if (!track) continue;

    // Find active clip on this track at current time
    for (let clip of track.clips) {
      if (currentTime >= clip.start && currentTime < (clip.start + clip.duration)) {
        if (isPosInsideClip(x, y, clip)) {
          return clip;
        }
      }
    }
  }
  return null;
}

function updateInspectorFields() {
  if (!activeClip) return;
  const elX = document.getElementById('prop-x');
  const elY = document.getElementById('prop-y');
  const elScale = document.getElementById('prop-scale');
  const elRot = document.getElementById('prop-rot');

  if (elX) elX.value = activeClip.x || W/2;
  if (elY) elY.value = activeClip.y || H/2;
  if (elScale) elScale.value = activeClip.scale || 1.0;
  if (elRot) elRot.value = activeClip.rotation || 0;
}

function drawFrame() {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  
  if (!project) return;
  
  const currentTime = playheadTime;
  const drawOrder = ['video_main', 'video_overlay', 'image_overlay', 'text', 'captions'];
  
  drawOrder.forEach(trackId => {
    const track = project.tracks.find(t => t.id === trackId);
    if (!track) return;
    
    track.clips.forEach(clip => {
      if (currentTime >= clip.start && currentTime < (clip.start + clip.duration)) {
        drawClipElement(clip, trackId, currentTime);
      }
    });
  });
}

function drawClipElement(clip, trackId, currentTime) {
  const asset = project.assets.find(a => a.id === clip.assetId);
  const el = asset ? getAssetElement(asset) : null;
  
  ctx.save();
  
  // Apply opacity
  ctx.globalAlpha = clip.opacity !== undefined ? clip.opacity : 1.0;
  
  // Sizing & scaling translation
  const x = clip.x !== undefined ? clip.x : W / 2;
  const y = clip.y !== undefined ? clip.y : H / 2;
  ctx.translate(x, y);
  
  const scale = clip.scale !== undefined ? clip.scale : 1.0;
  const rotation = clip.rotation !== undefined ? clip.rotation : 0;
  
  if (rotation !== 0) {
    ctx.rotate(rotation * Math.PI / 180);
  }
  
  if (trackId === 'video_main' || trackId === 'video_overlay') {
    if (el && el.readyState >= 2) {
      const offset = clip.trimStart || 0.0;
      const speed = clip.speed || 1.0;
      const elapsed = currentTime - clip.start;
      const targetTime = offset + elapsed * speed;
      
      if (Math.abs(el.currentTime - targetTime) > 0.2) {
        el.currentTime = targetTime;
      }
      
      // Draw canvas styling filter
      applyCanvasFilter(clip.filter);
      
      const cropMode = clip.cropMode || 'cover';
      drawFittedImage(el, cropMode, scale);
    } else {
      ctx.fillStyle = '#141424';
      ctx.fillRect(-W/2, -H/2, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = '36px Outfit';
      ctx.textAlign = 'center';
      ctx.fillText(asset ? asset.name : "Loading...", 0, 0);
    }
  } else if (trackId === 'image_overlay') {
    if (el && el.complete) {
      const cropMode = clip.cropMode || 'contain';
      drawFittedImage(el, cropMode, scale);
    } else {
      ctx.fillStyle = 'rgba(255, 165, 0, 0.4)';
      ctx.fillRect(-100, -100, 200, 200);
      ctx.strokeRect(-100, -100, 200, 200);
    }
  } else if (trackId === 'text') {
    drawTextBlockOnCanvas(clip, scale);
  } else if (trackId === 'captions') {
    drawCaptionBlockOnCanvas(clip, scale, currentTime);
  } else if (trackId === 'video_overlay' && clip.type === 'overlay') {
    // Dynamic Template Rendering on HTML5 canvas
    drawDynamicOverlayOnCanvas(clip, scale, currentTime);
  }
  
  ctx.restore();

  // If this clip is actively selected, draw the transform handles over it
  if (activeClip && activeClip.id === clip.id && !window.isDrawingWatermarkActive) {
      drawTransformHandles(clip);
  }
}

function drawTransformHandles(clip) {
    ctx.save();
    const rect = getClipRect(clip);

    // Draw bounding box
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 4;
    ctx.strokeRect(rect.left, rect.top, rect.w, rect.h);

    // Draw 8 handles + rotation handle
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    const hs = 16; // visual handle size

    const handles = [
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.top },
      { x: rect.left, y: rect.bottom },
      { x: rect.right, y: rect.bottom },
      { x: rect.cx, y: rect.top },
      { x: rect.cx, y: rect.bottom },
      { x: rect.left, y: rect.cy },
      { x: rect.right, y: rect.cy },
      { x: rect.cx, y: rect.top - 80, isRot: true }
    ];

    for (let h of handles) {
        if (h.isRot) {
            ctx.beginPath();
            ctx.arc(h.x, h.y, hs, 0, 2*Math.PI);
            ctx.fill();
            ctx.stroke();
            // Draw connecting line to top center
            ctx.beginPath();
            ctx.moveTo(rect.cx, rect.top);
            ctx.lineTo(h.x, h.y + hs);
            ctx.stroke();
        } else {
            ctx.fillRect(h.x - hs/2, h.y - hs/2, hs, hs);
            ctx.strokeRect(h.x - hs/2, h.y - hs/2, hs, hs);
        }
    }
    ctx.restore();
}

function applyCanvasFilter(filter) {
  if (!filter || filter === 'none') {
    ctx.filter = 'none';
    return;
  }
  
  if (filter === 'grayscale') ctx.filter = 'grayscale(100%)';
  else if (filter === 'blur') ctx.filter = 'blur(10px)';
  else if (filter === 'vintage') ctx.filter = 'sepia(60%) hue-rotate(-10deg) saturate(120%)';
  else if (filter === 'warm') ctx.filter = 'sepia(20%) saturate(140%)';
  else if (filter === 'cool') ctx.filter = 'hue-rotate(30deg) saturate(120%)';
  else ctx.filter = 'none';
}

function drawFittedImage(img, cropMode, scale) {
  let sw = img.videoWidth || img.naturalWidth || img.width || W;
  let sh = img.videoHeight || img.naturalHeight || img.height || H;
  
  if (cropMode === 'cover') {
    const s = Math.max(W / sw, H / sh) * scale;
    const dw = sw * s;
    const dh = sh * s;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else if (cropMode === 'contain') {
    const s = Math.min(W / sw, H / sh) * scale;
    const dw = sw * s;
    const dh = sh * s;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.drawImage(img, -W/2 * scale, -H/2 * scale, W * scale, H * scale);
  }
}

function drawTextBlockOnCanvas(clip, scale) {
  const lines = (clip.text || '').split('\n');
  const fontSize = (clip.fontSize || 80) * scale;
  const fontFamily = fontMapping[clip.fontFamily || 'impact'] || 'sans-serif';
  
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  
  let maxW = 0;
  lines.forEach(line => {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  });
  
  const padX = 24 * scale;
  const padY = 20 * scale;
  const boxW = maxW + padX * 2;
  const boxH = (fontSize + 12 * scale) * lines.length - 12 * scale + padY * 2;
  
  // Background box
  if (clip.backgroundColor) {
    ctx.fillStyle = hexToRgbaStr(clip.backgroundColor, (clip.backgroundOpacity !== undefined ? clip.backgroundOpacity : 140) / 255);
    drawRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 16 * scale);
  }
  
  ctx.textBaseline = 'middle';
  
  let currentY = -boxH / 2 + padY + fontSize / 2;
  lines.forEach(line => {
    const metrics = ctx.measureText(line);
    let lx = -boxW / 2 + padX;
    if (clip.alignment === 'center') {
      lx = -metrics.width / 2;
    } else if (clip.alignment === 'right') {
      lx = boxW / 2 - padX - metrics.width;
    }
    
    // Draw thick outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 8 * scale;
    ctx.strokeText(line, lx, currentY);
    
    ctx.fillStyle = clip.color || '#ffffff';
    ctx.fillText(line, lx, currentY);
    
    currentY += fontSize + 12 * scale;
  });
}

function drawCaptionBlockOnCanvas(clip, scale, currentTime) {
  const text = clip.text || '';
  const style = clip.style || {};
  const fontSize = (style.fontSize || 80) * scale;
  const fontFamily = fontMapping[style.fontFamily || 'impact'] || 'sans-serif';
  const highlightColor = style.highlightColor || '#FFCC00';
  
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  
  // If words array exists, we do kinetic word-by-word rendering
  if (clip.words && clip.words.length > 0) {
    const padX = 42 * scale;
    const padY = 30 * scale;

    // measure total width
    const words = clip.words;
    let totalW = 0;
    const wordMetrics = [];
    words.forEach((wObj, idx) => {
      const w = ctx.measureText(wObj.word).width;
      const space = idx < words.length - 1 ? ctx.measureText(" ").width : 0;
      wordMetrics.push({ width: w, space: space, ...wObj });
      totalW += w + space;
    });

    const boxW = totalW + padX * 2;
    const boxH = fontSize + padY * 2;

    // Render pill box centered
    const pillColor = style.pillColor || '#000000';
    const pillOpacity = style.pillOpacity !== undefined ? style.pillOpacity : 140;
    ctx.fillStyle = hexToRgbaStr(pillColor, pillOpacity / 255);
    drawRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 32 * scale);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    let currentX = -totalW / 2;

    // Draw each word
    wordMetrics.forEach(wObj => {
      const isActive = currentTime >= wObj.start && currentTime <= wObj.end;

      ctx.save();
      ctx.translate(currentX + wObj.width / 2, 0);

      // Kinetic effects for active word
      if (isActive) {
        // scale pop effect
        const t = (currentTime - wObj.start) / Math.max(wObj.end - wObj.start, 0.01);
        // quick pop out then settle
        const scalePop = 1.0 + Math.sin(t * Math.PI) * 0.15;
        ctx.scale(scalePop, scalePop);

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 14 * scale;
        ctx.strokeText(wObj.word, -wObj.width / 2, 0);

        ctx.fillStyle = highlightColor; // highlight neon
        // add glow
        ctx.shadowColor = highlightColor;
        ctx.shadowBlur = 10 * scale;
      } else {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 10 * scale;
        ctx.strokeText(wObj.word, -wObj.width / 2, 0);
        ctx.fillStyle = style.textColor || '#ffffff';
      }

      ctx.fillText(wObj.word, -wObj.width / 2, 0);
      ctx.restore();

      currentX += wObj.width + wObj.space;
    });

  } else {
    // Fallback static caption render
    const textW = ctx.measureText(text).width;
    const padX = 42 * scale;
    const padY = 30 * scale;
    const boxW = textW + padX * 2;
    const boxH = fontSize + padY * 2;

    const pillColor = style.pillColor || '#000000';
    const pillOpacity = style.pillOpacity !== undefined ? style.pillOpacity : 140;
    ctx.fillStyle = hexToRgbaStr(pillColor, pillOpacity / 255);
    drawRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 32 * scale);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 10 * scale;
    ctx.strokeText(text, 0, 0);

    ctx.fillStyle = style.textColor || '#ffffff';
    ctx.fillText(text, 0, 0);
  }
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// PROPERTIES CONTROL INSPECTOR
function selectClip(clipId) {
  // Remove highlighted css selection
  document.querySelectorAll('.timeline-clip').forEach(el => el.classList.remove('selected'));
  
  if (!clipId) {
    activeClip = null;
    document.querySelectorAll('.properties-section').forEach(s => s.classList.remove('active'));
    document.getElementById('properties-project').classList.add('active');
    return;
  }
  
  // Find clip in tracks data
  let foundClip = null;
  let foundTrackId = null;
  project.tracks.forEach(track => {
    const c = track.clips.find(x => x.id === clipId);
    if (c) {
      foundClip = c;
      foundTrackId = track.id;
    }
  });
  
  if (!foundClip) return;
  
  activeClip = foundClip;
  
  // Toggle selection highlight in timeline
  const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clipId}"]`);
  if (clipEl) clipEl.classList.add('selected');
  
  // Activate section inspector UI
  document.querySelectorAll('.properties-section').forEach(s => s.classList.remove('active'));
  
  if (foundClip.type === 'overlay') {
    document.getElementById('properties-overlay').classList.add('active');
  } else if (foundTrackId === 'video_main' || foundTrackId === 'video_overlay') {
    document.getElementById('properties-video').classList.add('active');
  } else if (foundTrackId === 'image_overlay') {
    document.getElementById('properties-image').classList.add('active');
  } else if (foundTrackId === 'text') {
    document.getElementById('properties-text').classList.add('active');
  } else if (foundTrackId === 'voice' || foundTrackId === 'music') {
    document.getElementById('properties-audio').classList.add('active');
  }
  
  updatePropertiesInspector();
}

function updatePropertiesInspector() {
  if (!activeClip) return;
  
  // Fill values dynamically
  // Overlay Clip
  if (document.getElementById('properties-overlay').classList.contains('active')) {
    const container = document.getElementById('dynamic-overlay-fields');
    container.innerHTML = '';

    // Duration
    container.innerHTML += `
      <div class="prop-group">
        <label>Duration (s)</label>
        <input type="number" step="0.1" value="${activeClip.duration}" onchange="updateActiveClipProperty('duration', parseFloat(this.value)); renderTimeline();">
      </div>
    `;

    if (activeClip.template === 'social_follow') {
      container.innerHTML += `
        <div class="prop-group">
          <label>Avatar Image</label>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <input type="file" id="overlayAvatarUpload" accept="image/png, image/jpeg" style="display:none;" onchange="uploadOverlayAvatar(event, '${activeClip.id}')">
            <button class="btn" style="padding: 4px 8px; font-size: 0.8rem;" onclick="document.getElementById('overlayAvatarUpload').click()">Upload Image</button>
            <span id="overlayAvatarLabel" style="font-size: 0.8rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 120px;">
               ${activeClip.properties.avatar_path ? 'Custom Avatar' : 'Default Circle'}
            </span>
          </div>
        </div>
        <div class="prop-group">
          <label>Username</label>
          <input type="text" value="${activeClip.properties.username || '@username'}" onchange="updateActiveClipProperty('properties', { ...activeClip.properties, username: this.value })">
        </div>
        <div class="prop-group">
          <label>Accent Color</label>
          <input type="color" value="${activeClip.properties.accent_color || '#A855F7'}" onchange="updateActiveClipProperty('properties', { ...activeClip.properties, accent_color: this.value })">
        </div>
      `;
    } else if (activeClip.template === 'call_to_action') {
      container.innerHTML += `
        <div class="prop-group">
          <label>Text</label>
          <input type="text" value="${activeClip.properties.text || 'LINK IN BIO'}" onchange="updateActiveClipProperty('properties', { ...activeClip.properties, text: this.value })">
        </div>
        <div class="prop-group">
          <label>Accent Color</label>
          <input type="color" value="${activeClip.properties.accent_color || '#3B82F6'}" onchange="updateActiveClipProperty('properties', { ...activeClip.properties, accent_color: this.value })">
        </div>
      `;
    }
  }

  // Video Clip
  else if (document.getElementById('properties-video').classList.contains('active')) {
    document.getElementById('propVideoCropMode').value = activeClip.cropMode || 'cover';
    document.getElementById('propVideoScale').value = activeClip.scale !== undefined ? activeClip.scale : 1.0;
    document.getElementById('propVideoRotation').value = activeClip.rotation !== undefined ? activeClip.rotation : 0;
    document.getElementById('propVideoX').value = activeClip.x !== undefined ? activeClip.x : 540;
    document.getElementById('propVideoY').value = activeClip.y !== undefined ? activeClip.y : 960;
    
    const opacityPct = Math.round((activeClip.opacity !== undefined ? activeClip.opacity : 1.0) * 100);
    document.getElementById('propVideoOpacity').value = opacityPct;
    document.getElementById('valVideoOpacity').textContent = opacityPct;
    
    document.getElementById('propVideoStart').value = parseFloat(activeClip.start).toFixed(2);
    document.getElementById('propVideoDuration').value = parseFloat(activeClip.duration).toFixed(2);
    document.getElementById('propVideoTrimStart').value = parseFloat(activeClip.trimStart || 0.0).toFixed(2);
    document.getElementById('propVideoSpeed').value = activeClip.speed !== undefined ? activeClip.speed.toString() : "1.0";
    
    const volumePct = Math.round((activeClip.volume !== undefined ? activeClip.volume : 1.0) * 100);
    document.getElementById('propVideoVolume').value = volumePct;
    document.getElementById('valVideoVolume').textContent = volumePct;
    document.getElementById('propVideoMuted').checked = !!activeClip.muted;
  }
  // Image Clip
  else if (document.getElementById('properties-image').classList.contains('active')) {
    document.getElementById('propImageScale').value = activeClip.scale !== undefined ? activeClip.scale : 1.0;
    document.getElementById('propImageRotation').value = activeClip.rotation !== undefined ? activeClip.rotation : 0;
    document.getElementById('propImageX').value = activeClip.x !== undefined ? activeClip.x : 540;
    document.getElementById('propImageY').value = activeClip.y !== undefined ? activeClip.y : 960;
    
    const opacityPct = Math.round((activeClip.opacity !== undefined ? activeClip.opacity : 1.0) * 100);
    document.getElementById('propImageOpacity').value = opacityPct;
    document.getElementById('valImageOpacity').textContent = opacityPct;
    
    document.getElementById('propImageStart').value = parseFloat(activeClip.start).toFixed(2);
    document.getElementById('propImageDuration').value = parseFloat(activeClip.duration).toFixed(2);
  }
  // Text Clip
  else if (document.getElementById('properties-text').classList.contains('active')) {
    document.getElementById('propTextContent').value = activeClip.text || '';
    document.getElementById('propTextSize').value = activeClip.fontSize || 80;
    document.getElementById('propTextFontFamily').value = activeClip.fontFamily || 'impact';
    document.getElementById('propTextColor').value = activeClip.color || '#ffffff';
    document.getElementById('propTextAlignment').value = activeClip.alignment || 'center';
    document.getElementById('propTextUseBg').checked = !!activeClip.backgroundColor;
    document.getElementById('propTextBgColor').value = activeClip.backgroundColor || '#000000';
    document.getElementById('propTextBgOpacity').value = activeClip.backgroundOpacity !== undefined ? activeClip.backgroundOpacity : 140;
    
    document.getElementById('propTextX').value = activeClip.x !== undefined ? activeClip.x : 540;
    document.getElementById('propTextY').value = activeClip.y !== undefined ? activeClip.y : 960;
    document.getElementById('propTextStart').value = parseFloat(activeClip.start).toFixed(2);
    document.getElementById('propTextDuration').value = parseFloat(activeClip.duration).toFixed(2);
    
    toggleTextBgColorWrapper();
  }
  // Audio Clip
  else if (document.getElementById('properties-audio').classList.contains('active')) {
    const volumePct = Math.round((activeClip.volume !== undefined ? activeClip.volume : 1.0) * 100);
    document.getElementById('propAudioVolume').value = volumePct;
    document.getElementById('valAudioVolume').textContent = volumePct;
    document.getElementById('propAudioMuted').checked = !!activeClip.muted;
    
    document.getElementById('propAudioFadeIn').value = activeClip.fadeIn || 0.0;
    document.getElementById('propAudioFadeOut').value = activeClip.fadeOut || 0.0;
    document.getElementById('propAudioStart').value = parseFloat(activeClip.start).toFixed(2);
    document.getElementById('propAudioDuration').value = parseFloat(activeClip.duration).toFixed(2);
    document.getElementById('propAudioTrimStart').value = parseFloat(activeClip.trimStart || 0.0).toFixed(2);
  }
}

function bindPropertiesInspector() {
  // Video handlers
  document.getElementById('propVideoCropMode').addEventListener('change', (e) => {
    if (activeClip) { activeClip.cropMode = e.target.value; saveState(); }
  });
  document.getElementById('propVideoScale').addEventListener('input', (e) => {
    if (activeClip) { activeClip.scale = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propVideoScale').addEventListener('change', () => saveState());
  
  document.getElementById('propVideoRotation').addEventListener('input', (e) => {
    if (activeClip) { activeClip.rotation = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propVideoRotation').addEventListener('change', () => saveState());
  
  document.getElementById('propVideoX').addEventListener('input', (e) => {
    if (activeClip) { activeClip.x = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propVideoX').addEventListener('change', () => saveState());
  
  document.getElementById('propVideoY').addEventListener('input', (e) => {
    if (activeClip) { activeClip.y = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propVideoY').addEventListener('change', () => saveState());
  
  document.getElementById('propVideoOpacity').addEventListener('input', (e) => {
    if (activeClip) {
      activeClip.opacity = parseFloat(e.target.value) / 100.0;
      document.getElementById('valVideoOpacity').textContent = e.target.value;
      drawFrame();
    }
  });
  document.getElementById('propVideoOpacity').addEventListener('change', () => saveState());
  
  document.getElementById('propVideoStart').addEventListener('change', (e) => {
    if (activeClip) {
      activeClip.start = Math.max(0.0, parseFloat(e.target.value));
      saveState();
      renderTimeline();
    }
  });
  document.getElementById('propVideoDuration').addEventListener('change', (e) => {
    if (activeClip) {
      activeClip.duration = Math.max(0.1, parseFloat(e.target.value));
      saveState();
      renderTimeline();
    }
  });
  document.getElementById('propVideoTrimStart').addEventListener('change', (e) => {
    if (activeClip) {
      activeClip.trimStart = Math.max(0.0, parseFloat(e.target.value));
      saveState();
    }
  });
  document.getElementById('propVideoSpeed').addEventListener('change', (e) => {
    if (activeClip) {
      activeClip.speed = parseFloat(e.target.value);
      saveState();
    }
  });
  document.getElementById('propVideoVolume').addEventListener('input', (e) => {
    if (activeClip) {
      activeClip.volume = parseFloat(e.target.value) / 100.0;
      document.getElementById('valVideoVolume').textContent = e.target.value;
      syncHiddenAudioPlayers();
    }
  });
  document.getElementById('propVideoVolume').addEventListener('change', () => saveState());
  document.getElementById('propVideoMuted').addEventListener('change', (e) => {
    if (activeClip) {
      activeClip.muted = e.target.checked;
      saveState();
      syncHiddenAudioPlayers();
    }
  });

  // Image handlers
  document.getElementById('propImageScale').addEventListener('input', (e) => {
    if (activeClip) { activeClip.scale = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propImageScale').addEventListener('change', () => saveState());
  document.getElementById('propImageRotation').addEventListener('input', (e) => {
    if (activeClip) { activeClip.rotation = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propImageRotation').addEventListener('change', () => saveState());
  document.getElementById('propImageX').addEventListener('input', (e) => {
    if (activeClip) { activeClip.x = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propImageX').addEventListener('change', () => saveState());
  document.getElementById('propImageY').addEventListener('input', (e) => {
    if (activeClip) { activeClip.y = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propImageY').addEventListener('change', () => saveState());
  document.getElementById('propImageOpacity').addEventListener('input', (e) => {
    if (activeClip) {
      activeClip.opacity = parseFloat(e.target.value) / 100.0;
      document.getElementById('valImageOpacity').textContent = e.target.value;
      drawFrame();
    }
  });
  document.getElementById('propImageOpacity').addEventListener('change', () => saveState());
  document.getElementById('propImageStart').addEventListener('change', (e) => {
    if (activeClip) { activeClip.start = Math.max(0.0, parseFloat(e.target.value)); saveState(); renderTimeline(); }
  });
  document.getElementById('propImageDuration').addEventListener('change', (e) => {
    if (activeClip) { activeClip.duration = Math.max(0.1, parseFloat(e.target.value)); saveState(); renderTimeline(); }
  });

  // Text handlers
  document.getElementById('propTextContent').addEventListener('input', (e) => {
    if (activeClip) {
      activeClip.text = e.target.value;
      
      // Update element clip timeline box name
      const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${activeClip.id}"] span`);
      if (clipEl) {
        let nameText = e.target.value || "Text";
        clipEl.textContent = nameText.length > 25 ? nameText.substring(0, 22) + "..." : nameText;
      }
      drawFrame();
    }
  });
  document.getElementById('propTextContent').addEventListener('change', () => saveState());
  
  document.getElementById('propTextSize').addEventListener('input', (e) => {
    if (activeClip) { activeClip.fontSize = parseInt(e.target.value) || 20; drawFrame(); }
  });
  document.getElementById('propTextSize').addEventListener('change', () => saveState());
  
  document.getElementById('propTextFontFamily').addEventListener('change', (e) => {
    if (activeClip) { activeClip.fontFamily = e.target.value; saveState(); drawFrame(); }
  });
  
  document.getElementById('propTextColor').addEventListener('input', (e) => {
    if (activeClip) { activeClip.color = e.target.value; drawFrame(); }
  });
  document.getElementById('propTextColor').addEventListener('change', () => saveState());
  
  document.getElementById('propTextAlignment').addEventListener('change', (e) => {
    if (activeClip) { activeClip.alignment = e.target.value; saveState(); drawFrame(); }
  });
  
  document.getElementById('propTextUseBg').addEventListener('change', (e) => {
    if (activeClip) {
      activeClip.backgroundColor = e.target.checked ? '#000000' : null;
      toggleTextBgColorWrapper();
      saveState();
      drawFrame();
    }
  });
  
  document.getElementById('propTextBgColor').addEventListener('input', (e) => {
    if (activeClip) { activeClip.backgroundColor = e.target.value; drawFrame(); }
  });
  document.getElementById('propTextBgColor').addEventListener('change', () => saveState());
  
  document.getElementById('propTextBgOpacity').addEventListener('input', (e) => {
    if (activeClip) { activeClip.backgroundOpacity = parseInt(e.target.value); drawFrame(); }
  });
  document.getElementById('propTextBgOpacity').addEventListener('change', () => saveState());
  
  document.getElementById('propTextX').addEventListener('input', (e) => {
    if (activeClip) { activeClip.x = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propTextX').addEventListener('change', () => saveState());
  
  document.getElementById('propTextY').addEventListener('input', (e) => {
    if (activeClip) { activeClip.y = parseFloat(e.target.value); drawFrame(); }
  });
  document.getElementById('propTextY').addEventListener('change', () => saveState());
  
  document.getElementById('propTextStart').addEventListener('change', (e) => {
    if (activeClip) { activeClip.start = Math.max(0.0, parseFloat(e.target.value)); saveState(); renderTimeline(); }
  });
  document.getElementById('propTextDuration').addEventListener('change', (e) => {
    if (activeClip) { activeClip.duration = Math.max(0.1, parseFloat(e.target.value)); saveState(); renderTimeline(); }
  });

  // Audio handlers
  document.getElementById('propAudioVolume').addEventListener('input', (e) => {
    if (activeClip) {
      activeClip.volume = parseFloat(e.target.value) / 100.0;
      document.getElementById('valAudioVolume').textContent = e.target.value;
      syncHiddenAudioPlayers();
    }
  });
  document.getElementById('propAudioVolume').addEventListener('change', () => saveState());
  
  document.getElementById('propAudioMuted').addEventListener('change', (e) => {
    if (activeClip) {
      activeClip.muted = e.target.checked;
      saveState();
      syncHiddenAudioPlayers();
    }
  });
  
  document.getElementById('propAudioFadeIn').addEventListener('change', (e) => {
    if (activeClip) { activeClip.fadeIn = parseFloat(e.target.value) || 0.0; saveState(); }
  });
  document.getElementById('propAudioFadeOut').addEventListener('change', (e) => {
    if (activeClip) { activeClip.fadeOut = parseFloat(e.target.value) || 0.0; saveState(); }
  });
  document.getElementById('propAudioStart').addEventListener('change', (e) => {
    if (activeClip) { activeClip.start = Math.max(0.0, parseFloat(e.target.value)); saveState(); renderTimeline(); }
  });
  document.getElementById('propAudioDuration').addEventListener('change', (e) => {
    if (activeClip) { activeClip.duration = Math.max(0.1, parseFloat(e.target.value)); saveState(); renderTimeline(); }
  });
  document.getElementById('propAudioTrimStart').addEventListener('change', (e) => {
    if (activeClip) { activeClip.trimStart = Math.max(0.0, parseFloat(e.target.value)); saveState(); }
  });

  // Filters tab card trigger click
  document.querySelectorAll('.filter-preset-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!activeClip) return alert("Please select a video clip on the timeline first.");
      
      let foundTrackId = null;
      project.tracks.forEach(track => {
        if (track.clips.some(c => c.id === activeClip.id)) {
          foundTrackId = track.id;
        }
      });
      
      if (foundTrackId !== 'video_main' && foundTrackId !== 'video_overlay') {
        return alert("Filters can only be applied to video clips.");
      }
      
      document.querySelectorAll('.filter-preset-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      const filter = card.getAttribute('data-filter');
      activeClip.filter = filter;
      saveState();
      drawFrame();
    });
  });
  
  // Transitions tab trigger click
  document.querySelectorAll('.transition-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!activeClip) return alert("Please select a video clip first.");
      
      document.querySelectorAll('.transition-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      const trans = card.getAttribute('data-transition');
      activeClip.transition = trans;
      activeClip.transitionDuration = 0.5;
      saveState();
    });
  });
}

function toggleTextBgColorWrapper() {
  const checked = document.getElementById('propTextUseBg').checked;
  document.getElementById('textBgColorWrapper').style.opacity = checked ? '1' : '0.4';
  document.getElementById('textBgColorWrapper').style.pointerEvents = checked ? 'auto' : 'none';
}

// TIMELINE MANIPULATION ACTIONS
function nudgeSelectedClip(amount) {
  if (!activeClip) return;
  activeClip.start = Math.max(0.0, activeClip.start + amount);
  
  // Snaping alignment nudge
  let foundTrackId = null;
  project.tracks.forEach(t => {
    if (t.clips.some(c => c.id === activeClip.id)) foundTrackId = t.id;
  });
  activeClip.start = getSnapPosition(activeClip.start, activeClip.duration, activeClip.id, foundTrackId);
  
  renderTimeline();
  updatePropertiesInspector();
  drawFrame();
  saveState();
}

function splitSelectedClip() {
  if (!activeClip) return alert("Select a clip on the timeline to split.");
  
  // Identify track containing clip
  let targetTrack = null;
  project.tracks.forEach(track => {
    if (track.clips.some(c => c.id === activeClip.id)) targetTrack = track;
  });
  
  if (!targetTrack) return;
  
  // Ignore split if playhead is not intersecting the clip
  if (playheadTime <= activeClip.start || playheadTime >= (activeClip.start + activeClip.duration)) {
    return alert("Move the red playhead line inside the selected clip to split it.");
  }
  
  const cutPoint = playheadTime;
  const originalDuration = activeClip.duration;
  
  // Left half clip (modifies original length)
  const leftDuration = cutPoint - activeClip.start;
  activeClip.duration = leftDuration;
  
  // Right half clip (appended as duplicate copy)
  const rightClip = JSON.parse(JSON.stringify(activeClip));
  rightClip.id = `clip_split_${uuid()}`;
  rightClip.start = cutPoint;
  rightClip.duration = originalDuration - leftDuration;
  
  if (rightClip.trimStart !== undefined) {
    const elapsed = cutPoint - activeClip.start;
    const speed = activeClip.speed || 1.0;
    rightClip.trimStart = (activeClip.trimStart || 0.0) + (elapsed * speed);
  }
  
  targetTrack.clips.push(rightClip);
  
  saveState();
  renderTimeline();
  selectClip(rightClip.id);
  drawFrame();
}

function duplicateSelectedClip() {
  if (!activeClip) return alert("Select a clip to duplicate.");
  
  let targetTrack = null;
  project.tracks.forEach(track => {
    if (track.clips.some(c => c.id === activeClip.id)) targetTrack = track;
  });
  
  if (!targetTrack) return;
  
  const copy = JSON.parse(JSON.stringify(activeClip));
  copy.id = `clip_copy_${uuid()}`;
  
  // Offset start time directly after original clip ends
  copy.start = activeClip.start + activeClip.duration;
  
  // Snaping duplicate copy alignment
  copy.start = getSnapPosition(copy.start, copy.duration, copy.id, targetTrack.id);
  
  targetTrack.clips.push(copy);
  
  saveState();
  renderTimeline();
  selectClip(copy.id);
  drawFrame();
}

function deleteSelectedClip() {
  if (!activeClip) return;
  
  let targetTrack = null;
  project.tracks.forEach(track => {
    if (track.clips.some(c => c.id === activeClip.id)) targetTrack = track;
  });
  
  if (!targetTrack) return;
  
  targetTrack.clips = targetTrack.clips.filter(c => c.id !== activeClip.id);
  
  selectClip(null);
  saveState();
  renderTimeline();
  drawFrame();
}

// CAPTIONS SEGMENTS MANUAL ACTIONS
function formatSrtTime(seconds) {
  const date = new Date(seconds * 1000);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
}

function exportSrt() {
  const captionsTrack = project.tracks.find(t => t.type === 'captions');
  if (!captionsTrack || captionsTrack.clips.length === 0) {
    alert("No captions available to export.");
    return;
  }

  // Sort clips by start time
  const sortedClips = [...captionsTrack.clips].sort((a, b) => a.start - b.start);

  let srtContent = '';
  sortedClips.forEach((clip, index) => {
    const startTime = formatSrtTime(clip.start);
    const endTime = formatSrtTime(clip.start + clip.duration);
    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${clip.content || ''}\n\n`;
  });

  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'captions.srt');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function addManualCaptionSegment() {
  const captionsTrack = project.tracks.find(t => t.id === 'captions');
  
  const capClip = {
    id: `clip_cap_man_${uuid()}`,
    text: "Type caption text...",
    start: playheadTime,
    duration: 2.0,
    style: {
      fontFamily: 'impact',
      fontSize: 76,
      textColor: '#FFFFFF',
      highlightColor: '#FFCC00',
      accentColor: '#00FF66',
      pillColor: '#000000',
      pillOpacity: 140,
      dynamicHighlights: true,
      captionPosition: 'bottom'
    }
  };
  
  captionsTrack.clips.push(capClip);
  saveState();
  renderTimeline();
  rebuildManualCaptionsListEditor();
  selectClip(capClip.id);
  drawFrame();
}

function rebuildManualCaptionsListEditor() {
  const container = document.getElementById('captionsListEditor');
  container.innerHTML = '';
  
  const captionsTrack = project.tracks.find(t => t.id === 'captions');
  
  // Sort captions sequentially by start time
  const clips = [...captionsTrack.clips].sort((a, b) => a.start - b.start);
  
  if (clips.length === 0) {
    container.innerHTML = '<p class="tab-helper-text" style="text-align:center;">No captions on track yet.</p>';
    return;
  }
  
  clips.forEach(clip => {
    const card = document.createElement('div');
    card.className = `caption-segment-edit-card ${activeClip && activeClip.id === clip.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="segment-times">
        <label>Start (s)</label>
        <input type="number" class="cap-seg-start" value="${clip.start.toFixed(2)}" step="0.1" min="0">
        <label>Length</label>
        <input type="number" class="cap-seg-dur" value="${clip.duration.toFixed(2)}" step="0.1" min="0.1">
      </div>
      <textarea class="cap-seg-text">${clip.text}</textarea>
      <div class="segment-actions">
        <button class="segment-del-btn"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    `;
    
    // Bind inline editing changes
    card.querySelector('.cap-seg-start').addEventListener('change', (e) => {
      clip.start = Math.max(0.0, parseFloat(e.target.value));
      saveState();
      renderTimeline();
      drawFrame();
    });
    
    card.querySelector('.cap-seg-dur').addEventListener('change', (e) => {
      clip.duration = Math.max(0.1, parseFloat(e.target.value));
      saveState();
      renderTimeline();
      drawFrame();
    });
    
    card.querySelector('.cap-seg-text').addEventListener('input', (e) => {
      clip.text = e.target.value;
      
      // Update clip timeline item label
      const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"] span`);
      if (clipEl) clipEl.textContent = clip.text.length > 25 ? clip.text.substring(0, 22) + "..." : clip.text;
      
      drawFrame();
    });
    card.querySelector('.cap-seg-text').addEventListener('change', () => saveState());
    
    // Delete caption segment
    card.querySelector('.segment-del-btn').addEventListener('click', () => {
      captionsTrack.clips = captionsTrack.clips.filter(c => c.id !== clip.id);
      saveState();
      renderTimeline();
      rebuildManualCaptionsListEditor();
      drawFrame();
    });
    
    // Auto sync timeline select on card click
    card.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.classList.contains('segment-del-btn')) {
        selectClip(clip.id);
        seekTime(clip.start);
      }
    });
    
    container.appendChild(card);
  });
}

// Override selectClip to trigger captions list highlights too
const originalSelectClip = selectClip;
selectClip = function(clipId) {
  originalSelectClip(clipId);
  
  // Highlight active caption edit card
  document.querySelectorAll('.caption-segment-edit-card').forEach(c => c.classList.remove('active'));
  
  const capsTrack = project ? project.tracks.find(t => t.id === 'captions') : null;
  if (capsTrack && capsTrack.clips.some(c => c.id === clipId)) {
    rebuildManualCaptionsListEditor();
  }
};

// EXPORT PIPELINE STATUS POLLING
function startExport() {
  if (!project) return;
  
  // Ensure project is saved first
  saveProject();
  
  // Open progress overlay dialog
  const modal = document.getElementById('exportModal');
  modal.classList.add('active');
  
  document.getElementById('exportStatusMsg').textContent = "Submitting render task request to background queue...";
  document.getElementById('exportProgressFill').style.width = "0%";
  document.getElementById('exportProgressPct').textContent = "0%";
  document.getElementById('exportResultBox').style.display = "none";
  
  fetch('/api/studio/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project)
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      document.getElementById('exportStatusMsg').innerHTML = `<span style="color:var(--danger-color)">Error: ${data.error}</span>`;
    } else {
      pollExportStatus(data.job_id);
    }
  })
  .catch(err => {
    document.getElementById('exportStatusMsg').innerHTML = `<span style="color:var(--danger-color)">Error: ${err}</span>`;
  });
}

function pollExportStatus(jobId) {
  const source = new EventSource(`/api/status/stream/${jobId}`);
  source.onmessage = function(event) {
    const job = JSON.parse(event.data);
    if (job.error) {
      source.close();
      document.getElementById('exportStatusMsg').innerHTML = `<span style="color:var(--danger-color)">Error: ${job.error}</span>`;
      return;
    }

    const pct = job.percent || 0;
    document.getElementById('exportProgressFill').style.width = `${pct}%`;
    document.getElementById('exportProgressPct').textContent = `${pct}%`;
    document.getElementById('exportStatusMsg').textContent = job.message || "Rendering...";

    if (job.status === 'done') {
      source.close();
      document.getElementById('exportStatusMsg').textContent = "Video rendered successfully!";
      
      const resBox = document.getElementById('exportResultBox');
      resBox.style.display = "flex";
      
      const dlBtn = document.getElementById('btnDownloadRenderedVideo');
      dlBtn.href = job.result.video_url;
    } else if (job.status === 'error') {
      source.close();
      document.getElementById('exportStatusMsg').innerHTML = `<span style="color:var(--danger-color)">Render Error: ${job.message}</span>`;
    }
  };
  source.onerror = function(err) {
    source.close();
    document.getElementById('exportStatusMsg').innerHTML = `<span style="color:var(--danger-color)">Polling Fail: SSE Error</span>`;
  };
}

// UTILITIES AND HELPERS
function uuid() {
  return Math.random().toString(36).substring(2, 10);
}

function formatRulerTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimeCode(seconds) {
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${s}.${ms.toString().padStart(2, '0')}s`;
}

function formatFullTimeCode(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function showCanvasLoading(msg) {
  const el = document.getElementById('canvasLoading');
  document.getElementById('canvasLoadingMsg').textContent = msg;
  el.classList.add('active');
}

function hideCanvasLoading() {
  document.getElementById('canvasLoading').classList.remove('active');
}

function updateTotalDurationLabel() {
  const total = project ? project.duration : 0.0;
  document.getElementById('timeTotal').textContent = formatFullTimeCode(total);
  document.getElementById('projDuration').textContent = `${total.toFixed(2)}s`;
}

function hexToRgbaStr(hex, alpha) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getFontFamilyName(key) {
  if (key === 'press_start') return '"Press Start 2P", monospace';
  if (key === 'share_tech') return '"Share Tech Mono", monospace';
  if (key === 'audiowide') return '"Audiowide", cursive';
  if (key === 'orbitron') return '"Orbitron", monospace';
  if (key === 'montserrat') return '"Outfit", sans-serif';
  return 'Impact, sans-serif';
}


// ==========================================
// YOUTUBE IMPORT LOGIC
// ==========================================

async function checkLinkType(url) {
  try {
    const res = await fetch('/api/media/detect-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return await res.json();
  } catch (err) {
    return { platform: "unsupported", is_supported: false };
  }
}

// Media Tab Video detection
const reelVideoUrlInput = document.getElementById('reelVideoUrl');
const ytVideoControls = document.getElementById('youtubeVideoControls');
const btnImportReelVideo = document.getElementById('btnImportReelVideo');

reelVideoUrlInput.addEventListener('input', async (e) => {
  const url = e.target.value.trim();
  if (!url) {
    ytVideoControls.style.display = 'none';
    btnImportReelVideo.style.display = 'inline-flex';
    return;
  }

  const info = await checkLinkType(url);
  if (info.platform === 'youtube') {
    ytVideoControls.style.display = 'block';
    btnImportReelVideo.style.display = 'none'; // hide the default instagram fetch
  } else {
    ytVideoControls.style.display = 'none';
    btnImportReelVideo.style.display = 'inline-flex';
  }
});

document.getElementById('btnImportYtFull').addEventListener('click', () => {
  importGenericMedia('full');
});
document.getElementById('btnImportYtClip').addEventListener('click', () => {
  importGenericMedia('clip');
});

async function importGenericMedia(mode) {
  const url = document.getElementById('reelVideoUrl').value.trim();
  const start = document.getElementById('ytVideoStart').value.trim();
  const end = document.getElementById('ytVideoEnd').value.trim();

  if (!url) return alert("Please paste a link.");
  if (mode === 'clip' && (!start || !end)) return alert("Please provide start and end timestamps.");

  const endpoint = mode === 'full' ? '/api/media/fetch' : '/api/media/clip';

  showCanvasLoading(`Downloading YouTube video (${mode})...`);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, start, end })
    });
    const data = await res.json();
    if (data.error) {
      alert("Import failed: " + data.error);
    } else {
      addAssetToLibrary(data);
      document.getElementById('reelVideoUrl').value = '';
      ytVideoControls.style.display = 'none';
      btnImportReelVideo.style.display = 'inline-flex';
    }
  } catch (err) {
    alert("API call failed: " + err);
  } finally {
    hideCanvasLoading();
  }
}

// Audio Tab detection
const reelAudioUrlInput = document.getElementById('reelAudioUrl');
const ytAudioControls = document.getElementById('youtubeAudioControls');
const btnImportReelAudio = document.getElementById('btnImportReelAudio');

reelAudioUrlInput.addEventListener('input', async (e) => {
  const url = e.target.value.trim();
  if (!url) {
    ytAudioControls.style.display = 'none';
    btnImportReelAudio.style.display = 'inline-flex';
    return;
  }

  const info = await checkLinkType(url);
  if (info.platform === 'youtube') {
    ytAudioControls.style.display = 'block';
    btnImportReelAudio.style.display = 'none';
  } else {
    ytAudioControls.style.display = 'none';
    btnImportReelAudio.style.display = 'inline-flex';
  }
});

document.getElementById('btnImportYtAudioFull').addEventListener('click', () => {
  importGenericAudio('full');
});
document.getElementById('btnImportYtAudioClip').addEventListener('click', () => {
  importGenericAudio('clip');
});

async function importGenericAudio(mode) {
  const url = document.getElementById('reelAudioUrl').value.trim();
  const start = document.getElementById('ytAudioStart').value.trim();
  const end = document.getElementById('ytAudioEnd').value.trim();

  if (!url) return alert("Please paste a link.");
  if (mode === 'clip' && (!start || !end)) return alert("Please provide start and end timestamps.");

  showCanvasLoading(`Extracting YouTube audio (${mode})...`);
  try {
    const res = await fetch('/api/media/audio-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, mode, start, end })
    });
    const data = await res.json();
    if (data.error) {
      alert("Extraction failed: " + data.error);
    } else {
      addAssetToLibrary(data);
      document.getElementById('reelAudioUrl').value = '';
      ytAudioControls.style.display = 'none';
      btnImportReelAudio.style.display = 'inline-flex';
    }
  } catch (err) {
    alert("API call failed: " + err);
  } finally {
    hideCanvasLoading();
  }
}


// Handle Overlay Avatar Image Upload
async function uploadOverlayAvatar(event, clipId) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('overlayAvatarLabel').innerText = 'Uploading...';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/studio/media/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.status === 'success') {
      document.getElementById('overlayAvatarLabel').innerText = 'Custom Avatar';

      // Find clip and set property
      let targetClip = null;
      project.tracks.forEach(track => {
        const c = track.clips.find(x => x.id === clipId);
        if (c) targetClip = c;
      });

      if (targetClip) {
         targetClip.properties = { ...targetClip.properties, avatar_path: data.filepath };
         saveState();
         renderTimeline();
      }
    } else {
      alert('Upload failed: ' + data.message);
      document.getElementById('overlayAvatarLabel').innerText = 'Failed';
    }
  } catch (err) {
    console.error(err);
    alert('Error uploading avatar.');
  }
}

// DYNAMIC OVERLAY CANVAS RENDERING
function drawDynamicOverlayOnCanvas(clip, scale, currentTime) {
  const props = clip.properties || {};
  const template = clip.template;
  const elapsed = currentTime - clip.start;
  const progress = Math.min(1.0, elapsed / clip.duration);

  // Easing function (simple ease-out cubic)
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const animProgress = easeOutCubic(Math.min(1.0, elapsed / 0.5)); // Animate in over 0.5s

  ctx.save();
  // We use scale to allow users to resize it in the preview
  ctx.scale(animProgress, animProgress);

  if (template === 'social_follow') {
    const username = props.username || '@username';
    const accent = props.accent_color || '#A855F7';
    const avatar = props.avatar_path || null;

    // Draw card background
    ctx.fillStyle = 'rgba(26, 29, 35, 0.9)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4 * scale;
    drawRoundedRect(-200 * scale, -80 * scale, 400 * scale, 160 * scale, 20 * scale);
    ctx.fill();
    ctx.stroke();

    // Draw avatar circle
    if (avatar) {
       // Since the image might not be loaded synchronously in the canvas loop,
       // a basic colored circle represents the avatar if not fetched in JS yet.
       ctx.fillStyle = '#ffffff';
    } else {
       ctx.fillStyle = accent;
    }
    ctx.beginPath();
    ctx.arc(-130 * scale, 0, 50 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Text Username
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${40 * scale}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(username, -60 * scale, -10 * scale);

    // Follow Button
    ctx.fillStyle = accent;
    drawRoundedRect(-60 * scale, 10 * scale, 120 * scale, 40 * scale, 20 * scale);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${20 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText("Follow", 0, 37 * scale);

  } else if (template === 'call_to_action') {
    const text = props.text || 'LINK IN BIO';
    const accent = props.accent_color || '#3B82F6';

    // Draw glowing text
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 30 * scale * (0.8 + 0.2 * Math.sin(currentTime * 5)); // Pulsing glow
    ctx.font = `900 ${80 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, 0);

    // Draw underline
    ctx.fillStyle = accent;
    ctx.shadowBlur = 0;
    ctx.fillRect(-150 * scale, 20 * scale, 300 * scale, 10 * scale);
  }

  ctx.restore();
}

// Poll for missing audio peaks
setInterval(async () => {
  if (!project || !project.assets) return;
  for (const asset of project.assets) {
    if ((asset.type === 'video' || asset.type === 'audio') && (!asset.audio_peaks || asset.audio_peaks.length === 0)) {
      try {
        const res = await fetch(`/api/media/peaks/${asset.id}`);
        const data = await res.json();
        if (data.status === 'done') {
          asset.audio_peaks = data.peaks || [];
          renderTimeline(); // re-render timeline once peaks arrive
        }
      } catch (err) {}
    }
  }
}, 3000);
