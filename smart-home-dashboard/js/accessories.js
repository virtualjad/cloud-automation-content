// accessories.js — type metadata + tile/detail renderers.
//
// Each accessory type declares:
//   - icon         : default SVG icon
//   - tile(acc)    : compact tile body (innerHTML)
//   - detail(acc, send) : full control panel (DOM node)
//   - primaryAction(acc) : returned command for tap-on-tile interaction
//
// `send(command)` is provided by the host so renderers don't depend on
// the connector layer directly.

const ICONS = {
  bulb:   '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19a7 7 0 0 0-4 12.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26A7 7 0 0 0 12 2z"/></svg>',
  lamp:   '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7 2h10l3 8H4l3-8zm-1 9h12v2H6v-2zm5 3h2v8h-2v-8z"/></svg>',
  outlet: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm4 6v3H7V9h2zm8 0v3h-2V9h2zm-7 6h4v2h-4v-2z"/></svg>',
  thermo: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15 13V5a3 3 0 1 0-6 0v8a5 5 0 1 0 6 0zm-3-9a1 1 0 0 1 1 1v8.4a3 3 0 1 1-2 0V5a1 1 0 0 1 1-1z"/></svg>',
  lock:   '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-9-2a3 3 0 1 1 6 0v2H9V6zm3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>',
  blind:  '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 3h18v2H3V3zm2 4h14v2H5V7zm0 4h14v2H5v-2zm0 4h14v2H5v-2zm0 4h6v2H5v-2zm8 0h6v2h-6v-2z"/></svg>',
  fan:    '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm0-9c2.21 0 4 1.79 4 4 0 1.5-.83 2.81-2.06 3.5C15.17 9.81 16 11.12 16 12.5c0 2.21-1.79 4-4 4s-4-1.79-4-4c0-1.38.83-2.69 2.06-3.5C8.83 8.81 8 7.5 8 6c0-2.21 1.79-4 4-4z"/></svg>',
  sensor: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm0-12a4 4 0 1 0 4 4 4 4 0 0 0-4-4z"/></svg>',
  scene:  '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.5 5.8 22l2.4-8.1L2 9.4h7.6L12 2z"/></svg>',
};

function pickIcon(acc) {
  if (acc.icon && acc.icon !== 'auto' && ICONS[acc.icon]) return ICONS[acc.icon];
  const map = {
    light: 'bulb', dimmer: 'lamp', 'color-light': 'bulb',
    switch: 'outlet', thermostat: 'thermo', lock: 'lock',
    blind: 'blind', fan: 'fan', scene: 'scene',
    'sensor-temp': 'sensor', 'sensor-motion': 'sensor', 'sensor-contact': 'sensor',
  };
  return ICONS[map[acc.type] || 'bulb'];
}

