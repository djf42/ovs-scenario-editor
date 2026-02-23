'use strict';
/**
 * flowchart.js
 * Manages the vis-network scene flowchart.
 *
 * Requires vis-network/standalone to be loaded as global `vis` before use.
 *
 * Positions:
 *   - render(scenario, savedPositions) — pass a {id: {x,y}} map to restore layout;
 *     omit (or pass null) for automatic hierarchical layout.
 *   - refresh(scenario)               — re-renders while preserving current node positions.
 *   - getPositions()                  — returns current {id: {x,y}} map for saving.
 *   - 'positionsChanged' event fires after every user drag (debounced 400ms).
 */

class FlowChart {
  constructor(containerId) {
    this.container  = document.getElementById(containerId);
    this.nodes      = null;
    this.edges      = null;
    this.network    = null;
    this._handlers  = {};
    this._scenario  = null;
    this._edgeSeq   = 0;
    this._saveTimer = null;   // debounce handle for positionsChanged
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Full (re)render.
   * @param {object} scenario       - the JS scenario model
   * @param {object|null} savedPositions - {sceneId: {x,y}} or null for auto-layout
   */
  render(scenario, savedPositions = null) {
    this._scenario = scenario;
    this._edgeSeq  = 0;

    const hasSaved = savedPositions && Object.keys(savedPositions).length > 0;

    const { nodeData, edgeData } = this._buildGraphData(scenario, hasSaved ? savedPositions : null);

    this.nodes = new vis.DataSet(nodeData);
    this.edges = new vis.DataSet(edgeData);

    if (this.network) {
      this.network.destroy();
      this.network = null;
    }

    this.network = new vis.Network(
      this.container,
      { nodes: this.nodes, edges: this.edges },
      this._networkOptions(hasSaved)
    );

    if (hasSaved) {
      // Positions already set on nodes — just fit the view once rendered
      this.network.once('afterDrawing', () => {
        this.network.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
      });
    } else {
      // Auto-layout: wait for physics to stabilise, then freeze and fit
      this.network.once('stabilized', () => {
        this.network.setOptions({
          physics: { enabled: false },
          layout:  { hierarchical: { enabled: false } }
        });
        this.network.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
        // Emit initial positions so they can be auto-saved
        this._emitPositionsChanged();
      });
    }

    this._wireNetworkEvents();
  }

  /**
   * Lightweight refresh — rebuilds edges and node labels/colours
   * while keeping every node exactly where the user left it.
   */
  refresh(scenario) {
    this._scenario = scenario;

    if (!this.network || !this.nodes || !this.edges) {
      this.render(scenario, null);
      return;
    }

    // Capture current positions before touching anything
    const currentPositions = this._rawPositions();

    // Keep track of which node is selected
    const selectedBefore = this.network.getSelectedNodes()?.[0] ?? null;

    this._edgeSeq = 0;
    const { nodeData, edgeData } = this._buildGraphData(scenario, currentPositions);

    // ── Update nodes (add / update / remove) ──────────────────────────────
    const existingIds = new Set(this.nodes.getIds().map(Number));
    const incomingIds = new Set(nodeData.map(n => n.id));

    // Remove nodes that no longer exist
    for (const id of existingIds) {
      if (!incomingIds.has(id)) this.nodes.remove(id);
    }
    // Update or add remaining nodes (positions are baked in from currentPositions)
    this.nodes.update(nodeData);

    // ── Rebuild edges entirely (simplest & safest) ────────────────────────
    this.edges.clear();
    this.edges.add(edgeData);

    // Restore selection
    if (selectedBefore !== null && incomingIds.has(Number(selectedBefore))) {
      try { this.network.selectNodes([selectedBefore]); } catch (_) {}
    }
  }

  /** Returns the current node positions as { sceneId: {x, y} } */
  getPositions() {
    if (!this.network) return {};
    // Convert keys to numbers to match scene IDs
    const raw = this._rawPositions();
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      out[Number(k)] = { x: Math.round(v.x), y: Math.round(v.y) };
    }
    return out;
  }

  fit() {
    this.network?.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  }

  resize() {
    this.network?.redraw();
  }

