'use strict';
/**
 * renderer.js
 * Main application controller for the OVS Scenario Editor renderer process.
 */

const { ipcRenderer }       = require('electron');
const path                  = require('path');
const { parseScenario }     = require('./xmlParser');
const { serializeScenario } = require('./xmlSerializer');
const FlowChart    = require('./flowchart');
const SceneEditor  = require('./editors/sceneEditor');
const HeaderEditor = require('./editors/headerEditor');
const EventsEditor = require('./editors/eventsEditor');

// ── State ────────────────────────────────────────────────────────────────────

let scenario = null;   // current scenario JS model
let isDirty  = false;  // unsaved changes?

// ── Instantiate modules ───────────────────────────────────────────────────────

const flowChart   = new FlowChart('network-canvas');
const sceneEditor = new SceneEditor('scene-editor',  onSceneChanged);
const headerEditor= new HeaderEditor('header-editor', onHeaderChanged);
const eventsEditor= new EventsEditor('events-editor', onEventsChanged);

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'flowchart') flowChart.resize();
  });
});

// ── Toolbar buttons ───────────────────────────────────────────────────────────

document.getElementById('btn-new').addEventListener('click',  cmdNew);
document.getElementById('btn-open').addEventListener('click', cmdOpen);
document.getElementById('btn-save').addEventListener('click', cmdSave);
document.getElementById('btn-add-scene').addEventListener('click', cmdAddScene);
document.getElementById('btn-fit').addEventListener('click',  () => flowChart.fit());

// ── Menu commands from main process ──────────────────────────────────────────

ipcRenderer.on('app-cmd', (_e, cmd) => {
  switch (cmd) {
    case 'new':         cmdNew();       break;
    case 'open':        cmdOpen();      break;
    case 'save':        cmdSave();      break;
    case 'saveAs':      cmdSaveAs();    break;
    case 'fitGraph':    flowChart.fit(); break;
  }
});

// ── Flowchart event hooks ─────────────────────────────────────────────────────

flowChart.on('nodeSelect', (sceneId) => {
  if (sceneId !== null && scenario) {
    const scene = scenario.scenes.find(s => s.id === sceneId);
    if (scene) { showSceneEditor(scene); return; }
  }
  hideSceneEditor();
});

flowChart.on('setInitial', (sceneId) => {
  if (!scenario) return;
  scenario.init.initial_scene = sceneId;
  markDirty();
  flowChart.refresh(scenario);
  setStatus(`Scene ${sceneId} set as initial scene.`);
});

flowChart.on('deleteScene', (sceneId) => {
  if (!scenario) return;
  const scene = scenario.scenes.find(s => s.id === sceneId);
  if (!scene) return;
  if (!confirm(`Delete scene "${scene.title}" (ID: ${sceneId})?\n\nAll triggers pointing to this scene will also be removed.`)) return;
  deleteScene(sceneId);
});

flowChart.on('addScene', () => cmdAddScene());

/** Reset Layout: discard layout.json and re-run auto-layout */
flowChart.on('resetLayout', async () => {
  if (!scenario) return;
  // Delete saved layout file if it exists
  const folderPath = scenario._folderPath;
  if (folderPath) {
    await ipcRenderer.invoke('layout:write', folderPath, {});  // write empty positions
  }
  // Re-render with no saved positions → triggers auto hierarchical layout
  document.getElementById('canvas-empty')?.classList.add('hidden');
  flowChart.render(scenario, null);
  setStatus('Layout reset to auto-arrange.');
});

