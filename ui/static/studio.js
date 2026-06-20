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

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  loadProjectList();
  
  // Create a new project on start if none exists
  createNewProject();
});

// Initialize UI layout and register events
function initUI() {
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

  document.getElementById('btnLoadProject').addEventListener('click', () => {
    document.getElementById('projectsModal').classList.add('active');
    loadProjectList();
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

  // Export video
  document.getElementById('btnExport').addEventListener('click', startExport);
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
        
        chunks.forEach((chunk, index) => {
          const capClip = {
            id: `clip_cap_${uuid()}`,
            text: chunk.text,
            start: chunk.start,
            duration: chunk.end - chunk.start,
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


async function saveAssetToCreatorVault(asset, subtype='upload') {
  const name = prompt('Enter a name to save this to your Creator Vault:', asset.name);
  if (!name) return; // User cancelled

  try {
    const res = await fetch('/api/library/assets/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: asset.path,
        name: name,
        type: asset.type,
        subtype: subtype,
        source: { url: asset.url }
      })
    });

    if (res.ok) {
      loadVaultAssets(); // Reload the vault tab
      alert('Saved to Creator Vault!');
    } else {
      const data = await res.json();
      alert('Failed to save to Vault: ' + data.error);
    }
  } catch (err) {
    console.error(err);
    alert('Error saving to Vault.');
  }
}

function rebuildAssetsLibrary() {
  const mediaGrid = document.getElementById('mediaAssetsGrid');
  const audioList = document.getElementById('audioAssetsList');
  
  mediaGrid.innerHTML = '';
  audioList.innerHTML = '';
  
  project.assets.forEach(asset => {
    if (asset.type === 'video' || asset.type === 'image') {
      const card = document.createElement('div');
      card.className = 'asset-card';
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
        <button class="save-vault-btn" title="Save to Creator Vault"><i class="fa-solid fa-box-archive"></i> Save</button>
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
      
      const saveBtn = card.querySelector('.save-vault-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          saveAssetToCreatorVault(asset, asset.type === 'video' ? 'reel_video' : 'upload');
        });
      }

      mediaGrid.appendChild(card);
    } else if (asset.type === 'audio') {
      const item = document.createElement('div');
      item.className = 'asset-list-item';
      item.draggable = true;
      item.setAttribute('data-asset-id', asset.id);
      item.innerHTML = `
        <i class="fa-solid fa-volume-high"></i>
        <span class="asset-list-title">${asset.name}</span>
        <span class="asset-list-duration">${formatTimeCode(asset.duration)}</span>
        <button class="save-vault-btn" title="Save to Creator Vault" style="width: auto; padding: 2px 6px; margin-left: 5px;"><i class="fa-solid fa-box-archive"></i></button>
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

// TIMELINE RENDERER AND DRAG ACTIONS
function renderTimeline() {
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
      clipEl.innerHTML = `<span>${title}</span>`;
      
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
      const assetId = e.dataTransfer.getData('text/plain');
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
    drawCaptionBlockOnCanvas(clip, scale);
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

function drawCaptionBlockOnCanvas(clip, scale) {
  const text = clip.text || '';
  const style = clip.style || {};
  const fontSize = (style.fontSize || 80) * scale;
  const fontFamily = fontMapping[style.fontFamily || 'impact'] || 'sans-serif';
  
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  
  const textW = ctx.measureText(text).width;
  const padX = 42 * scale;
  const padY = 30 * scale;
  const boxW = textW + padX * 2;
  const boxH = fontSize + padY * 2;
  
  // Render pill box centered horizontally
  const pillColor = style.pillColor || '#000000';
  const pillOpacity = style.pillOpacity !== undefined ? style.pillOpacity : 140;
  ctx.fillStyle = hexToRgbaStr(pillColor, pillOpacity / 255);
  drawRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 32 * scale);
  
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  
  // Shadow outline
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 10 * scale;
  ctx.strokeText(text, 0, 0);
  
  ctx.fillStyle = style.textColor || '#ffffff';
  ctx.fillText(text, 0, 0);
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
  
  if (foundTrackId === 'video_main' || foundTrackId === 'video_overlay') {
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
  // Video Clip
  if (document.getElementById('properties-video').classList.contains('active')) {
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
  const interval = setInterval(() => {
    fetch(`/api/status/${jobId}`)
    .then(res => res.json())
    .then(job => {
      if (job.error) {
        clearInterval(interval);
        document.getElementById('exportStatusMsg').innerHTML = `<span style="color:var(--danger-color)">Error: ${job.error}</span>`;
        return;
      }
      
      const pct = job.percent || 0;
      document.getElementById('exportProgressFill').style.width = `${pct}%`;
      document.getElementById('exportProgressPct').textContent = `${pct}%`;
      document.getElementById('exportStatusMsg').textContent = job.message || "Rendering...";
      
      if (job.status === 'done') {
        clearInterval(interval);
        document.getElementById('exportStatusMsg').textContent = "Video rendered successfully!";
        
        const resBox = document.getElementById('exportResultBox');
        resBox.style.display = "flex";
        
        const dlBtn = document.getElementById('btnDownloadRenderedVideo');
        dlBtn.href = job.result.video_url;
      } else if (job.status === 'error') {
        clearInterval(interval);
        document.getElementById('exportStatusMsg').innerHTML = `<span style="color:var(--danger-color)">Render Error: ${job.message}</span>`;
      }
    })
    .catch(err => {
      clearInterval(interval);
      document.getElementById('exportStatusMsg').innerHTML = `<span style="color:var(--danger-color)">Polling Fail: ${err}</span>`;
    });
  }, 1000);
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
// CREATOR VAULT LOGIC
// ==========================================
let vaultAssets = [];
let currentVaultFilter = 'all';

async function loadVaultAssets() {
  try {
    const res = await fetch('/api/library/assets');
    if (!res.ok) throw new Error('Failed to load vault assets');
    vaultAssets = await res.json();
    renderVaultAssets();
  } catch (err) {
    console.error('Vault error:', err);
  }
}

function renderVaultAssets() {
  const grid = document.getElementById('vaultGrid');
  if (!grid) return;

  const searchQ = (document.getElementById('vaultSearchInput')?.value || '').toLowerCase();

  let filtered = vaultAssets.filter(a => {
    if (currentVaultFilter === 'video' && a.type !== 'video') return false;
    if (currentVaultFilter === 'audio' && a.type !== 'audio') return false;
    if (currentVaultFilter === 'image' && a.type !== 'image') return false;
    if (currentVaultFilter === 'favorites' && !a.favorite) return false;
    if (searchQ && !a.name.toLowerCase().includes(searchQ)) return false;
    return true;
  });

  grid.innerHTML = '';
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-boxes-packing empty-icon"></i>
        <p>No assets found.</p>
      </div>`;
    return;
  }

  filtered.forEach(asset => {
    const card = document.createElement('div');
    card.className = 'vault-asset-card';

    let thumbHtml = '';
    if (asset.thumbnail_url) {
      thumbHtml = `<img src="${asset.thumbnail_url}" class="vault-asset-thumb" alt="${asset.name}">`;
    } else if (asset.type === 'video') {
      thumbHtml = `<div class="vault-asset-thumb"><i class="fa-solid fa-video"></i></div>`;
    } else if (asset.type === 'audio') {
      thumbHtml = `<div class="vault-asset-thumb"><i class="fa-solid fa-music"></i></div>`;
    } else if (asset.type === 'image') {
      thumbHtml = `<img src="${asset.url}" class="vault-asset-thumb" alt="${asset.name}">`;
    } else {
      thumbHtml = `<div class="vault-asset-thumb"><i class="fa-solid fa-file"></i></div>`;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="vault-asset-name" title="${asset.name}">${asset.name}</div>
      <div class="vault-asset-meta">
        <span>${asset.type.toUpperCase()}</span>
        <span>${asset.duration > 0 ? asset.duration + 's' : ''}</span>
      </div>
      <div class="vault-asset-actions">
        <button class="vault-action-btn add-btn" title="Add to Timeline"><i class="fa-solid fa-plus"></i></button>
        <button class="vault-action-btn fav-btn ${asset.favorite ? 'active' : ''}" title="Favorite"><i class="fa-solid fa-heart"></i></button>
        <button class="vault-action-btn rename-btn" title="Rename"><i class="fa-solid fa-pen"></i></button>
      </div>
    `;

    // Add to Timeline
    card.querySelector('.add-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      addAssetToTimeline(asset);
    });

    // Favorite
    card.querySelector('.fav-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleVaultFavorite(asset.id, !asset.favorite);
    });

    // Rename
    card.querySelector('.rename-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const newName = prompt('Enter new name:', asset.name);
      if (newName && newName.trim() !== '' && newName !== asset.name) {
        await renameVaultAsset(asset.id, newName.trim());
      }
    });

    grid.appendChild(card);
  });
}

async function toggleVaultFavorite(id, isFav) {
  try {
    const res = await fetch(`/api/library/assets/${id}/favorite`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({favorite: isFav})
    });
    if (res.ok) loadVaultAssets();
  } catch(e) { console.error(e); }
}

async function renameVaultAsset(id, newName) {
  try {
    const res = await fetch(`/api/library/assets/${id}/rename`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: newName})
    });
    if (res.ok) loadVaultAssets();
  } catch(e) { console.error(e); }
}

function addAssetToTimeline(asset) {
  const timelineAsset = {
    id: 'vault_' + Math.random().toString(36).substr(2, 9),
    type: asset.type,
    name: asset.name,
    url: asset.url,
    path: asset.path,
    duration: asset.duration || 5.0
  };

  if (asset.type === 'video') {
    timelineAsset.preview_url = asset.thumbnail_url || asset.url;
    addMediaClip('video_overlay', timelineAsset);
  } else if (asset.type === 'image') {
    timelineAsset.preview_url = asset.url;
    addMediaClip('image_overlay', timelineAsset);
  } else if (asset.type === 'audio') {
    if (asset.subtype === 'tts' || asset.name.toLowerCase().includes('tts')) {
      addMediaClip('voice', timelineAsset);
    } else {
      addMediaClip('music', timelineAsset);
    }
  }
}

// Ensure Vault initializes when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('vaultSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderVaultAssets());
  }

  document.querySelectorAll('.vault-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.vault-filter-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentVaultFilter = e.currentTarget.getAttribute('data-filter');
      renderVaultAssets();
    });
  });

  loadVaultAssets();
});

// API Wrapper for Save to Vault Integration (appended safely)
async function saveAssetToCreatorVault(asset, subtype='upload') {
  const name = prompt('Enter a name to save this to your Creator Vault:', asset.name);
  if (!name) return; // User cancelled

  try {
    const res = await fetch('/api/library/assets/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: asset.path,
        name: name,
        type: asset.type,
        subtype: subtype,
        source: { url: asset.url } // store the original url
      })
    });

    if (res.ok) {
      if (typeof loadVaultAssets === 'function') loadVaultAssets(); // Reload the vault tab
      alert('Saved to Creator Vault!');
    } else {
      const data = await res.json();
      alert('Failed to save to Vault: ' + data.error);
    }
  } catch (err) {
    console.error(err);
    alert('Error saving to Vault.');
  }
}
