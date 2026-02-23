'use strict';
/**
 * sceneEditor.js
 * Right-side panel for editing a single scene's properties, init params, and triggers.
 */

const { CARDIAC_FIELDS, RESPIRATION_FIELDS, GENERAL_FIELDS } = require('../xmlParser');

// ── VPC value helpers ──────────────────────────────────────────────────────────
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

// Option sets for select inputs
const OPTIONS = {
  rhythm:         ['sinus', 'afib', 'vfib', 'vtach1', 'vtach2', 'vtach3', 'asystole'],
  // vpc is a compound field (waveform + count) rendered specially in _buildParamRows
  vfib_amplitude: ['low', 'high'],
  pulse_strength: ['none', 'weak', 'medium', 'strong'],
  heart_sound:    ['normal', 'none', 'muffled'],
  left_lung_sound:  ['normal', 'crackles', 'wheezes', 'none'],
  right_lung_sound: ['normal', 'crackles', 'wheezes', 'none'],
  arrest:   [{ v: 0, l: 'No' }, { v: 1, l: 'Yes' }],
  pea:      [{ v: 0, l: 'No' }, { v: 1, l: 'Yes' }],
  ecg_indicator:       [{ v: 0, l: 'Off' }, { v: 1, l: 'On' }],
  bp_cuff:             [{ v: 0, l: 'Off' }, { v: 1, l: 'On' }],
  spo2_indicator:      [{ v: 0, l: 'Off' }, { v: 1, l: 'On' }],
  etco2_indicator:     [{ v: 0, l: 'Off' }, { v: 1, l: 'On' }],
  chest_movement:      [{ v: 0, l: 'None' }, { v: 1, l: 'Yes' }],
  temperature_enable:  [{ v: 0, l: 'Off' },  { v: 1, l: 'On' }]
};

const FIELD_LABELS = {
  rhythm: 'Rhythm', vpc: 'VPC Type', pea: 'PEA', vpc_freq: 'VPC Freq',
  vfib_amplitude: 'VFib Amplitude', rate: 'Rate (bpm)', bps_sys: 'Systolic BP',
  bps_dia: 'Diastolic BP', nibp_rate: 'NIBP Rate', pulse_strength: 'Pulse Strength',
  heart_sound: 'Heart Sound', heart_sound_volume: 'Heart Sound Vol (0-10)',
  ecg_indicator: 'ECG Indicator', bp_cuff: 'BP Cuff', arrest: 'Cardiac Arrest',
  left_lung_sound: 'Left Lung Sound', left_lung_sound_volume: 'Left Lung Vol (0-10)',
  right_lung_sound: 'Right Lung Sound', right_lung_sound_volume: 'Right Lung Vol (0-10)',
  spo2: 'SpO₂ (%)', spo2_indicator: 'SpO₂ Indicator', etco2: 'EtCO₂ (mmHg)',
  etco2_indicator: 'EtCO₂ Indicator', chest_movement: 'Chest Movement',
  transfer_time: 'Transfer Time (s)',
  temperature: 'Temperature (×10)', temperature_enable: 'Temp Indicator'
};

class SceneEditor {
  constructor(containerId, onChangeCb) {
    this.container = document.getElementById(containerId);
    this.onChangeCb = onChangeCb; // (updatedScene, action) where action = 'update'|'delete'
    this.scene    = null;
    this.scenario = null;
    // expose for inline trigger button handlers
    window.__sceneEditor = this;
  }

  render(scene, scenario) {
    this.scene      = JSON.parse(JSON.stringify(scene));
    this._originalId = scene.id;  // remember ID in case user changes it
    this.scenario   = scenario;
    this.container.innerHTML = this._buildHTML();
    this._attachListeners();
  }

  // ── HTML builders ──────────────────────────────────────────────────────────

