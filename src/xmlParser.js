'use strict';
/**
 * xmlParser.js
 * Converts an OVS main.xml string into a structured JS scenario model.
 */

const { XMLParser } = require('fast-xml-parser');

const ARRAY_TAGS = new Set(['scene', 'trigger', 'trigger_group', 'category', 'event', 'file', 'control']);

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '__attr_',
  isArray: (name) => ARRAY_TAGS.has(name),
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
  commentPropName: '__comment',
  allowBooleanAttributes: false
};

function parseScenario(xmlString) {
  const parser = new XMLParser(PARSER_OPTIONS);
  const raw = parser.parse(xmlString);
  const s = raw.scenario || raw;

  return {
    header:  parseHeader(s.header),
    profile: parseProfile(s.profile),
    vocals:  parseFileList(s.vocals),
    media:   parseFileList(s.media),
    events:  parseEventCategories(s.events),
    init:    parseGlobalInit(s.init),
    scenes:  parseSceneList(s),
    _filePath: null,
    _folderPath: null
  };
}

// ── Header ──────────────────────────────────────────────────────────────────

function parseHeader(h) {
  if (!h) return { author: '', title: { name: '', top: 5, left: 10 }, date_of_creation: '', description: '' };
  const title = h.title;
  return {
    author: str(h.author),
    title: typeof title === 'object'
      ? { name: str(title.name), top: num(title.top, 5), left: num(title.left, 10) }
      : { name: str(title), top: 5, left: 10 },
    date_of_creation: str(h.date_of_creation),
    description: str(h.description)
  };
}

// ── Profile ─────────────────────────────────────────────────────────────────

function parseProfile(p) {
  if (!p) return { avatar: {}, summary: {}, controls: { color: '#000000', controls: [] } };
  return {
    avatar: {
      filename: str(p.avatar?.filename),
      height_pct: num(p.avatar?.height_pct, 100),
      width_pct: num(p.avatar?.width_pct, 100)
    },
    summary: {
      description: str(p.summary?.description),
      breed:       str(p.summary?.breed),
      sex:         str(p.summary?.sex),
      weight:      str(p.summary?.weight),
      complaint:   str(p.summary?.complaint),
      image:       str(p.summary?.image),
      species:     str(p.summary?.species)
    },
    controls: parseControls(p.controls)
  };
}

function parseControls(c) {
  if (!c) return { color: '#000000', controls: [] };
  return {
    color: str(c.color) || '#000000',
    controls: (c.control || []).map(ctrl => ({
      title: str(ctrl.title),
      id:    str(ctrl.id),
      top:   num(ctrl.top),
      left:  num(ctrl.left)
    }))
  };
}

// ── Vocals / Media ───────────────────────────────────────────────────────────

function parseFileList(section) {
  if (!section) return [];
  const files = section.file || [];
  return (Array.isArray(files) ? files : [files]).map(f => ({
    filename: str(f.filename),
    title:    str(f.title)
  }));
}

// ── Events ───────────────────────────────────────────────────────────────────

function parseEventCategories(e) {
  if (!e || !e.category) return [];
  return (e.category || []).map(cat => ({
    name:   str(cat.name),
    title:  str(cat.title),
    events: (cat.event || []).map(ev => ({
      title:   str(ev.title),
      id:      str(ev.id),
      priority: num(ev.priority, 0),
      hotkey:  ev.hotkey !== undefined ? str(ev.hotkey) : ''
    }))
  }));
}

// ── Global init ──────────────────────────────────────────────────────────────

function parseGlobalInit(i) {
  if (!i) return { cardiac: {}, respiration: {}, general: {}, initial_scene: 1, record: 1 };
  return {
    cardiac:      parseCardiacFields(i.cardiac),
    respiration:  parseRespirationFields(i.respiration),
    general:      parseGeneralFields(i.general),
    initial_scene: num(i.initial_scene, 1),
    record:        num(i.record, 1)
  };
}

// ── Scenes ───────────────────────────────────────────────────────────────────

function parseSceneList(root) {
  if (!root.scene) return [];
  return (root.scene || []).map(parseScene);
}