/** Auto-save layout whenever the user finishes dragging a node */
flowChart.on('positionsChanged', async (positions) => {
  const folderPath = scenario?._folderPath;
  if (!folderPath || !Object.keys(positions).length) return;
  await ipcRenderer.invoke('layout:write', folderPath, positions);
  // Update the position indicator in the status bar
  setLayoutIndicator(true);
});

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdNew() {
  if (isDirty && !confirm('You have unsaved changes. Create a new scenario anyway?')) return;

  // Ask the user to pick (or create) the folder that will hold this scenario.
  // The handler also scaffolds images/, vocals/, media/ and seeds stock-dog.jpg.
  const result = await ipcRenderer.invoke('dialog:newScenarioFolder');
  if (!result) return;   // user cancelled

  scenario = createEmptyScenario();
  scenario._filePath   = result.filePath;
  scenario._folderPath = result.folderPath;
  isDirty = false;

  refreshAll(null);
  setStatus('New scenario created. Fill in the details below and save when ready.');
  document.getElementById('fp-display').textContent = result.filePath;
  switchToTab('header');
}

async function cmdOpen() {
  if (isDirty && !confirm('You have unsaved changes. Open a different scenario anyway?')) return;
  const result = await ipcRenderer.invoke('dialog:openFolder');
  if (!result) return;
  try {
    scenario = parseScenario(result.content);
    scenario._filePath   = result.filePath;
    scenario._folderPath = result.folderPath;
    isDirty = false;

    // Try to load a saved layout from layout.json in the same folder
    const savedPositions = await ipcRenderer.invoke('layout:read', result.folderPath);

    refreshAll(savedPositions);
    setStatus(`Opened: ${result.filePath}`);
    document.getElementById('fp-display').textContent = result.filePath;
    setLayoutIndicator(!!savedPositions);
    switchToTab('flowchart');
  } catch (err) {
    alert(`Failed to parse scenario XML:\n\n${err.message}`);
    console.error(err);
  }
}

async function cmdSave() {
  if (!scenario) { alert('No scenario to save. Create or open one first.'); return; }
  const xml = serializeScenario(scenario);
  const res = scenario._filePath
    ? await ipcRenderer.invoke('file:save', xml)
    : await ipcRenderer.invoke('file:saveAs', xml);

  if (res?.ok) {
    scenario._filePath   = res.filePath;
    scenario._folderPath = path.dirname(res.filePath);
    isDirty = false;
    setStatus(`Saved: ${res.filePath}`);
    document.getElementById('fp-display').textContent = res.filePath;
    showToast('Scenario saved ✔');

    // Also persist current node positions alongside the XML
    const positions = flowChart.getPositions();
    if (Object.keys(positions).length) {
      await ipcRenderer.invoke('layout:write', scenario._folderPath, positions);
    }
  } else if (res?.error) {
    alert(`Save failed: ${res.error}`);
  }
}

async function cmdSaveAs() {
  if (!scenario) return;
  const xml = serializeScenario(scenario);
  const res = await ipcRenderer.invoke('file:saveAs', xml);
  if (res?.ok) {
    scenario._filePath   = res.filePath;
    scenario._folderPath = path.dirname(res.filePath);
    isDirty = false;
    setStatus(`Saved as: ${res.filePath}`);
    document.getElementById('fp-display').textContent = res.filePath;
    showToast('Scenario saved ✔');

    // Save layout to the new location too
    const positions = flowChart.getPositions();
    if (Object.keys(positions).length) {
      await ipcRenderer.invoke('layout:write', scenario._folderPath, positions);
    }
  }
}

function cmdAddScene() {
  if (!scenario) { alert('Please create or open a scenario first.'); return; }
  const maxId = Math.max(0, ...scenario.scenes.filter(s => s.id < 100).map(s => s.id));
  const newId = maxId + 1;
  const newScene = {
    title: `Scene ${newId}`,
    id:    newId,
    init:  { cardiac: {}, respiration: {}, general: {} },
    timeout: null,
    simpleTriggers: [],
    triggerGroups:  []
  };
  scenario.scenes.push(newScene);
  markDirty();
  flowChart.refresh(scenario);
  setStatus(`Added Scene ${newId}. Click it to edit.`);
  // Select the new node after the DataSet update settles
  setTimeout(() => {
    try {
      flowChart.network?.selectNodes([newId]);
      flowChart._emit('nodeSelect', newId);
    } catch (_) {}
  }, 200);
}