  _buildHTML() {
    const s = this.scene;
    const isTerminal = s.id === 100 || s.id < 0;
    const isInitial  = s.id === this.scenario?.init?.initial_scene;
    const badges = [
      isInitial  ? '<span class="badge badge-green">Initial</span>' : '',
      isTerminal ? '<span class="badge badge-red">Terminal</span>'  : ''
    ].join('');

    return `
<div class="se-header">
  <div class="se-title-row">
    <span class="se-label">Scene Editor</span>
    ${badges}
  </div>
  <button id="se-close" class="btn-icon" title="Close panel">✕</button>
</div>

<div class="se-body">

  <!-- Basic info -->
  <section class="se-section">
    <h4>Scene Info</h4>
    <div class="form-row">
      <label>Title</label>
      <input id="se-title" type="text" value="${esc(s.title)}" />
    </div>
    <div class="form-row">
      <label>Scene ID</label>
      <input id="se-id" type="number" value="${s.id}" min="-999" max="99999" />
    </div>
  </section>

  <!-- Timeout -->
  <section class="se-section">
    <h4>
      Timeout
      <label class="toggle-label">
        <input type="checkbox" id="se-timeout-en" ${s.timeout ? 'checked' : ''} />
        <span>Enable</span>
      </label>
    </h4>
    <div id="timeout-body" class="${s.timeout ? '' : 'hidden'}">
      <div class="form-row">
        <label>Timeout (s)</label>
        <input id="se-timeout-val" type="number" min="1"
               value="${s.timeout?.timeout_value ?? 30}" />
      </div>
      <div class="form-row">
        <label>Jump to Scene</label>
        <select id="se-timeout-scene">
          ${this._sceneOptions(s.timeout?.scene_id)}
        </select>
      </div>
    </div>
  </section>

  <!-- Init params tabs -->
  <section class="se-section">
    <h4>Initialization Parameters
      <span class="hint">(check = override)</span>
    </h4>
    <div class="subtabs">
      <button class="subtab-btn active" data-subtab="cardiac">Cardiac</button>
      <button class="subtab-btn" data-subtab="respiration">Respiration</button>
      <button class="subtab-btn" data-subtab="general">General</button>
    </div>
    <div id="subtab-cardiac"     class="subtab-body active">${this._buildParamRows(CARDIAC_FIELDS,     s.init?.cardiac     || {}, 'cardiac')}</div>
    <div id="subtab-respiration" class="subtab-body">${this._buildParamRows(RESPIRATION_FIELDS, s.init?.respiration || {}, 'respiration')}</div>
    <div id="subtab-general"     class="subtab-body">${this._buildParamRows(GENERAL_FIELDS,     s.init?.general     || {}, 'general')}</div>
  </section>

  <!-- Triggers -->
  <section class="se-section">
    <h4>
      Triggers
      <button class="btn-small btn-add" id="se-add-trigger">+ Add Trigger</button>
    </h4>
    <div id="triggers-list">
      ${this._buildTriggersList()}
    </div>
  </section>

  <!-- Trigger groups -->
  <section class="se-section" id="tg-section" ${(this.scene.triggerGroups||[]).length ? '' : 'style="display:none"'}>
    <h4>Trigger Groups</h4>
    <div id="tg-list">
      ${this._buildTriggerGroupList()}
    </div>
  </section>

  <!-- Actions -->
  <section class="se-section se-actions">
    <button id="se-apply" class="btn-primary">✔ Apply Changes</button>
    <button id="se-delete" class="btn-danger">🗑 Delete Scene</button>
  </section>

</div><!-- /se-body -->
`;
  }

  _buildParamRows(fields, data, group) {
    return fields.map(field => {
      const hasVal = data[field] !== undefined;
      const val    = hasVal ? data[field] : '';
      const label  = FIELD_LABELS[field] || field;
      const dis    = hasVal ? '' : 'disabled';

      // VPC is a compound field: waveform select + count select + hidden input
      if (field === 'vpc') {
        const vpcP = parseVpcValue(val);
        const wfOpts  = ['none','vtach1','vtach2','vtach3'].map(v =>
          `<option value="${v}" ${vpcP.waveform === v ? 'selected':''}>${v}</option>`).join('');
        const cntOpts = ['single','couplet','triplet'].map(v =>
          `<option value="${v}" ${vpcP.count === v ? 'selected':''}>${v}</option>`).join('');
        return `
<div class="param-row">
  <input type="checkbox" class="param-cb" data-field="vpc" data-group="${group}" ${hasVal ? 'checked':''} />
  <label class="param-name">VPC</label>
  <div style="display:flex;gap:4px;flex:1;align-items:center;">
    <select data-vpc-part="waveform" ${dis}>${wfOpts}</select>
    <select data-vpc-part="count" ${dis}>${cntOpts}</select>
    <input type="hidden" data-field="vpc" data-group="${group}" value="${esc(String(val || 'none'))}" />
  </div>
</div>`;
      }

      const opts = OPTIONS[field];
      let inputHTML;
      if (opts) {
        const optTags = opts.map(o => {
          const v = typeof o === 'object' ? o.v : o;
          const l = typeof o === 'object' ? o.l : o;
          const sel = String(val) === String(v) ? 'selected' : '';
          return `<option value="${v}" ${sel}>${l}</option>`;
        }).join('');
        inputHTML = `<select data-field="${field}" data-group="${group}" ${dis}>${optTags}</select>`;
      } else {
        inputHTML = `<input type="number" data-field="${field}" data-group="${group}"
                     value="${esc(String(val))}" ${dis} />`;
      }

      return `
<div class="param-row">
  <input type="checkbox" class="param-cb" data-field="${field}" data-group="${group}"
         ${hasVal ? 'checked' : ''} />
  <label class="param-name">${label}</label>
  ${inputHTML}
</div>`;
    }).join('');
  }

