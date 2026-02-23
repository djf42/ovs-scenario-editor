'use strict';
/**
 * eventsEditor.js
 * Full-tab editor for event categories and events.
 */

class EventsEditor {
  constructor(containerId, onChangeCb) {
    this.container  = document.getElementById(containerId);
    this.onChangeCb = onChangeCb; // (events) => void
    this.scenario   = null;
    window.__eventsEditor = this;
  }

  render(scenario) {
    this.scenario = scenario;
    this.container.innerHTML = this._buildHTML();
    this._attachListeners();
  }

  _buildHTML() {
    const categories = this.scenario?.events || [];
    return `
<div class="editor-page">
  <h2>Events &amp; Triggers</h2>
  <p class="hint-text">
    Events are actions the simulator instructor can fire. They are organised into categories.
    Each event has a unique <strong>ID</strong> used in scene triggers.
  </p>

  <div id="cat-list">
    ${categories.map((cat, ci) => this._buildCategory(cat, ci)).join('')}
  </div>

  <button class="btn-add btn-primary" id="add-cat">+ Add Category</button>

  <div class="card" style="margin-top:16px">
    <button id="ev-apply" class="btn-primary">✔ Apply Changes</button>
  </div>
</div>`;
  }

  _buildCategory(cat, ci) {
    const events = cat.events || [];
    return `
<div class="card ev-cat" data-ci="${ci}">
  <div class="cat-header">
    <div class="form-row inline">
      <label>Category Name (ID)</label>
      <input type="text" class="cat-name" data-ci="${ci}" value="${esc(cat.name)}"
             placeholder="e.g. reversal" />
    </div>
    <div class="form-row inline">
      <label>Display Title</label>
      <input type="text" class="cat-title" data-ci="${ci}" value="${esc(cat.title)}"
             placeholder="e.g. Reversal Agents" />
    </div>
    <button class="btn-icon btn-del" title="Delete category"
            onclick="window.__eventsEditor.deleteCat(${ci})">🗑</button>
  </div>

  <div class="ev-table-wrap">
    <table class="ev-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>ID</th>
          <th>Priority</th>
          <th>Hotkey</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="ev-tbody-${ci}">
        ${events.map((ev, ei) => this._buildEventRow(ev, ci, ei)).join('')}
      </tbody>
    </table>
  </div>

  <button class="btn-small btn-add" onclick="window.__eventsEditor.addEvent(${ci})">+ Add Event</button>
</div>`;
  }

  _buildEventRow(ev, ci, ei) {
    return `
<tr data-ci="${ci}" data-ei="${ei}">
  <td><input type="text" class="ev-ev-title" data-ci="${ci}" data-ei="${ei}"
             value="${esc(ev.title)}" placeholder="Display name" /></td>
  <td><input type="text" class="ev-ev-id"    data-ci="${ci}" data-ei="${ei}"
             value="${esc(ev.id)}"    placeholder="unique_id" /></td>
  <td>
    <select class="ev-ev-prio" data-ci="${ci}" data-ei="${ei}">
      <option value="0" ${ev.priority == 0 ? 'selected':''}>0 – normal</option>
      <option value="1" ${ev.priority == 1 ? 'selected':''}>1 – high</option>
      <option value="2" ${ev.priority == 2 ? 'selected':''}>2 – critical</option>
    </select>
  </td>
  <td><input type="text" class="ev-ev-hotkey" data-ci="${ci}" data-ei="${ei}"
             value="${esc(ev.hotkey)}" placeholder="e.g. e" maxlength="3"
             style="width:50px;text-align:center" /></td>
  <td>
    <button class="btn-icon btn-del"
            onclick="window.__eventsEditor.deleteEvent(${ci}, ${ei})">✕</button>
  </td>
</tr>`;
  }

  _attachListeners() {
    this.container.querySelector('#add-cat').addEventListener('click', () => {
      this.scenario.events = this.scenario.events || [];
      this.scenario.events.push({ name: '', title: '', events: [] });
      this.container.querySelector('#cat-list').innerHTML =
        (this.scenario.events || []).map((c, i) => this._buildCategory(c, i)).join('');
    });

    this.container.querySelector('#ev-apply').addEventListener('click', () => this._applyChanges());
  }

  deleteCat(ci) {
    if (!confirm('Delete this entire event category?')) return;
    this.scenario.events.splice(ci, 1);
    this.container.querySelector('#cat-list').innerHTML =
      (this.scenario.events || []).map((c, i) => this._buildCategory(c, i)).join('');
  }

  addEvent(ci) {
    const cat = this.scenario.events[ci];
    if (!cat) return;
    cat.events = cat.events || [];
    cat.events.push({ title: '', id: '', priority: 0, hotkey: '' });
    const tbody = this.container.querySelector(`#ev-tbody-${ci}`);
    if (tbody) {
      const ei = cat.events.length - 1;
      tbody.insertAdjacentHTML('beforeend', this._buildEventRow(cat.events[ei], ci, ei));
    }
  }

  deleteEvent(ci, ei) {
    if (!confirm('Delete this event?')) return;
    this.scenario.events[ci].events.splice(ei, 1);
    const tbody = this.container.querySelector(`#ev-tbody-${ci}`);
    if (tbody) {
      tbody.innerHTML = (this.scenario.events[ci].events || []).map((ev, i) =>
        this._buildEventRow(ev, ci, i)).join('');
    }
  }

  _applyChanges() {
    const events = [];

    this.container.querySelectorAll('.ev-cat').forEach(catEl => {
      const ci = parseInt(catEl.dataset.ci, 10);
      const name  = catEl.querySelector(`.cat-name[data-ci="${ci}"]`).value.trim();
      const title = catEl.querySelector(`.cat-title[data-ci="${ci}"]`).value.trim();
      const evList = [];

      catEl.querySelectorAll(`tbody tr`).forEach(row => {
        const ei = parseInt(row.dataset.ei, 10);
        const evTitle  = row.querySelector(`.ev-ev-title[data-ei="${ei}"]`)?.value.trim()  || '';
        const evId     = row.querySelector(`.ev-ev-id[data-ei="${ei}"]`)?.value.trim()     || '';
        const evPrio   = parseInt(row.querySelector(`.ev-ev-prio[data-ei="${ei}"]`)?.value || '0', 10);
        const evHotkey = row.querySelector(`.ev-ev-hotkey[data-ei="${ei}"]`)?.value.trim() || '';
        evList.push({ title: evTitle, id: evId, priority: evPrio, hotkey: evHotkey });
      });

      events.push({ name, title, events: evList });
    });

    this.scenario.events = events;
    this.onChangeCb(events);
    showToast('Events saved.');
  }
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

module.exports = EventsEditor;