// ── Scene editor callbacks ────────────────────────────────────────────────────

function onSceneChanged(updatedScene, action, originalId) {
  if (!scenario) return;
  if (action === 'delete') {
    deleteScene(updatedScene.id);
    return;
  }
  // Use originalId to find the scene (in case the user changed the Scene ID field)
  const searchId = originalId !== undefined ? originalId : updatedScene.id;
  const idx = scenario.scenes.findIndex(s => s.id === searchId);
  if (idx >= 0) {
    scenario.scenes[idx] = updatedScene;
  }
  markDirty();
  flowChart.refresh(scenario);
  showToast('Scene updated ✔');
}

function onHeaderChanged(updatedScenario) {
  scenario = updatedScenario;
  markDirty();
  showToast('Scenario info updated ✔');
}

function onEventsChanged(events) {
  if (!scenario) return;
  scenario.events = events;
  markDirty();
  showToast('Events updated ✔');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deleteScene(sceneId) {
  scenario.scenes = scenario.scenes.filter(s => s.id !== sceneId);
  // Remove all triggers pointing to the deleted scene
  for (const scene of scenario.scenes) {
    scene.simpleTriggers = (scene.simpleTriggers || []).filter(t => t.scene_id !== sceneId);
    scene.triggerGroups  = (scene.triggerGroups  || []).filter(tg => tg.scene_id !== sceneId);
  }
  if (scenario.init?.initial_scene === sceneId) {
    scenario.init.initial_scene = scenario.scenes[0]?.id ?? 1;
  }
  hideSceneEditor();
  markDirty();
  flowChart.refresh(scenario);
  setStatus(`Scene ${sceneId} deleted.`);
}

/**
 * Full refresh of all editors.
 * @param {object|null} savedPositions - positions to restore, or null for auto-layout
 */
function refreshAll(savedPositions) {
  if (!scenario) return;
  document.getElementById('canvas-empty')?.classList.add('hidden');
  flowChart.render(scenario, savedPositions);
  headerEditor.render(scenario);
  eventsEditor.render(scenario);
  hideSceneEditor();
  updateSceneCount();
}

function showSceneEditor(scene) {
  document.getElementById('panel-placeholder').style.display = 'none';
  document.getElementById('scene-editor').style.display = '';
  sceneEditor.render(scene, scenario);
}

function hideSceneEditor() {
  document.getElementById('panel-placeholder').style.display = '';
  document.getElementById('scene-editor').style.display = 'none';
}

function markDirty() {
  isDirty = true;
  updateSceneCount();
}

function setStatus(msg) {
  document.getElementById('status-msg').textContent = msg;
}

/**
 * Show a small indicator in the status bar when a layout file exists.
 * @param {boolean} hasSavedLayout
 */
function setLayoutIndicator(hasSavedLayout) {
  let el = document.getElementById('layout-indicator');
  if (!el) {
    el = document.createElement('span');
    el.id = 'layout-indicator';
    el.style.cssText = 'font-size:10px;color:#64748b;margin-left:8px;';
    document.getElementById('statusbar').insertBefore(el, document.getElementById('fp-display'));
  }
  el.textContent = hasSavedLayout ? '📌 layout saved' : '';
  el.title = hasSavedLayout
    ? 'Node positions are saved in layout.json. Drag nodes to update.'
    : '';
}

function updateSceneCount() {
  const n = scenario?.scenes?.length ?? 0;
  document.getElementById('scene-count').textContent =
    `${n} scene${n !== 1 ? 's' : ''}${isDirty ? ' •' : ''}`;
}

function switchToTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add('active');
  const panel = document.getElementById(`tab-${tabName}`);
  if (panel) panel.classList.add('active');
  if (tabName === 'flowchart') flowChart.resize();
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast-visible'), 10);
  setTimeout(() => { t.classList.remove('toast-visible'); setTimeout(() => t.remove(), 300); }, 2500);
}

