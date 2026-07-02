'use strict';
/**
 * headerEditor.js
 * Full-tab editor for the scenario header, patient profile summary, avatar, and global init.
 */

const { ipcRenderer } = require('electron');
const path = require('path');
const fs   = require('fs');

class HeaderEditor {
  constructor(containerId, onChangeCb) {
    this.container  = document.getElementById(containerId);
    this.onChangeCb = onChangeCb; // (scenario) => void
    this.scenario   = null;
  }

  render(scenario) {
    this.scenario = scenario;
    this.container.innerHTML = this._buildHTML();
    this._attachListeners();
  }

  _buildHTML() {
    const h  = this.scenario.header  || {};
    const p  = this.scenario.profile || {};
    const av = p.avatar  || {};
    const sm = p.summary || {};
    const gi = this.scenario.init || {};

    return `
<div class="editor-page">
  <h2>Scenario Information</h2>

  <!-- ── Header ── -->
  <div class="card">
    <h3>Header</h3>
    <div class="grid-2">
      <div class="form-row">
        <label>Title</label>
        <input id="h-title" type="text" value="${esc(h.title?.name)}" />
      </div>
      <div class="form-row">
        <label>Date Created</label>
        <input id="h-date" type="date" value="${esc(h.date_of_creation)}" />
      </div>
      <div class="form-row">
        <label>Author</label>
        <input id="h-author" type="text" value="${esc(h.author)}" />
      </div>
      <div class="form-row">
        <label>Description</label>
        <input id="h-desc" type="text" value="${esc(h.description)}" />
      </div>
    </div>
  </div>

  <!-- ── Patient Summary ── -->
  <div class="card">
    <h3>Patient Summary</h3>
    <div class="form-row">
      <label>Patient Description</label>
      <textarea id="sm-desc" rows="3">${esc(sm.description)}</textarea>
    </div>
    <div class="grid-2">
      <div class="form-row">
        <label>Species</label>
        <select id="sm-species">
          ${['Canine','Feline','Equine','Bovine','Avian','Exotic','Other'].map(s =>
            `<option ${sm.species === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>Breed</label>
        <input id="sm-breed" type="text" value="${esc(sm.breed)}" />
      </div>
      <div class="form-row">
        <label>Sex</label>
        <select id="sm-sex">
          ${['Female','Male','Female (spayed)','Male (neutered)','Unknown'].map(s =>
            `<option ${sm.sex === s ? 'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>Weight</label>
        <input id="sm-weight" type="text" value="${esc(sm.weight)}" placeholder="e.g. 25 kg" />
      </div>
      <div class="form-row">
        <label>Presenting Complaint</label>
        <input id="sm-complaint" type="text" value="${esc(sm.complaint)}" />
      </div>
      <div class="form-row">
        <label>Patient Image File</label>
        <div class="input-browse">
          <input id="sm-image" type="text" value="${esc(sm.image)}" placeholder="e.g. lucy.jpg" />
          <button class="btn-browse" title="Browse images folder" onclick="window.__headerEditor.browseImage()">📂</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Avatar ── -->
  <div class="card">
    <h3>Avatar (Simulator Overlay Image)</h3>
    <div class="grid-2">
      <div class="form-row">
        <label>Filename</label>
        <div class="input-browse">
          <input id="av-file" type="text" value="${esc(av.filename)}" placeholder="e.g. stock-dog.jpg" />
          <button class="btn-browse" title="Browse images folder" onclick="window.__headerEditor.browseAvatar()">📂</button>
        </div>
      </div>
      <div class="form-row">
        <label>Height %</label>
        <input id="av-h" type="number" value="${av.height_pct ?? 100}" min="1" max="200" />
      </div>
      <div class="form-row">
        <label>Width %</label>
        <input id="av-w" type="number" value="${av.width_pct ?? 100}" min="1" max="200" />
      </div>
    </div>
  </div>

  <!-- ── Global Init ── -->
  <div class="card">
    <h3>Global Initial State</h3>
    <p class="hint-text">These values define the simulator's state when the scenario first loads (before any scene runs).</p>
    <div class="grid-2">
      <div class="form-row">
        <label>Initial Scene ID</label>
        <input id="gi-init-scene" type="number" value="${gi.initial_scene ?? 1}" min="0" />
      </div>
      <div class="form-row">
        <label>Record Session</label>
        <select id="gi-record">
          <option value="1" ${gi.record == 1 ? 'selected':''}>Yes</option>
          <option value="0" ${gi.record == 0 ? 'selected':''}>No</option>
        </select>
      </div>
    </div>

    <div class="subtabs" style="margin-top:12px">
      <button class="subtab-btn active" data-subtab="gi-cardiac">Cardiac</button>
      <button class="subtab-btn" data-subtab="gi-respiration">Respiration</button>
      <button class="subtab-btn" data-subtab="gi-general">General</button>
    </div>

    <div id="subtab-gi-cardiac" class="subtab-body active">
      ${buildGiCardiacForm(gi.cardiac || {})}
    </div>
    <div id="subtab-gi-respiration" class="subtab-body">
      ${buildGiRespirationForm(gi.respiration || {})}
    </div>
    <div id="subtab-gi-general" class="subtab-body">
      ${buildGiGeneralForm(gi.general || {})}
    </div>
  </div>

  <!-- ── Media Files ── -->
  <div class="card">
    <h3>Vocal Files
      <button class="btn-small btn-add" id="add-vocal">+ Add</button>
    </h3>
    <div id="vocals-list">
      ${this._buildFileList(this.scenario.vocals || [], 'vocal')}
    </div>
  </div>

  <div class="card">
    <h3>Media Files
      <button class="btn-small btn-add" id="add-media">+ Add</button>
    </h3>
    <div id="media-list">
      ${this._buildFileList(this.scenario.media || [], 'media')}
    </div>
  </div>

</div>`;
  }

  _buildFileList(files, type) {
    if (!files.length) return `<p class="empty-hint">No ${type} files defined.</p>`;
    const placeholder = type === 'vocal' ? 'filename.wav' : 'filename.mp4';
    return files.map((f, i) => `
<div class="file-row">
  <div class="input-browse" style="flex:1">
    <input type="text" class="file-name" data-idx="${i}" data-type="${type}" placeholder="${placeholder}" value="${esc(f.filename)}" />
    <button class="btn-browse" title="Browse ${type} folder" onclick="window.__headerEditor.browseFile('${type}', ${i})">📂</button>
  </div>
  <input type="text" class="file-title" data-idx="${i}" data-type="${type}" placeholder="Display title" value="${esc(f.title)}" style="flex:1" />
  <button class="btn-icon btn-del" onclick="window.__headerEditor.removeFile('${type}', ${i})">✕</button>
</div>`).join('');
  }

  // Debounced auto-apply — 400 ms after the last change
  _scheduleAutoApply() {
    clearTimeout(this._autoApplyTimer);
    this._autoApplyTimer = setTimeout(() => this._applyChanges(true), 400);
  }

  _attachListeners() {
    window.__headerEditor = this;

    // Subtabs for global init
    this.container.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.card');
        parent.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
        parent.querySelectorAll('.subtab-body').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        parent.querySelector(`#subtab-${btn.dataset.subtab}`).classList.add('active');
      });
    });