  _buildTriggersList() {
    const triggers = this.scene.simpleTriggers || [];
    if (!triggers.length) return '<p class="empty-hint">No triggers defined</p>';
    return triggers.map((t, i) => `
<div class="trigger-row">
  <span class="t-badge t-${t.type}">${t.type.toUpperCase()}</span>
  <span class="t-desc">${this._triggerDesc(t)}</span>
  <span class="t-arrow">→ <em>${this._sceneLabel(t.scene_id)}</em></span>
  <button class="btn-icon" title="Edit"   onclick="window.__sceneEditor.editTrigger(${i})">✏️</button>
  <button class="btn-icon btn-del" title="Delete" onclick="window.__sceneEditor.deleteTrigger(${i})">✕</button>
</div>`).join('');
  }

  _buildTriggerGroupList() {
    const groups = this.scene.triggerGroups || [];
    return groups.map((tg, gi) => `
<div class="tg-row">
  <strong>Group ${gi + 1}</strong>: requires ${tg.triggers_required}/${tg.triggers.length}
  triggers → Scene ${tg.scene_id}
  <div class="tg-triggers">
    ${tg.triggers.map(t => `<span class="t-chip">${this._triggerDesc(t)}</span>`).join('')}
  </div>
</div>`).join('') || '<p class="empty-hint">No trigger groups</p>';
  }

  _sceneOptions(selectedId) {
    return (this.scenario?.scenes || []).map(s => {
      const sel = s.id === selectedId ? 'selected' : '';
      return `<option value="${s.id}" ${sel}>${esc(s.title)} (${s.id})</option>`;
    }).join('');
  }

  _sceneLabel(id) {
    const s = this.scenario?.scenes.find(s => s.id === id);
    return s ? `${s.title} (${s.id})` : `ID ${id}`;
  }