// ── Empty scenario factory ────────────────────────────────────────────────────

function createEmptyScenario() {
  const today = new Date().toISOString().split('T')[0];
  return {
    header: {
      author: '',
      title: { name: 'New Scenario', top: 5, left: 10 },
      date_of_creation: today,
      description: ''
    },
    profile: {
      avatar:   { filename: 'stock-dog.jpg', height_pct: 100, width_pct: 100 },
      summary:  { description: '', breed: '', sex: '', weight: '', complaint: '', image: '', species: 'Canine' },
      controls: {
        color: '#000000',
        controls: [
          { title: 'Vocalizations',      id: 'vocals-dog-control',              top: 125, left: 300 },
          { title: 'Right Lung Sounds',  id: 'right-lung-dog-control',          top: 180, left: 80  },
          { title: 'Left Lung Sounds',   id: 'left-lung-dog-control',           top: 180, left: 320 },
          { title: 'Left Femoral Pulse', id: 'left-femoral-pulse-dog-control',  top: 275, left: 320 },
          { title: 'Right Femoral Pulse',id: 'right-femoral-pulse-dog-control', top: 275, left: 75  },
          { title: 'Heart Sounds',       id: 'heart-sound-dog-control',         top: 225, left: 221 },
          { title: 'Chest Movement',     id: 'chest-dog-control',               top: 210, left: 325 },
          { title: 'CPR',                id: 'button-cpr',                      top: 20,  left: 450 },
          { title: 'ECG',                id: 'button-ekg',                      top: 350, left: 0   },
          { title: 'SpO<sub>2</sub>',    id: 'button-SpO2',                     top: 350, left: 55  },
          { title: 'ETCO<sub>2</sub>',   id: 'button-CO2',                      top: 350, left: 395 },
          { title: 'Cuff',               id: 'button-bpcuff',                   top: 350, left: 450 },
          { title: 'Palpate',            id: 'button-palpate',                  top: 20,  left: 390 },
          { title: 'Temp',               id: 'button-Tperi',                    top: 350, left: 110 }
        ]
      }
    },
    vocals: [],
    media:  [],
    events: [
      { name: 'navigation', title: 'Navigation', events: [
        { title: 'Advance', id: 'advance', priority: 0, hotkey: '2' },
        { title: 'Back',    id: 'back',    priority: 0, hotkey: '1' }
      ]},
      { name: 'terminal', title: 'Terminal', events: [
        { title: 'Terminal', id: 'terminal', priority: 1, hotkey: 'x' }
      ]},
      { name: 'scene_jump', title: 'Jump To Scene', events: [] }
    ],
    init: {
      cardiac:     { rhythm: 'sinus', rate: 80, bps_sys: 120, bps_dia: 80, nibp_rate: 80, pulse_strength: 'medium', heart_sound: 'normal', heart_sound_volume: 7, ecg_indicator: 0, bp_cuff: 0, arrest: 0, pea: 0, vpc: 'none', vpc_freq: 0, vfib_amplitude: 'low' },
      respiration: { left_lung_sound: 'normal', left_lung_sound_volume: 7, right_lung_sound: 'normal', right_lung_sound_volume: 7, spo2: 98, spo2_indicator: 0, etco2: 35, etco2_indicator: 0, rate: 20, chest_movement: 1 },
      general:     { temperature: 1020, temperature_enable: 0 },
      initial_scene: 1,
      record: 1
    },
    scenes:      [],
    _filePath:   null,
    _folderPath: null
  };
}

// ── Guard: warn before closing with unsaved changes ───────────────────────────

window.addEventListener('beforeunload', (e) => {
  if (isDirty) e.returnValue = 'You have unsaved changes.';
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 's') { e.preventDefault(); cmdSave(); }
  if (mod && e.key === 'o') { e.preventDefault(); cmdOpen(); }
  if (mod && e.key === 'n') { e.preventDefault(); cmdNew();  }
});