    // Auto-apply on any input/select/textarea change (covers current and future rows
    // added dynamically, via event delegation on the container)
    this.container.addEventListener('input',  (e) => {
      if (e.target.matches('input, textarea')) this._scheduleAutoApply();
    });
    this.container.addEventListener('change', (e) => {
      if (e.target.matches('select')) this._scheduleAutoApply();
    });

    // Add vocal — apply immediately after structural change
    this.container.querySelector('#add-vocal').addEventListener('click', () => {
      this.scenario.vocals = this.scenario.vocals || [];
      this.scenario.vocals.push({ filename: '', title: '' });
      this.container.querySelector('#vocals-list').innerHTML =
        this._buildFileList(this.scenario.vocals, 'vocal');
      this._applyChanges(true);
    });

    // Add media — apply immediately after structural change
    this.container.querySelector('#add-media').addEventListener('click', () => {
      this.scenario.media = this.scenario.media || [];
      this.scenario.media.push({ filename: '', title: '' });
      this.container.querySelector('#media-list').innerHTML =
        this._buildFileList(this.scenario.media, 'media');
      this._applyChanges(true);
    });
  }

  removeFile(type, index) {
    if (type === 'vocal') {
      this.scenario.vocals.splice(index, 1);
      this.container.querySelector('#vocals-list').innerHTML =
        this._buildFileList(this.scenario.vocals, 'vocal');
    } else {
      this.scenario.media.splice(index, 1);
      this.container.querySelector('#media-list').innerHTML =
        this._buildFileList(this.scenario.media, 'media');
    }
    this._applyChanges(true);
  }

  /**
   * Copies `fullPath` into the scenario's `subdir` folder if it isn't already there.
   * Returns just the basename (what gets stored in the XML).
   */
  _copyToSubdir(fullPath, subdir) {
    const folderPath = this.scenario?._folderPath;
    if (!folderPath) return path.basename(fullPath);

    const destDir  = path.join(folderPath, subdir);
    const basename = path.basename(fullPath);
    const destPath = path.join(destDir, basename);

    // Create the subfolder if it doesn't exist yet
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    // Only copy if the source and destination are different files
    if (path.resolve(fullPath) !== path.resolve(destPath)) {
      fs.copyFileSync(fullPath, destPath);
    }

    return basename;
  }

  /** Opens a file picker in the scenario's vocals/ or media/ subfolder. */
  async browseFile(type, index) {
    const folderPath = this.scenario?._folderPath;
    const subdir = type === 'vocal' ? 'vocals' : 'media';
    const startDir = folderPath ? path.join(folderPath, subdir) : null;

    const filters = type === 'vocal'
      ? [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'aiff'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'webm', 'jpg', 'jpeg', 'png', 'gif'] }, { name: 'All Files', extensions: ['*'] }];

    const fullPath = await ipcRenderer.invoke('dialog:pickFile', startDir, filters);
    if (!fullPath) return;

    const filename = this._copyToSubdir(fullPath, subdir);

    // Update the matching filename input in the DOM then auto-apply
    const input = this.container.querySelector(`.file-name[data-type="${type}"][data-idx="${index}"]`);
    if (input) input.value = filename;
    this._scheduleAutoApply();
  }

  /** Opens a file picker in the scenario's images/ subfolder for the avatar. */
  async browseAvatar() {
    const folderPath = this.scenario?._folderPath;
    const startDir = folderPath ? path.join(folderPath, 'images') : null;
    const filters = [
      { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ];
    const fullPath = await ipcRenderer.invoke('dialog:pickFile', startDir, filters);
    if (!fullPath) return;
    const filename = this._copyToSubdir(fullPath, 'images');
    const input = this.container.querySelector('#av-file');
    if (input) input.value = filename;
    this._scheduleAutoApply();
  }

  /** Opens a file picker in the scenario's images/ subfolder for the patient image. */
  async browseImage() {
    const folderPath = this.scenario?._folderPath;
    const startDir = folderPath ? path.join(folderPath, 'images') : null;
    const filters = [
      { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ];
    const fullPath = await ipcRenderer.invoke('dialog:pickFile', startDir, filters);
    if (!fullPath) return;
    const filename = this._copyToSubdir(fullPath, 'images');
    const input = this.container.querySelector('#sm-image');
    if (input) input.value = filename;
    this._scheduleAutoApply();
  }

  _applyChanges(silent = false) {
    const g = (id) => this.container.querySelector(`#${id}`);

    // Header
    this.scenario.header = {
      author: g('h-author').value.trim(),
      title: {
        name: g('h-title').value.trim(),
        top:  this.scenario.header?.title?.top  ?? 5,
        left: this.scenario.header?.title?.left ?? 10
      },
      date_of_creation: g('h-date').value,
      description: g('h-desc').value.trim()
    };

    // Summary
    this.scenario.profile.summary = {
      description: g('sm-desc').value.trim(),
      species:     g('sm-species').value,
      breed:       g('sm-breed').value.trim(),
      sex:         g('sm-sex').value,
      weight:      g('sm-weight').value.trim(),
      complaint:   g('sm-complaint').value.trim(),
      image:       g('sm-image').value.trim()
    };

    // Avatar
    this.scenario.profile.avatar = {
      filename:   g('av-file').value.trim(),
      height_pct: parseFloat(g('av-h').value) || 100,
      width_pct:  parseFloat(g('av-w').value) || 100
    };

    // Global init basics
    this.scenario.init.initial_scene = parseInt(g('gi-init-scene').value, 10) || 1;
    this.scenario.init.record        = parseInt(g('gi-record').value, 10);

    // Global init physiological params
    this.scenario.init.cardiac     = collectGiParams(this.container, 'gi-c');
    this.scenario.init.respiration = collectGiParams(this.container, 'gi-r');
    this.scenario.init.general     = collectGiParams(this.container, 'gi-g');

    // Vocal files
    this.scenario.vocals = [];
    this.container.querySelectorAll('.file-name[data-type="vocal"]').forEach((inp, i) => {
      const titleInp = this.container.querySelector(`.file-title[data-type="vocal"][data-idx="${i}"]`);
      this.scenario.vocals.push({ filename: inp.value.trim(), title: titleInp?.value.trim() || '' });
    });

    // Media files
    this.scenario.media = [];
    this.container.querySelectorAll('.file-name[data-type="media"]').forEach((inp, i) => {
      const titleInp = this.container.querySelector(`.file-title[data-type="media"][data-idx="${i}"]`);
      this.scenario.media.push({ filename: inp.value.trim(), title: titleInp?.value.trim() || '' });
    });

    this.onChangeCb(this.scenario, silent);
  }
}

// ── VPC value helpers ──────────────────────────────────────────────────────────
// VPC is stored as "#-#" (waveform index - count index) or "none".
// vtach1=1, vtach2=2, vtach3=3 / single=1, couplet=2, triplet=3

function parseVpcValue(val) {
  if (!val || val === 'none' || val === 0) return { waveform: 'none', count: 'single' };
  const parts = String(val).split('-');
  const wfMap  = ['vtach1', 'vtach2', 'vtach3'];
  const cntMap = ['single', 'couplet', 'triplet'];
  return {
    waveform: wfMap[parseInt(parts[0]) - 1]  || 'none',
    count:    cntMap[parseInt(parts[1]) - 1] || 'single'
  };
}

function encodeVpcValue(waveform, count) {
  if (!waveform || waveform === 'none') return 'none';
  const wfIdx  = { vtach1: 1, vtach2: 2, vtach3: 3 }[waveform] || 1;
  const cntIdx = { single: 1, couplet: 2, triplet: 3 }[count]   || 1;
  return `${wfIdx}-${cntIdx}`;
}

// ── Global-init form builders ─────────────────────────────────────────────────

function buildGiCardiacForm(c) {
  const vpcP = parseVpcValue(c.vpc);
  return buildGiRows([
    ['gi-c-rhythm',       'Rhythm',       'select', c.rhythm,       ['sinus','afib','vfib','vtach1','vtach2','vtach3','asystole']],
    ['gi-c-vpc_waveform', 'VPC Waveform', 'select', vpcP.waveform,  ['none','vtach1','vtach2','vtach3']],
    ['gi-c-vpc_count',    'VPC Count',    'select', vpcP.count,     ['single','couplet','triplet']],
    ['gi-c-vpc_freq', 'VPC Freq',        'number', c.vpc_freq],
    ['gi-c-vfib_amplitude', 'VFib Amp',  'select', c.vfib_amplitude, ['low','high']],
    ['gi-c-rate',     'Rate (bpm)',       'number', c.rate],
    ['gi-c-bps_sys',  'Systolic BP',     'number', c.bps_sys],
    ['gi-c-bps_dia',  'Diastolic BP',    'number', c.bps_dia],
    ['gi-c-nibp_rate','NIBP Rate',       'number', c.nibp_rate],
    ['gi-c-pulse_strength','Pulse Strength','select',c.pulse_strength,['none','weak','medium','strong']],
    ['gi-c-heart_sound','Heart Sound',   'select', c.heart_sound, ['normal','none','muffled']],
    ['gi-c-heart_sound_volume','Heart Sound Vol (0-10)','number',c.heart_sound_volume],
    ['gi-c-ecg_indicator','ECG Indicator','select',c.ecg_indicator,[{v:0,l:'Off'},{v:1,l:'On'}]],
    ['gi-c-bp_cuff',  'BP Cuff',         'select', c.bp_cuff,  [{v:0,l:'Off'},{v:1,l:'On'}]],
    ['gi-c-pea',      'PEA',             'select', c.pea,      [{v:0,l:'No'},{v:1,l:'Yes'}]],
    ['gi-c-arrest',       'Cardiac Arrest',  'select', c.arrest,   [{v:0,l:'No'},{v:1,l:'Yes'}]],
    ['gi-c-transfer_time','Transfer Time (s)','number', c.transfer_time]
  ]);
}

function buildGiRespirationForm(r) {
  return buildGiRows([
    ['gi-r-left_lung_sound',  'Left Lung Sound',    'select', r.left_lung_sound,  ['normal','crackles','wheezes','none']],
    ['gi-r-left_lung_sound_volume','Left Lung Vol (0-10)','number',r.left_lung_sound_volume],
    ['gi-r-right_lung_sound', 'Right Lung Sound',   'select', r.right_lung_sound, ['normal','crackles','wheezes','none']],
    ['gi-r-right_lung_sound_volume','Right Lung Vol (0-10)','number',r.right_lung_sound_volume],
    ['gi-r-spo2',             'SpO₂ (%)',            'number', r.spo2],
    ['gi-r-spo2_indicator',   'SpO₂ Indicator',     'select', r.spo2_indicator, [{v:0,l:'Off'},{v:1,l:'On'}]],
    ['gi-r-etco2',            'EtCO₂ (mmHg)',        'number', r.etco2],
    ['gi-r-etco2_indicator',  'EtCO₂ Indicator',    'select', r.etco2_indicator,[{v:0,l:'Off'},{v:1,l:'On'}]],
    ['gi-r-rate',             'Rate (bpm)',           'number', r.rate],
    ['gi-r-chest_movement',   'Chest Movement',     'select', r.chest_movement, [{v:0,l:'None'},{v:1,l:'Yes'}]],
    ['gi-r-transfer_time',    'Transfer Time (s)',   'number', r.transfer_time],
  ]);
}

function buildGiGeneralForm(g) {
  return buildGiRows([
    ['gi-g-temperature',       'Temperature (×10)', 'number', g.temperature],
    ['gi-g-temperature_enable','Temp Indicator',    'select', g.temperature_enable, [{v:0,l:'Off'},{v:1,l:'On'}]]
  ]);
}

function buildGiRows(rows) {
  return `<div class="grid-2">${rows.map(([id, label, type, val, opts]) => {
    let input;
    if (type === 'select' && opts) {
      const optsHTML = opts.map(o => {
        const v = typeof o === 'object' ? o.v : o;
        const l = typeof o === 'object' ? o.l : o;
        return `<option value="${v}" ${String(val) === String(v) ? 'selected':''}>${l}</option>`;
      }).join('');
      input = `<select id="${id}">${optsHTML}</select>`;
    } else {
      input = `<input id="${id}" type="number" value="${val ?? ''}" />`;
    }
    return `<div class="form-row"><label>${label}</label>${input}</div>`;
  }).join('')}</div>`;
}

function collectGiParams(container, prefix) {
  const result = {};
  const paramMap = {
    'gi-c': ['rhythm','vpc_waveform','vpc_count','pea','vpc_freq','vfib_amplitude','rate','bps_sys','bps_dia',
              'nibp_rate','pulse_strength','heart_sound','heart_sound_volume',
              'ecg_indicator','bp_cuff','arrest','transfer_time'],
    'gi-r': ['left_lung_sound','left_lung_sound_volume','right_lung_sound','right_lung_sound_volume',
              'spo2','spo2_indicator','etco2','etco2_indicator','rate','chest_movement','transfer_time'],
    'gi-g': ['temperature','temperature_enable']
  };
  const fields = paramMap[prefix] || [];
  for (const field of fields) {
    const el = container.querySelector(`#${prefix}-${field}`);
    if (!el) continue;
    const raw = el.value;
    if (raw === '' || raw === null || raw === undefined) continue;
    const num = parseFloat(raw);
    result[field] = isNaN(num) ? raw : num;
  }
  // Combine vpc_waveform + vpc_count into a single "vpc" value (#-# or "none")
  if (prefix === 'gi-c') {
    const wf  = result.vpc_waveform;
    const cnt = result.vpc_count;
    result.vpc = encodeVpcValue(wf || 'none', cnt || 'single');
    delete result.vpc_waveform;
    delete result.vpc_count;
  }
  return result;
}

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast-visible'), 10);
  setTimeout(() => { t.classList.remove('toast-visible'); setTimeout(() => t.remove(), 300); }, 2500);
}

module.exports = HeaderEditor;