  /** Register an event handler */
  on(event, cb) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(cb);
  }

  // ── Graph data builders ───────────────────────────────────────────────────

  _buildGraphData(scenario, positions) {
    const initialId = scenario.init?.initial_scene;
    const nodeData  = scenario.scenes.map(s => {
      const node = this._sceneNode(s, initialId);
      if (positions?.[s.id]) {
        node.x = positions[s.id].x;
        node.y = positions[s.id].y;
        // Fix the node at its saved position (physics off)
        node.physics = false;
      }
      return node;
    });

    const edgeData = [];
    for (const scene of scenario.scenes) {
      for (const t of (scene.simpleTriggers || [])) {
        if (!this._sceneExists(scenario, t.scene_id)) continue;
        edgeData.push(this._triggerEdge(scene.id, t, scenario));
      }
      if (scene.timeout) {
        edgeData.push(this._timeoutEdge(scene.id, scene.timeout));
      }
      for (const tg of (scene.triggerGroups || [])) {
        if (!this._sceneExists(scenario, tg.scene_id)) continue;
        edgeData.push(this._groupEdge(scene.id, tg));
      }
    }

    this._fanParallelEdges(edgeData);
    return { nodeData, edgeData };
  }

  _sceneNode(scene, initialId) {
    const isInitial  = scene.id === initialId;
    const isTerminal = scene.id === 100 || scene.id < 0;

    let bg, border;
    if (isTerminal)     { bg = '#fee2e2'; border = '#f87171'; }
    else if (isInitial) { bg = '#dcfce7'; border = '#4ade80'; }
    else                { bg = '#dbeafe'; border = '#93c5fd'; }

    const hasTimeout = scene.timeout ? ' ⏱' : '';
    const label = `${scene.title || '(untitled)'}${hasTimeout}\nID: ${scene.id}`;

    return {
      id:    scene.id,
      label,
      color: {
        background: bg,
        border,
        highlight: { background: bg, border: '#f59e0b' },
        hover:      { background: bg, border: '#60a5fa' }
      },
      font:  { color: '#1e293b', size: 13, face: 'Arial' },
      shape: 'box',
      margin:          { top: 10, right: 14, bottom: 10, left: 14 },
      widthConstraint: { minimum: 130, maximum: 220 },
      shadow: { enabled: true, color: 'rgba(0,0,0,0.10)', size: 6, x: 1, y: 2 }
    };
  }

  _triggerEdge(fromId, trigger, scenario) {
    const label = this._triggerLabel(trigger, scenario);
    const color = this._triggerEdgeColor(trigger);
    return {
      id:    `e${this._edgeSeq++}`,
      from:  fromId,
      to:    trigger.scene_id,
      label,
      color: { color, highlight: '#f59e0b', hover: '#f59e0b' },
      dashes: false,
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
      smooth: { enabled: true, type: 'curvedCW', roundness: 0.2 },
      font:   { size: 10, color: '#334155', align: 'middle' },
      width:  2
    };
  }

  _timeoutEdge(fromId, timeout) {
    return {
      id:    `e${this._edgeSeq++}`,
      from:  fromId,
      to:    timeout.scene_id,
      label: `timeout\n${timeout.timeout_value}s`,
      color: { color: '#f87171', highlight: '#ef4444', hover: '#ef4444' },
      dashes: true,
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
      smooth: { enabled: true, type: 'curvedCCW', roundness: 0.25 },
      font:   { size: 10, color: '#dc2626', align: 'middle' },
      width:  1.5
    };
  }

  _groupEdge(fromId, group) {
    return {
      id:    `e${this._edgeSeq++}`,
      from:  fromId,
      to:    group.scene_id,
      label: `GROUP\n${group.triggers_required}/${(group.triggers || []).length} req`,
      color: { color: '#c084fc', highlight: '#a855f7', hover: '#a855f7' },
      dashes: [8, 4],
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
      smooth: { enabled: true, type: 'curvedCW', roundness: 0.3 },
      font:   { size: 10, color: '#7e22ce', align: 'middle' },
      width:  2
    };
  }

  _triggerLabel(trigger, scenario) {
    switch (trigger.type) {
      case 'event': {
        let label = trigger.event_id;
        for (const cat of (scenario?.events || []))
          for (const ev of (cat.events || []))
            if (ev.id === trigger.event_id) { label = ev.title; break; }
        return label;
      }
      case 'cpr':
        return `CPR ${trigger.test || 'GTE'}\n${trigger.duration}s`;
      case 'param':
        return `${trigger.paramGroup}.${trigger.paramName}\n${trigger.test} ${trigger.paramValue}`;
      default:
        return trigger.type || '?';
    }
  }

  _triggerEdgeColor(trigger) {
    switch (trigger.type) {
      case 'event': return '#93c5fd';   // pastel blue
      case 'cpr':   return '#fcd34d';   // pastel amber
      case 'param': return '#6ee7b7';   // pastel green
      default:      return '#cbd5e1';   // light slate
    }
  }

  /**
   * Fans out all edges between the same pair of nodes so none overlap —
   * including edges going in opposite directions between the same two nodes.
   *
   * Key insight for vis-network:
   *   curvedCW on  A→B  bows to the RIGHT  globally.
   *   curvedCW on  B→A  bows to the LEFT   globally (travel direction is reversed).
   * So always using curvedCW naturally separates forward and backward edges.
   *
   * Strategy:
   *  • Group by UNDIRECTED pair (lo↔hi), collecting forward (from=lo) and backward edges.
   *  • When BOTH directions are present: forward edges fan out on the CW side starting
   *    at BASE_R; backward edges fan out on the CW side too — but they travel the other
   *    way, so they appear on the opposite side globally. No overlap.
   *  • When only ONE direction is present: use a symmetric fan centred on 0 so the
   *    arrows spread evenly around the direct line.
   */
  _fanParallelEdges(edgeData) {
    const BASE_R = 0.12;   // curvature for the first (innermost) edge on each side
    const STEP   = 0.18;   // gap per additional parallel edge

    // Group by undirected pair
    const groups = {};
    for (const e of edgeData) {
      const lo = Math.min(e.from, e.to);
      const hi = Math.max(e.from, e.to);
      const key = `${lo}↔${hi}`;
      if (!groups[key]) groups[key] = { lo, fwd: [], bwd: [] };
      (e.from === lo ? groups[key].fwd : groups[key].bwd).push(e);
    }

    for (const { fwd, bwd } of Object.values(groups)) {
      const hasBoth = fwd.length > 0 && bwd.length > 0;

      if (hasBoth) {
        // Both directions present — keep each side's arrows on their own side.
        // curvedCW for a forward edge bows right; curvedCW for a backward edge
        // bows left (globally) — they never cross.
        fwd.forEach((e, i) => {
          e.smooth = { enabled: true, type: 'curvedCW', roundness: BASE_R + i * STEP };
        });
        bwd.forEach((e, i) => {
          e.smooth = { enabled: true, type: 'curvedCW', roundness: BASE_R + i * STEP };
        });
      } else {
        // Only one direction — fan symmetrically around the direct line.
        const edges = fwd.length > 0 ? fwd : bwd;
        const n     = edges.length;
        if (n === 1) {
          edges[0].smooth = { enabled: true, type: 'curvedCW', roundness: BASE_R };
        } else {
          const half = (n - 1) / 2;
          edges.forEach((e, i) => {
            const c = (i - half) * STEP;
            if (Math.abs(c) < 0.01) {
              e.smooth = { enabled: true, type: 'curvedCW', roundness: 0.05 };
            } else if (c < 0) {
              e.smooth = { enabled: true, type: 'curvedCCW', roundness: -c };
            } else {
              e.smooth = { enabled: true, type: 'curvedCW',  roundness:  c };
            }
          });
        }
      }
    }
  }

  _sceneExists(scenario, id) {
    return scenario.scenes.some(s => s.id === id);
  }

  // ── Network options ───────────────────────────────────────────────────────

  /**
   * @param {boolean} hasSavedPositions  - if true, skip hierarchical layout & physics
   */
  _networkOptions(hasSavedPositions) {
    return {
      nodes: {
        shape: 'box',
        borderWidth: 2,
        borderWidthSelected: 3,
        shadow: true
      },
      edges: {
        width: 2,
        shadow: false,
        selectionWidth: 0
      },
      physics: hasSavedPositions
        ? { enabled: false }
        : {
            enabled: true,
            solver: 'hierarchicalRepulsion',
            hierarchicalRepulsion: {
              nodeDistance: 220,
              springLength:  160,
              springConstant: 0.01,
              damping: 0.09
            },
            stabilization: { iterations: 250, fit: true }
          },
      layout: hasSavedPositions
        ? { hierarchical: { enabled: false } }
        : {
            hierarchical: {
              enabled: true,
              direction: 'LR',
              sortMethod: 'directed',
              levelSeparation: 240,
              nodeSpacing: 140,
              treeSpacing: 200,
              blockShifting: true,
              edgeMinimization: true,
              parentCentralization: true
            }
          },
      interaction: {
        hover: true,
        multiselect: false,
        dragView: true,
        zoomView: true,
        dragNodes: true,          // always allow dragging
        tooltipDelay: 300,
        navigationButtons: false,
        keyboard: { enabled: false }
      }
    };
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  _wireNetworkEvents() {
    const net = this.network;

    net.on('selectNode',   (p) => { if (p.nodes.length) this._emit('nodeSelect', p.nodes[0]); });
    net.on('deselectNode', ()  => { this._emit('nodeSelect', null); });

    net.on('oncontext', (params) => {
      params.event.preventDefault();
      params.nodes.length
        ? this._showContextMenu(params.event, params.nodes[0])
        : this._showCanvasContextMenu(params.event);
    });

    net.on('click', () => { document.getElementById('ovs-context-menu')?.remove(); });

    // After a drag ends, capture positions and notify (debounced)
    net.on('dragEnd', (params) => {
      if (params.nodes.length > 0) {
        // Ensure physics stays off after dragging in auto-layout mode
        net.setOptions({ physics: { enabled: false } });
        this._scheduleSave();
      }
    });
  }

  // ── Position helpers ──────────────────────────────────────────────────────

  /** Raw positions straight from vis-network (keys are strings) */
  _rawPositions() {
    if (!this.network) return {};
    return this.network.getPositions();
  }

  /** Debounced: emits 'positionsChanged' 400 ms after the last drag */
  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._emitPositionsChanged(), 400);
  }

  _emitPositionsChanged() {
    this._emit('positionsChanged', this.getPositions());
  }

  // ── Context menus ─────────────────────────────────────────────────────────

  _showContextMenu(domEvent, sceneId) {
    this._clearContextMenu();
    const scene = this._scenario?.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const items = [
      { label: `✏️  Edit "${scene.title}"`,  action: () => this._emit('nodeSelect', sceneId) },
      { label: `🟢 Set as Initial Scene`,     action: () => this._emit('setInitial', sceneId) },
      null,
      { label: `🗑️  Delete Scene`, danger: true, action: () => this._emit('deleteScene', sceneId) }
    ];
    this._renderContextMenu(domEvent, items);
  }

  _showCanvasContextMenu(domEvent) {
    this._clearContextMenu();
    const items = [
      { label: `➕ Add New Scene`, action: () => this._emit('addScene', null) },
      { label: `⤢ Fit Graph`,      action: () => this.fit() },
      { label: `↺ Reset Layout`,   action: () => this._emit('resetLayout') }
    ];
    this._renderContextMenu(domEvent, items);
  }

  _renderContextMenu(domEvent, items) {
    const menu = document.createElement('div');
    menu.id = 'ovs-context-menu';
    menu.className = 'ctx-menu';
    menu.style.left = `${domEvent.clientX ?? domEvent.pageX}px`;
    menu.style.top  = `${domEvent.clientY ?? domEvent.pageY}px`;

    for (const item of items) {
      if (item === null) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        menu.appendChild(sep);
        continue;
      }
      const el = document.createElement('div');
      el.className = 'ctx-item' + (item.danger ? ' ctx-danger' : '');
      el.textContent = item.label;
      el.addEventListener('click', () => { this._clearContextMenu(); item.action(); });
      menu.appendChild(el);
    }

    document.body.appendChild(menu);

    // Keep within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  menu.style.left = `${window.innerWidth  - rect.width  - 4}px`;
    if (rect.bottom > window.innerHeight) menu.style.top  = `${window.innerHeight - rect.height - 4}px`;

    setTimeout(() => {
      document.addEventListener('click', () => this._clearContextMenu(), { once: true });
    }, 0);
  }

  _clearContextMenu() {
    document.getElementById('ovs-context-menu')?.remove();
  }

  // ── Internal emitter ──────────────────────────────────────────────────────

  _emit(event, ...args) {
    for (const cb of (this._handlers[event] || [])) cb(...args);
  }
}

if (typeof module !== 'undefined') module.exports = FlowChart;