function relativeTime(ts) {
  if (!ts) return '—';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s/60)}m ago`;
  if (s < 86400) return `${Math.round(s/3600)}h ago`;
  return `${Math.round(s/86400)}d ago`;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

const SWATCHES = ['#ffffff','#ffd166','#ffb05a','#ff6b6b','#c879ff','#6a8cff','#6ad8ff','#7cffb2'];

/* ---------------- Tile renderers ---------------- */

const TYPES = {
  light: {
    isOn: a => !!a.state.on,
    tile: a => `
      <div class="tile-state">${a.state.on ? 'On' : 'Off'}</div>
      <div class="tile-body">
        <div></div>
        <div class="toggle" data-on="${!!a.state.on}" data-action="toggle"></div>
      </div>`,
    primary: a => ({ on: !a.state.on }),
    detail: (a, send) => buildDimmerDetail(a, send, { color: false }),
  },
  switch: {
    isOn: a => !!a.state.on,
    tile: a => `
      <div class="tile-state">${a.state.on ? 'On' : 'Off'}${a.state.watts != null ? ` · ${a.state.watts}W` : ''}</div>
      <div class="tile-body">
        <div></div>
        <div class="toggle" data-on="${!!a.state.on}" data-action="toggle"></div>
      </div>`,
    primary: a => ({ on: !a.state.on }),
    detail: (a, send) => buildToggleDetail(a, send),
  },
  dimmer: {
    isOn: a => !!a.state.on,
    tile: a => `
      <div class="tile-state">${a.state.on ? `${a.state.brightness ?? 100}%` : 'Off'}</div>
      <div class="tile-body">
        <div class="tile-value">${a.state.on ? (a.state.brightness ?? 100) : 0}<span class="tile-unit">%</span></div>
        <div class="toggle" data-on="${!!a.state.on}" data-action="toggle"></div>
      </div>`,
    primary: a => ({ on: !a.state.on }),
    detail: (a, send) => buildDimmerDetail(a, send, { color: false }),
  },
  'color-light': {
    isOn: a => !!a.state.on,
    tile: a => `
      <div class="tile-state">${a.state.on ? `${a.state.brightness ?? 100}%` : 'Off'}</div>
      <div class="tile-body">
        <div class="tile-value" style="color:${a.state.on ? (a.state.hex || '#fff') : 'inherit'}">${a.state.on ? (a.state.brightness ?? 100) : 0}<span class="tile-unit">%</span></div>
        <div class="toggle" data-on="${!!a.state.on}" data-action="toggle"></div>
      </div>`,
    primary: a => ({ on: !a.state.on }),
    detail: (a, send) => buildDimmerDetail(a, send, { color: true }),
  },
  thermostat: {
    isOn: a => a.state.mode && a.state.mode !== 'off',
    tile: a => `
      <div class="tile-state">${escape(a.state.mode || 'auto')} · target ${a.state.target ?? '--'}°</div>
      <div class="tile-body">
        <div class="tile-value">${a.state.current ?? '--'}<span class="tile-unit">°</span></div>
      </div>`,
    primary: () => null, // tap opens detail
    detail: (a, send) => buildThermostatDetail(a, send),
  },
  lock: {
    isOn: a => !a.state.locked,
    tile: a => `
      <div class="tile-state">${a.state.locked ? 'Locked' : 'Unlocked'}</div>
      <div class="tile-body">
        <div class="tile-value" style="font-size:18px">${a.state.locked ? 'Secured' : 'Open'}</div>
        <div class="toggle" data-on="${!a.state.locked}" data-action="toggle"></div>
      </div>`,
    primary: a => ({ locked: !a.state.locked }),
    detail: (a, send) => buildLockDetail(a, send),
  },
  blind: {
    isOn: a => (a.state.position ?? 0) > 0,
    tile: a => `
      <div class="tile-state">${a.state.position ?? 0}% open</div>
      <div class="tile-body">
        <div class="tile-value">${a.state.position ?? 0}<span class="tile-unit">%</span></div>
      </div>`,
    primary: () => null,
    detail: (a, send) => buildBlindDetail(a, send),
  },
  fan: {
    isOn: a => !!a.state.on,
    tile: a => `
      <div class="tile-state">${a.state.on ? `Speed ${a.state.speed ?? 1}` : 'Off'}</div>
      <div class="tile-body">
        <div></div>
        <div class="toggle" data-on="${!!a.state.on}" data-action="toggle"></div>
      </div>`,
    primary: a => ({ on: !a.state.on }),
    detail: (a, send) => buildFanDetail(a, send),
  },
  'sensor-temp': {
    isOn: () => false,
    tile: a => `
      <div class="tile-state">Updated ${relativeTime(a.state.last)}</div>
      <div class="tile-body">
        <div class="tile-value">${a.state.temp ?? '--'}<span class="tile-unit">°</span></div>
      </div>`,
    primary: () => null,
    detail: (a) => buildReadOnlyDetail(a, [['Temperature', `${a.state.temp ?? '--'}°`], ['Humidity', `${a.state.humidity ?? '--'}%`]]),
  },
  'sensor-motion': {
    isOn: a => !!a.state.motion,
    tile: a => `
      <div class="tile-state">${a.state.motion ? 'Motion detected' : `Clear · ${relativeTime(a.state.last)}`}</div>
      <div class="tile-body">
        <div class="tile-value" style="font-size:18px">${a.state.motion ? 'Active' : 'Idle'}</div>
      </div>`,
    primary: () => null,
    detail: (a) => buildReadOnlyDetail(a, [['Status', a.state.motion ? 'Motion detected' : 'Clear'], ['Last event', relativeTime(a.state.last)]]),
  },
  'sensor-contact': {
    isOn: a => !!a.state.open,
    tile: a => `
      <div class="tile-state">${a.state.open ? 'Open' : 'Closed'}</div>
      <div class="tile-body">
        <div class="tile-value" style="font-size:18px">${a.state.open ? 'Open' : 'Closed'}</div>
      </div>`,
    primary: () => null,
    detail: (a) => buildReadOnlyDetail(a, [['State', a.state.open ? 'Open' : 'Closed'], ['Last event', relativeTime(a.state.last)]]),
  },
  scene: {
    isOn: () => false,
    tile: () => `
      <div class="tile-state">Tap to activate</div>
      <div class="tile-body">
        <div class="tile-value" style="font-size:16px">Run scene</div>
      </div>`,
    primary: () => ({ activate: true }),
    detail: (a, send) => buildSceneDetail(a, send),
  },
};

/* ---------------- Detail builders ---------------- */

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}

function detailHeader(acc) {
  const icon = el('div', { class: 'detail-icon' });
  icon.innerHTML = pickIcon(acc);
  return el('div', { class: 'detail-header' }, [
    icon,
    el('div', {}, [
      el('div', { class: 'detail-title' }, acc.name),
      el('div', { class: 'detail-sub' }, `${acc.protocol.toUpperCase()} · ${acc.type} · ${acc.room || 'Unassigned'}`),
    ]),
  ]);
}

function buildToggleDetail(acc, send) {
  const root = el('div');
  root.appendChild(detailHeader(acc));
  const ctl = el('div', { class: 'detail-control' }, [
    el('h4', {}, 'Power'),
    el('label', { class: 'checkbox' }, [
      (() => {
        const t = el('div', { class: 'toggle' });
        t.dataset.on = String(!!acc.state.on);
        t.addEventListener('click', () => {
          const newVal = !(t.dataset.on === 'true');
          t.dataset.on = String(newVal);
          send({ on: newVal });
        });
        return t;
      })(),
      ' On / Off',
    ]),
  ]);
  root.appendChild(ctl);
  return root;
}

function buildDimmerDetail(acc, send, { color }) {
  const root = el('div');
  root.appendChild(detailHeader(acc));

  // Power
  const power = el('div', { class: 'detail-control' });
  power.appendChild(el('h4', {}, 'Power'));
  const powerToggle = el('div', { class: 'toggle' });
  powerToggle.dataset.on = String(!!acc.state.on);
  powerToggle.addEventListener('click', () => {
    const newVal = !(powerToggle.dataset.on === 'true');
    powerToggle.dataset.on = String(newVal);
    send({ on: newVal });
  });
  power.appendChild(powerToggle);
  root.appendChild(power);

  // Brightness
  const bright = el('div', { class: 'detail-control' });
  bright.appendChild(el('h4', {}, `Brightness — ${acc.state.brightness ?? 100}%`));
  const slider = el('input', { type: 'range', min: '1', max: '100', value: String(acc.state.brightness ?? 100), class: 'slider' });
  slider.addEventListener('input', () => {
    bright.querySelector('h4').textContent = `Brightness — ${slider.value}%`;
  });
  slider.addEventListener('change', () => send({ brightness: Number(slider.value), on: true }));
  bright.appendChild(slider);
  root.appendChild(bright);

  if (color) {
    const c = el('div', { class: 'detail-control' });
    c.appendChild(el('h4', {}, 'Color'));
    const wheel = el('div', { class: 'color-wheel' });
    for (const hex of SWATCHES) {
      const sw = el('div', { class: 'color-swatch' + (acc.state.hex === hex ? ' selected' : '') });
      sw.style.background = hex;
      sw.addEventListener('click', () => {
        wheel.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        send({ hex, on: true });
      });
      wheel.appendChild(sw);
    }
    c.appendChild(wheel);
    root.appendChild(c);
  }
  return root;
}

function buildThermostatDetail(acc, send) {
  const root = el('div');
  root.appendChild(detailHeader(acc));

  const target = el('div', { class: 'detail-control' });
  const heading = el('h4', {}, `Target — ${acc.state.target ?? 70}°`);
  target.appendChild(heading);
  const slider = el('input', { type: 'range', min: '50', max: '90', value: String(acc.state.target ?? 70), class: 'slider' });
  slider.addEventListener('input', () => heading.textContent = `Target — ${slider.value}°`);
  slider.addEventListener('change', () => send({ target: Number(slider.value) }));
  target.appendChild(slider);
  root.appendChild(target);

  const mode = el('div', { class: 'detail-control' });
  mode.appendChild(el('h4', {}, 'Mode'));
  const select = el('select');
  for (const m of ['off', 'heat', 'cool', 'auto']) {
    const o = el('option', { value: m }, m);
    if (acc.state.mode === m) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', () => send({ mode: select.value }));
  mode.appendChild(select);
  root.appendChild(mode);

  return root;
}

function buildLockDetail(acc, send) {
  const root = el('div');
  root.appendChild(detailHeader(acc));
  const ctl = el('div', { class: 'detail-control' });
  ctl.appendChild(el('h4', {}, acc.state.locked ? 'Locked' : 'Unlocked'));
  const btn = el('button', { class: 'primary', onclick: () => send({ locked: !acc.state.locked }) }, acc.state.locked ? 'Unlock' : 'Lock');
  btn.style.cssText = 'padding:12px 20px;border-radius:10px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:14px;';
  ctl.appendChild(btn);
  root.appendChild(ctl);
  return root;
}

function buildBlindDetail(acc, send) {
  const root = el('div');
  root.appendChild(detailHeader(acc));
  const ctl = el('div', { class: 'detail-control' });
  const heading = el('h4', {}, `Position — ${acc.state.position ?? 0}%`);
  ctl.appendChild(heading);
  const slider = el('input', { type: 'range', min: '0', max: '100', value: String(acc.state.position ?? 0), class: 'slider' });
  slider.addEventListener('input', () => heading.textContent = `Position — ${slider.value}%`);
  slider.addEventListener('change', () => send({ position: Number(slider.value) }));
  ctl.appendChild(slider);
  root.appendChild(ctl);
  return root;
}

function buildFanDetail(acc, send) {
  const root = el('div');
  root.appendChild(detailHeader(acc));

  const power = el('div', { class: 'detail-control' });
  power.appendChild(el('h4', {}, 'Power'));
  const t = el('div', { class: 'toggle' });
  t.dataset.on = String(!!acc.state.on);
  t.addEventListener('click', () => {
    const v = !(t.dataset.on === 'true');
    t.dataset.on = String(v);
    send({ on: v });
  });
  power.appendChild(t);
  root.appendChild(power);

  const speed = el('div', { class: 'detail-control' });
  const heading = el('h4', {}, `Speed — ${acc.state.speed ?? 1}`);
  speed.appendChild(heading);
  const slider = el('input', { type: 'range', min: '1', max: '5', value: String(acc.state.speed ?? 1), class: 'slider' });
  slider.addEventListener('input', () => heading.textContent = `Speed — ${slider.value}`);
  slider.addEventListener('change', () => send({ speed: Number(slider.value), on: true }));
  speed.appendChild(slider);
  root.appendChild(speed);

  return root;
}

function buildSceneDetail(acc, send) {
  const root = el('div');
  root.appendChild(detailHeader(acc));
  const ctl = el('div', { class: 'detail-control' });
  ctl.appendChild(el('h4', {}, 'Activate Scene'));
  const btn = el('button', { class: 'primary', onclick: () => send({ activate: true }) }, `Run "${acc.name}"`);
  btn.style.cssText = 'padding:12px 20px;border-radius:10px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:14px;';
  ctl.appendChild(btn);
  root.appendChild(ctl);
  return root;
}

function buildReadOnlyDetail(acc, rows) {
  const root = el('div');
  root.appendChild(detailHeader(acc));
  const ctl = el('div', { class: 'detail-control' });
  ctl.appendChild(el('h4', {}, 'Readings'));
  for (const [label, value] of rows) {
    const row = el('div', { style: 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);' }, [
      el('span', { style: 'color:var(--text-muted)' }, label),
      el('span', {}, String(value)),
    ]);
    ctl.appendChild(row);
  }
  root.appendChild(ctl);
  return root;
}

/* ---------------- Public API ---------------- */

export function renderTile(acc) {
  const t = TYPES[acc.type] || TYPES.switch;
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.id = acc.id;
  tile.dataset.size = acc.size || '1x1';
  tile.dataset.on = String(t.isOn(acc));
  tile.draggable = true;
  tile.innerHTML = `
    <div class="tile-remove" data-action="remove">×</div>
    <div class="tile-header">
      <div class="tile-icon">${pickIcon(acc)}</div>
      <div class="tile-name">${escape(acc.name)}</div>
    </div>
    ${t.tile(acc)}
    <div class="tile-meta">
      <span class="protocol-pill">${escape(acc.protocol)}</span>
      <span>${escape(acc.room || '')}</span>
    </div>`;
  return tile;
}

export function renderDetail(acc, send) {
  const t = TYPES[acc.type] || TYPES.switch;
  return t.detail(acc, send);
}

export function primaryAction(acc) {
  const t = TYPES[acc.type] || TYPES.switch;
  return t.primary(acc);
}

export function listTypes() { return Object.keys(TYPES); }