  _triggerDesc(t) {
    switch (t.type) {
      case 'event': {
        let name = t.event_id;
        for (const cat of (this.scenario?.events || []))
          for (const ev of cat.events)
            if (ev.id === t.event_id) { name = `${ev.title}`; break; }
        return name;
      }
      case 'cpr':   return `CPR ${t.test || 'GTE'} ${t.duration}s`;
      case 'param': return `${t.paramGroup}.${t.paramName} ${t.test} ${t.paramValue}`;
      default:      return t.type;
    }
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  _attachListeners() {
    // Close panel
    this.container.querySelector('#se-close').addEventListener('click', () => {
      document.getElementById('panel-placeholder').style.display = '';
      document.getElementById('scene-editor').style.display = 'none';
    });

    // Subtabs
    this.container.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
        this.container.querySelectorAll('.subtab-body').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        this.container.querySelector(`#subtab-${btn.dataset.subtab}`).classList.add('active');
      });
    });

    // Timeout toggle
    const timeoutCb = this.container.querySelector('#se-timeout-en');
    timeoutCb.addEventListener('change', () => {
      this.container.querySelector('#timeout-body').classList.toggle('hidden', !timeoutCb.checked);
    });

    // Param checkboxes enable/disable their inputs
    this.container.querySelectorAll('.param-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const { field, group } = cb.dataset;
        const inp = this.container.querySelector(
          `[data-field="${field}"][data-group="${group}"]:not(.param-cb)`);
        if (inp) inp.disabled = !cb.checked;
      });
    });

    // VPC compound field: sync hidden input when either select changes,
    // and enable/disable both selects when the vpc checkbox is toggled.
    const vpcCb = this.container.querySelector('.param-cb[data-field="vpc"]');
    if (vpcCb) {
      const syncVpcHidden = () => {
        const wfSel  = this.container.querySelector('[data-vpc-part="waveform"]');
        const cntSel = this.container.querySelector('[data-vpc-part="count"]');
        const hidden = this.container.querySelector('input[type="hidden"][data-field="vpc"]');
        if (wfSel && cntSel && hidden) {
          hidden.value = encodeVpcValue(wfSel.value, cntSel.value);
        }
      };
      this.container.querySelector('[data-vpc-part="waveform"]')
        ?.addEventListener('change', syncVpcHidden);
      this.container.querySelector('[data-vpc-part="count"]')
        ?.addEventListener('change', syncVpcHidden);
      vpcCb.addEventListener('change', () => {
        const dis = !vpcCb.checked;
        this.container.querySelectorAll('[data-vpc-part]').forEach(s => s.disabled = dis);
      });
    }

    // Apply button
    this.container.querySelector('#se-apply').addEventListener('click', () => this._applyChanges());

    // Delete button
    this.container.querySelector('#se-delete').addEventListener('click', () => {
      if (confirm(`Delete scene "${this.scene.title}" (ID: ${this.scene.id})?\nThis will also remove all triggers pointing to it.`)) {
        this.onChangeCb(this.scene, 'delete');
      }
    });

    // Add trigger
    this.container.querySelector('#se-add-trigger').addEventListener('click', () => {
      this._openTriggerModal(-1);
    });
  }

  _applyChanges() {
    const title = this.container.querySelector('#se-title').value.trim();
    const id    = parseInt(this.container.querySelector('#se-id').value, 10);

    // Collect init params
    const init = { cardiac: {}, respiration: {}, general: {} };
    this.container.querySelectorAll('.param-cb:checked').forEach(cb => {
      const { field, group } = cb.dataset;
      const inp = this.container.querySelector(
        `[data-field="${field}"][data-group="${group}"]:not(.param-cb)`);
      if (inp && group) {
        const raw = inp.value;
        const num = parseFloat(raw);
        init[group][field] = isNaN(num) ? raw : num;
      }
    });

    // Collect timeout
    let timeout = null;
    if (this.container.querySelector('#se-timeout-en').checked) {
      timeout = {
        timeout_value: parseInt(this.container.querySelector('#se-timeout-val').value, 10),
        scene_id:      parseInt(this.container.querySelector('#se-timeout-scene').value, 10)
      };
    }

    const updated = {
      ...this.scene,
      title,
      id,
      init,
      timeout
    };

    this.scene = updated;
    this.onChangeCb(updated, 'update', this._originalId);
    this._originalId = updated.id; // update for subsequent applies
  }

  // ── Trigger modal ──────────────────────────────────────────────────────────

  editTrigger(index) {
    this._openTriggerModal(index);
  }

  deleteTrigger(index) {
    if (confirm('Delete this trigger?')) {
      this.scene.simpleTriggers.splice(index, 1);
      this.onChangeCb(this.scene, 'update');
      // Re-render trigger list only
      this.container.querySelector('#triggers-list').innerHTML = this._buildTriggersList();
    }
  }

  _openTriggerModal(index) {
    const existing = index >= 0 ? this.scene.simpleTriggers[index] : null;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    // Build all event options
    const allEvents = [];
    for (const cat of (this.scenario?.events || []))
      for (const ev of cat.events)
        allEvents.push(ev);

    const eventOpts = allEvents.map(ev =>
      `<option value="${esc(ev.id)}" ${ev.id === existing?.event_id ? 'selected' : ''}>
         ${esc(ev.title)} (${esc(ev.id)})</option>`
    ).join('');

    const sceneOpts = this._sceneOptions(existing?.scene_id);

    const typeSelected = (t) => (existing?.type === t || (!existing && t === 'event')) ? 'selected' : '';

    modal.innerHTML = `
<div class="modal-box">
  <h3>${index >= 0 ? 'Edit' : 'Add'} Trigger</h3>

  <div class="form-row">
    <label>Type</label>
    <select id="mt-type">
      <option value="event" ${typeSelected('event')}>Event</option>
      <option value="cpr"   ${typeSelected('cpr')}>CPR Duration</option>
      <option value="param" ${typeSelected('param')}>Parameter</option>
    </select>
  </div>

  <div id="mt-type-fields">
    ${this._triggerTypeFields(existing || { type: 'event' }, eventOpts)}
  </div>

  <div class="form-row">
    <label>→ Target Scene</label>
    <select id="mt-scene">${sceneOpts}</select>
  </div>

  <div class="modal-btns">
    <button id="mt-cancel">Cancel</button>
    <button id="mt-ok" class="btn-primary">OK</button>
  </div>
</div>`;

    document.body.appendChild(modal);

    // Dynamic type switching
    modal.querySelector('#mt-type').addEventListener('change', (e) => {
      modal.querySelector('#mt-type-fields').innerHTML =
        this._triggerTypeFields({ type: e.target.value }, eventOpts);
    });

    modal.querySelector('#mt-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('#mt-ok').addEventListener('click', () => {
      const trigger = this._collectTrigger(modal);
      if (!trigger) return;
      if (!this.scene.simpleTriggers) this.scene.simpleTriggers = [];
      if (index >= 0) this.scene.simpleTriggers[index] = trigger;
      else            this.scene.simpleTriggers.push(trigger);
      modal.remove();
      this.onChangeCb(this.scene, 'update');
      this.container.querySelector('#triggers-list').innerHTML = this._buildTriggersList();
    });
  }

  _triggerTypeFields(trigger, eventOptsHTML) {
    switch (trigger.type) {
      case 'event':
        return `<div class="form-row"><label>Event</label>
                <select id="mt-event-id">${eventOptsHTML}</select></div>`;
      case 'cpr':
        return `
<div class="form-row">
  <label>Test</label>
  <select id="mt-cpr-test">
    ${['GTE','GT','LTE','LT','EQ'].map(t =>
      `<option ${t === (trigger.test||'GTE') ? 'selected':''}>${t}</option>`).join('')}
  </select>
</div>
<div class="form-row">
  <label>Duration (s)</label>
  <input id="mt-cpr-dur" type="number" min="1" value="${trigger.duration || 30}" />
</div>`;
      case 'param':
        return `
<div class="form-row">
  <label>Test</label>
  <select id="mt-param-test">
    ${['EQ','GT','LT','GTE','LTE','INSIDE','OUTSIDE'].map(t =>
      `<option ${t === (trigger.test||'EQ') ? 'selected':''}>${t}</option>`).join('')}
  </select>
</div>
<div class="form-row">
  <label>Signal Group</label>
  <select id="mt-param-group">
    ${['cardiac','respiration','general'].map(g =>
      `<option ${g === (trigger.paramGroup||'cardiac') ? 'selected':''}>${g}</option>`).join('')}
  </select>
</div>
<div class="form-row">
  <label>Parameter</label>
  <input id="mt-param-name" type="text" value="${esc(trigger.paramName||'rate')}" />
</div>
<div class="form-row">
  <label>Value</label>
  <input id="mt-param-val" type="text" value="${esc(trigger.paramValue||'')}" />
</div>`;
      default:
        return '';
    }
  }

  _collectTrigger(modal) {
    const type     = modal.querySelector('#mt-type').value;
    const scene_id = parseInt(modal.querySelector('#mt-scene').value, 10);
    switch (type) {
      case 'event':
        return { type: 'event', event_id: modal.querySelector('#mt-event-id').value, scene_id };
      case 'cpr': {
        const test     = modal.querySelector('#mt-cpr-test').value;
        const duration = parseInt(modal.querySelector('#mt-cpr-dur').value, 10);
        return { type: 'cpr', test, duration, scene_id };
      }
      case 'param': {
        const test       = modal.querySelector('#mt-param-test').value;
        const paramGroup = modal.querySelector('#mt-param-group').value;
        const paramName  = modal.querySelector('#mt-param-name').value.trim();
        const paramValue = modal.querySelector('#mt-param-val').value.trim();
        if (!paramName) { alert('Parameter name is required.'); return null; }
        return { type: 'param', test, paramGroup, paramName, paramValue, scene_id };
      }
      default:
        return null;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = SceneEditor;
