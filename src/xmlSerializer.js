'use strict';
/**
 * xmlSerializer.js
 * Converts the JS scenario model back to a well-formatted OVS XML string.
 */

function serializeScenario(scenario) {
  const lines = [];
  lines.push(`<?xml version='1.0' encoding='UTF-8'?>`);
  lines.push(`<scenario>`);

  lines.push(...indent(serializeHeader(scenario.header)));
  lines.push(...indent(serializeProfile(scenario.profile)));
  lines.push('');
  lines.push(...indent(serializeVocals(scenario.vocals)));
  lines.push('');
  lines.push(...indent(serializeMedia(scenario.media)));
  lines.push('');
  lines.push(...indent(serializeEvents(scenario.events)));
  lines.push('');
  lines.push(...indent(serializeGlobalInit(scenario.init)));
  lines.push('');

  for (const scene of (scenario.scenes || [])) {
    lines.push(...indent(serializeScene(scene)));
    lines.push('');
  }

  lines.push(`</scenario>`);
  return lines.join('\n');
}

// ── Header ───────────────────────────────────────────────────────────────────

function serializeHeader(h) {
  if (!h) return [];
  const t = h.title || {};
  return [
    '<header>',
    `    <author>${esc(h.author)}</author>`,
    `    <title>`,
    `        <name>${esc(t.name)}</name>`,
    `        <top>${t.top ?? 5}</top>`,
    `        <left>${t.left ?? 10}</left>`,
    `    </title>`,
    `    <date_of_creation>${esc(h.date_of_creation)}</date_of_creation>`,
    `    <description>${esc(h.description)}</description>`,
    '</header>'
  ];
}

// ── Profile ──────────────────────────────────────────────────────────────────

function serializeProfile(p) {
  if (!p) return [];
  const lines = ['<profile>'];

  // Avatar
  const av = p.avatar || {};
  lines.push('    <avatar>');
  lines.push(`        <filename>${esc(av.filename)}</filename>`);
  lines.push(`        <height_pct>${av.height_pct ?? 100}</height_pct>`);
  lines.push(`        <width_pct>${av.width_pct ?? 100}</width_pct>`);
  lines.push('    </avatar>');

  // Summary
  const sm = p.summary || {};
  lines.push('    <summary>');
  lines.push(`        <description>${esc(sm.description)}</description>`);
  lines.push(`        <breed>${esc(sm.breed)}</breed>`);
  lines.push(`        <sex>${esc(sm.sex)}</sex>`);
  lines.push(`        <weight>${esc(sm.weight)}</weight>`);
  lines.push(`        <complaint>${esc(sm.complaint)}</complaint>`);
  lines.push(`        <image>${esc(sm.image)}</image>`);
  lines.push(`        <species>${esc(sm.species)}</species>`);
  lines.push('    </summary>');

  // Controls
  const ctrl = p.controls || {};
  lines.push('    <controls>');
  lines.push(`        <color>${esc(ctrl.color || '#000000')}</color>`);
  for (const c of (ctrl.controls || [])) {
    lines.push('        <control>');
    lines.push(`            <title>${esc(c.title)}</title>`);
    lines.push(`            <id>${esc(c.id)}</id>`);
    lines.push(`            <top>${c.top}</top>`);
    lines.push(`            <left>${c.left}</left>`);
    lines.push('        </control>');
  }
  lines.push('    </controls>');

  lines.push('</profile>');
  return lines;
}

// ── Vocals / Media ────────────────────────────────────────────────────────────

function serializeVocals(vocals) {
  if (!vocals || !vocals.length) return ['<vocals>', '</vocals>'];
  const lines = ['<vocals>'];
  for (const f of vocals) {
    lines.push('    <file>');
    lines.push(`        <filename>${esc(f.filename)}</filename>`);
    lines.push(`        <title>${esc(f.title)}</title>`);
    lines.push('    </file>');
  }
  lines.push('</vocals>');
  return lines;
}

function serializeMedia(media) {
  if (!media || !media.length) return ['<media>', '</media>'];
  const lines = ['<media>'];
  for (const f of media) {
    lines.push('    <file>');
    lines.push(`        <filename>${esc(f.filename)}</filename>`);
    lines.push(`        <title>${esc(f.title)}</title>`);
    lines.push('    </file>');
  }
  lines.push('</media>');
  return lines;
}

// ── Events ────────────────────────────────────────────────────────────────────

function serializeEvents(categories) {
  if (!categories || !categories.length) return ['<events>', '</events>'];
  const lines = ['<events>'];
  for (const cat of categories) {
    lines.push('    <category>');
    lines.push(`        <name>${esc(cat.name)}</name>`);
    lines.push(`        <title>${esc(cat.title)}</title>`);
    for (const ev of (cat.events || [])) {
      lines.push('        <event>');
      lines.push(`            <title>${esc(ev.title)}</title>`);
      lines.push(`            <id>${esc(ev.id)}</id>`);
      lines.push(`            <priority>${ev.priority ?? 0}</priority>`);
      if (ev.hotkey) lines.push(`            <hotkey>${esc(ev.hotkey)}</hotkey>`);
      lines.push('        </event>');
    }
    lines.push('    </category>');
  }
  lines.push('</events>');
  return lines;
}

// ── Global Init ───────────────────────────────────────────────────────────────