function parseScene(raw) {
  return {
    title:    str(raw.title),
    id:       num(raw.id, 0),
    init:     parseSceneInit(raw.init),
    timeout:  parseTimeout(raw.timeout),
    simpleTriggers: [],
    triggerGroups:  [],
    ...parseTriggerSection(raw.triggers)
  };
}

function parseSceneInit(i) {
  if (!i) return { cardiac: {}, respiration: {}, general: {} };
  return {
    cardiac:     parseCardiacFields(i.cardiac),
    respiration: parseRespirationFields(i.respiration),
    general:     parseGeneralFields(i.general)
  };
}

function parseTimeout(t) {
  if (!t) return null;
  return {
    timeout_value: num(t.timeout_value, 30),
    scene_id:      num(t.scene_id, 0)
  };
}

function parseTriggerSection(triggers) {
  if (!triggers) return { simpleTriggers: [], triggerGroups: [] };

  const simpleTriggers = (triggers.trigger || []).map(parseTrigger);

  const triggerGroups = (triggers.trigger_group || []).map(tg => ({
    group_id:          str(tg.group_id),
    scene_id:          num(tg.scene_id, 0),
    triggers_required: num(tg.triggers_required, 1),
    triggers: (tg.trigger || []).map(parseTrigger)
  }));

  return { simpleTriggers, triggerGroups };
}

function parseTrigger(t) {
  if (!t) return { type: 'unknown', scene_id: 0 };

  const scene_id = num(t.scene_id, 0);

  // Event trigger
  if (t.event_id !== undefined) {
    return { type: 'event', event_id: str(t.event_id), scene_id };
  }

  // CPR trigger
  if (t.cpr !== undefined) {
    return {
      type: 'cpr',
      test: str(t.test) || 'GTE',
      scene_id,
      duration: num(t.cpr?.duration, 30)
    };
  }

  // Parameter trigger — has a test and a signal-group child element
  if (t.test !== undefined) {
    // Find the group (cardiac / respiration / general)
    let paramGroup = '', paramName = '', paramValue = '';
    let lowValue = '', highValue = '';

    for (const key of ['cardiac', 'respiration', 'general']) {
      if (t[key] !== undefined) {
        paramGroup = key;
        const groupObj = t[key];
        // The group object has one child: the parameter name
        for (const pname of Object.keys(groupObj)) {
          if (pname === 'low' || pname === 'high') continue;
          paramName = pname;
          paramValue = str(groupObj[pname]);
          lowValue  = str(groupObj.low);
          highValue = str(groupObj.high);
        }
        break;
      }
    }

    return {
      type: 'param',
      test: str(t.test),
      scene_id,
      paramGroup,
      paramName,
      paramValue,
      lowValue,
      highValue
    };
  }

  return { type: 'unknown', scene_id, raw: t };
}

// ── Physiological field parsers ──────────────────────────────────────────────

const CARDIAC_FIELDS = [
  'rhythm', 'vpc', 'pea', 'vpc_freq', 'vfib_amplitude',
  'rate', 'bps_sys', 'bps_dia', 'nibp_rate', 'pulse_strength',
  'heart_sound', 'heart_sound_volume', 'ecg_indicator', 'bp_cuff', 'arrest',
  'transfer_time'
];

const RESPIRATION_FIELDS = [
  'left_lung_sound', 'left_lung_sound_volume',
  'right_lung_sound', 'right_lung_sound_volume',
  'spo2', 'spo2_indicator', 'etco2', 'etco2_indicator',
  'rate', 'chest_movement', 'transfer_time'
];

const GENERAL_FIELDS = ['temperature', 'temperature_enable'];

function pickFields(obj, fields) {
  if (!obj) return {};
  const result = {};
  for (const f of fields) {
    if (obj[f] !== undefined && obj[f] !== null && obj[f] !== '') {
      result[f] = obj[f];
    }
  }
  return result;
}

function parseCardiacFields(c)     { return pickFields(c, CARDIAC_FIELDS); }
function parseRespirationFields(r) { return pickFields(r, RESPIRATION_FIELDS); }
function parseGeneralFields(g)     { return pickFields(g, GENERAL_FIELDS); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function str(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function num(v, def = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? def : n;
}

module.exports = {
  parseScenario,
  CARDIAC_FIELDS,
  RESPIRATION_FIELDS,
  GENERAL_FIELDS
};