function serializeGlobalInit(init) {
  if (!init) return [];
  const lines = ['<init>'];
  lines.push(...indent4(serializeCardiac(init.cardiac)));
  lines.push(...indent4(serializeRespiration(init.respiration)));
  lines.push(...indent4(serializeGeneral(init.general)));
  if (init.initial_scene !== undefined) lines.push(`    <initial_scene>${init.initial_scene}</initial_scene>`);
  if (init.record !== undefined)        lines.push(`    <record>${init.record}</record>`);
  lines.push('</init>');
  return lines;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function serializeScene(scene) {
  const lines = ['<scene>'];
  lines.push(`    <title>${esc(scene.title)}</title>`);
  lines.push(`    <id>${scene.id}</id>`);

  // Init
  const sc = scene.init?.cardiac || {};
  const sr = scene.init?.respiration || {};
  const sg = scene.init?.general || {};
  const hasCR = Object.keys(sc).length > 0;
  const hasResp = Object.keys(sr).length > 0;
  const hasGen = Object.keys(sg).length > 0;

  lines.push('    <init>');
  if (hasCR)   lines.push(...indent4(indent4(serializeCardiac(sc))));
  if (hasResp) lines.push(...indent4(indent4(serializeRespiration(sr))));
  if (hasGen)  lines.push(...indent4(indent4(serializeGeneral(sg))));
  lines.push('    </init>');

  // Timeout
  if (scene.timeout) {
    lines.push('    <timeout>');
    lines.push(`        <timeout_value>${scene.timeout.timeout_value}</timeout_value>`);
    lines.push(`        <scene_id>${scene.timeout.scene_id}</scene_id>`);
    lines.push('    </timeout>');
  }

  // Triggers
  const simpleTriggers = scene.simpleTriggers || [];
  const triggerGroups  = scene.triggerGroups  || [];
  if (simpleTriggers.length > 0 || triggerGroups.length > 0) {
    lines.push('    <triggers>');
    for (const t of simpleTriggers) {
      lines.push(...indent4(indent4(serializeTrigger(t))));
    }
    for (const tg of triggerGroups) {
      lines.push(...indent4(indent4(serializeTriggerGroup(tg))));
    }
    lines.push('    </triggers>');
  }

  lines.push('</scene>');
  return lines;
}

function serializeTrigger(t) {
  switch (t.type) {
    case 'event':
      return [
        '<trigger>',
        `    <event_id>${esc(t.event_id)}</event_id>`,
        `    <scene_id>${t.scene_id}</scene_id>`,
        '</trigger>'
      ];
    case 'cpr':
      return [
        '<trigger>',
        `    <test>${esc(t.test || 'GTE')}</test>`,
        `    <scene_id>${t.scene_id}</scene_id>`,
        `    <cpr>`,
        `        <duration>${t.duration}</duration>`,
        `    </cpr>`,
        '</trigger>'
      ];
    case 'param': {
      const gContent = t.paramValue !== undefined
        ? `<${t.paramName}>${t.paramValue}</${t.paramName}>`
        : '';
      const lowHigh = (t.test === 'INSIDE' || t.test === 'OUTSIDE')
        ? `        <low>${t.lowValue}</low>\n        <high>${t.highValue}</high>`
        : `        ${gContent}`;
      return [
        '<trigger>',
        `    <test>${esc(t.test)}</test>`,
        `    <scene_id>${t.scene_id}</scene_id>`,
        `    <${t.paramGroup}>`,
        lowHigh,
        `    </${t.paramGroup}>`,
        '</trigger>'
      ];
    }
    default:
      return [`<!-- unknown trigger type: ${t.type} -->`];
  }
}

function serializeTriggerGroup(tg) {
  const lines = ['<trigger_group>'];
  if (tg.group_id) lines.push(`    <group_id>${esc(tg.group_id)}</group_id>`);
  lines.push(`    <scene_id>${tg.scene_id}</scene_id>`);
  lines.push(`    <triggers_required>${tg.triggers_required ?? 1}</triggers_required>`);
  for (const t of (tg.triggers || [])) {
    lines.push(...indent4(serializeTrigger(t)));
  }
  lines.push('</trigger_group>');
  return lines;
}

// ── Physiological sections ────────────────────────────────────────────────────

function serializeCardiac(c) {
  if (!c || !Object.keys(c).length) return [];
  const order = [
    'rhythm', 'vpc', 'pea', 'vpc_freq', 'vfib_amplitude',
    'rate', 'bps_sys', 'bps_dia', 'nibp_rate', 'pulse_strength',
    'heart_sound', 'heart_sound_volume', 'ecg_indicator', 'bp_cuff', 'arrest'
  ];
  return wrapBlock('cardiac', c, order);
}

function serializeRespiration(r) {
  if (!r || !Object.keys(r).length) return [];
  const order = [
    'left_lung_sound', 'left_lung_sound_volume',
    'right_lung_sound', 'right_lung_sound_volume',
    'spo2', 'spo2_indicator', 'etco2', 'etco2_indicator',
    'rate', 'chest_movement', 'transfer_time'
  ];
  return wrapBlock('respiration', r, order);
}

function serializeGeneral(g) {
  if (!g || !Object.keys(g).length) return [];
  return wrapBlock('general', g, ['temperature', 'temperature_enable']);
}

function wrapBlock(tag, obj, order) {
  const lines = [`<${tag}>`];
  for (const key of order) {
    if (obj[key] !== undefined) {
      lines.push(`    <${key}>${obj[key]}</${key}>`);
    }
  }
  // Any extra keys not in order
  for (const key of Object.keys(obj)) {
    if (!order.includes(key)) {
      lines.push(`    <${key}>${obj[key]}</${key}>`);
    }
  }
  lines.push(`</${tag}>`);
  return lines;
}

// ── Indent helpers ────────────────────────────────────────────────────────────

function indent(lines)  { return lines.map(l => '    ' + l); }
function indent4(lines) { return lines.map(l => '    ' + l); }

// ── XML escape ────────────────────────────────────────────────────────────────

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

module.exports = { serializeScenario };
