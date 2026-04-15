// main.js — application controller.
// Wires the store, connectors, and renderers together.

import { store } from './store.js';
import { connectorManager } from './connectors.js';
import { renderTile, renderDetail, primaryAction } from './accessories.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const dashboardEl     = $('#dashboard');
const roomTabsEl      = $('#room-tabs');
const titleEl         = $('#dashboard-title');
const statusTextEl    = $('#status-text');
const connectionPill  = $('#connection-pill');

const accessoryDialog = $('#modal-accessory');
const accessoryForm   = $('#accessory-form');
const accessoryTitle  = $('#accessory-form-title');
const accessoryDelete = $('#accessory-delete');
const accessoryCancel = $('#accessory-cancel');

const settingsDialog  = $('#modal-settings');
const settingsForm    = $('#settings-form');
const settingsCancel  = $('#settings-cancel');

const detailDialog    = $('#modal-detail');
const detailContent   = $('#detail-content');
const detailEditBtn   = $('#detail-edit');
const detailCloseBtn  = $('#detail-close');

const btnEdit     = $('#btn-edit');
const btnAdd      = $('#btn-add');
const btnSettings = $('#btn-settings');

let editingAccessoryId = null;   // currently-edited accessory in dialog
let detailAccessoryId  = null;   // currently-shown accessory in detail dialog
let editMode = false;

/* ---------------- Render ---------------- */

function applyTheme() {
  document.documentElement.setAttribute('data-theme', store.config.darkMode ? 'dark' : 'light');
}

function renderRoomTabs() {
  const rooms = store.getRooms();
  roomTabsEl.innerHTML = '';
  for (const room of rooms) {
    const key = room.toLowerCase() === 'all' ? 'all' : room;
    const btn = document.createElement('button');
    btn.className = 'room-tab';
    btn.textContent = room;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(store.config.activeRoom === key));
    btn.addEventListener('click', () => {
      store.config.activeRoom = key;
      store.save();
    });
    roomTabsEl.appendChild(btn);
  }
}

function visibleAccessories() {
  const room = store.config.activeRoom;
  if (!room || room === 'all') return store.config.accessories;
  if (room === 'Favorites') return store.config.accessories.filter(a => a.favorite);
  return store.config.accessories.filter(a => (a.room || '') === room);
}

function renderDashboard() {
  titleEl.textContent = store.config.title || 'Home';
  document.title = `${titleEl.textContent} · Smart Home`;
  applyTheme();
  renderRoomTabs();

  dashboardEl.classList.toggle('is-editing', editMode);
  dashboardEl.innerHTML = '';

  const accs = visibleAccessories();
  if (accs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `
      <div>No accessories in this view.</div>
      <button class="primary" id="empty-add" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer;">Add accessory</button>
    `;
    empty.querySelector('#empty-add').addEventListener('click', () => openAccessoryDialog());
    dashboardEl.appendChild(empty);
    return;
  }

  for (const acc of accs) {
    const tile = renderTile(acc);
    bindTile(tile, acc);
    dashboardEl.appendChild(tile);
  }
}

/* ---------------- Tile interaction ---------------- */

function bindTile(tile, acc) {
  tile.addEventListener('click', async (e) => {
    if (editMode) {
      const action = e.target.closest('[data-action]');
      if (action?.dataset.action === 'remove') {
        if (confirm(`Remove "${acc.name}"?`)) store.removeAccessory(acc.id);
        return;
      }
      openAccessoryDialog(acc.id);
      return;
    }

    // Inline action (e.g. tap toggle on tile)
    const inline = e.target.closest('[data-action]');
    if (inline?.dataset.action === 'toggle') {
      e.stopPropagation();
      const cmd = acc.type === 'lock'
        ? { locked: !acc.state.locked }
        : { on: !acc.state.on };
      await sendAndPersist(acc, cmd);
      return;
    }

    // Default: primary action if defined, else open detail
    const cmd = primaryAction(acc);
    if (cmd) {
      await sendAndPersist(acc, cmd);
    } else {
      openDetailDialog(acc.id);
    }
  });

  // Drag and drop reordering (only in edit mode)
  tile.addEventListener('dragstart', (e) => {
    if (!editMode) { e.preventDefault(); return; }
    tile.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', acc.id);
  });
  tile.addEventListener('dragend', () => {
    tile.classList.remove('dragging');
    $$('.tile.drop-target').forEach(t => t.classList.remove('drop-target'));
  });
  tile.addEventListener('dragover', (e) => {
    if (!editMode) return;
    e.preventDefault();
    tile.classList.add('drop-target');
  });
  tile.addEventListener('dragleave', () => tile.classList.remove('drop-target'));
  tile.addEventListener('drop', (e) => {
    e.preventDefault();
    tile.classList.remove('drop-target');
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === acc.id) return;
    const ids = store.config.accessories.map(a => a.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(acc.id);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    store.reorder(ids);
  });
}

async function sendAndPersist(acc, command) {
  if (!command) return;
  setStatus(`Sending to ${acc.name}…`);
  try {
    const result = await connectorManager.send(acc, command);
    store.updateAccessory(acc.id, { state: { ...acc.state, ...result } });
    setStatus(`${acc.name} updated`);
  } catch (e) {
    setStatus(`Error: ${e.message}`, true);
  }
}

/* ---------------- Edit mode ---------------- */

btnEdit.addEventListener('click', () => {
  editMode = !editMode;
  btnEdit.classList.toggle('active', editMode);
  setStatus(editMode ? 'Edit mode — drag to reorder, tap to edit, × to remove' : 'Ready');
  renderDashboard();
});

btnAdd.addEventListener('click', () => openAccessoryDialog());

/* ---------------- Accessory dialog ---------------- */

function openAccessoryDialog(id = null) {
  editingAccessoryId = id;
  populateBridgeOptions();
  populateRoomSuggestions();
  if (id) {
    const a = store.config.accessories.find(x => x.id === id);
    if (!a) return;
    accessoryTitle.textContent = 'Edit Accessory';
    accessoryDelete.hidden = false;
    accessoryForm.elements.name.value = a.name || '';
    accessoryForm.elements.protocol.value = a.protocol || 'homekit';
    accessoryForm.elements.type.value = a.type || 'light';
    accessoryForm.elements.room.value = a.room || '';
    accessoryForm.elements.icon.value = a.icon || 'auto';
    accessoryForm.elements.deviceId.value = a.deviceId || '';
    accessoryForm.elements.size.value = a.size || '1x1';
    accessoryForm.elements.bridge.value = a.bridge || 'auto';
  } else {
    accessoryTitle.textContent = 'Add Accessory';
    accessoryDelete.hidden = true;
    accessoryForm.reset();
  }
  accessoryDialog.showModal();
}

function populateBridgeOptions() {
  const sel = accessoryForm.elements.bridge;
  sel.innerHTML = '';
  for (const v of [['auto','Auto-pick by protocol'], ['homekit','HomeKit bridge'], ['matter','Matter controller'], ['zigbee','Zigbee bridge']]) {
    const o = document.createElement('option');
    o.value = v[0]; o.textContent = v[1];
    sel.appendChild(o);
  }
}

function populateRoomSuggestions() {
  const dl = document.getElementById('room-suggestions');
  dl.innerHTML = '';
  for (const room of store.getRooms()) {
    if (room === 'All' || room === 'Favorites') continue;
    const o = document.createElement('option');
    o.value = room;
    dl.appendChild(o);
  }
}

accessoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(accessoryForm).entries());
  if (editingAccessoryId) {
    store.updateAccessory(editingAccessoryId, data);
  } else {
    store.addAccessory({ ...data, state: defaultStateFor(data.type) });
  }
  accessoryDialog.close();
});

accessoryCancel.addEventListener('click', () => accessoryDialog.close());

accessoryDelete.addEventListener('click', () => {
  if (editingAccessoryId && confirm('Remove this accessory?')) {
    store.removeAccessory(editingAccessoryId);
    accessoryDialog.close();
  }
});

function defaultStateFor(type) {
  switch (type) {
    case 'light':
    case 'switch':
    case 'fan':         return { on: false };
    case 'dimmer':      return { on: false, brightness: 80 };
    case 'color-light': return { on: false, brightness: 80, hex: '#ffffff' };
    case 'thermostat':  return { current: 70, target: 70, mode: 'auto' };
    case 'lock':        return { locked: true };
    case 'blind':       return { position: 0 };
    case 'sensor-temp': return { temp: '--', humidity: '--', last: Date.now() };
    case 'sensor-motion': return { motion: false, last: Date.now() };
    case 'sensor-contact': return { open: false, last: Date.now() };
    case 'scene':       return {};
    default:            return {};
  }
}

/* ---------------- Settings dialog ---------------- */

btnSettings.addEventListener('click', () => {
  settingsForm.elements.title.value     = store.config.title || '';
  settingsForm.elements.darkMode.checked = !!store.config.darkMode;
  settingsForm.elements.demoMode.checked = !!store.config.demoMode;
  const c = store.config.connectors || {};
  settingsForm.elements.hk_url.value      = c.homekit?.url || '';
  settingsForm.elements.hk_token.value    = c.homekit?.token || '';
  settingsForm.elements.matter_url.value  = c.matter?.url || '';
  settingsForm.elements.matter_token.value = c.matter?.token || '';
  settingsForm.elements.zigbee_url.value  = c.zigbee?.url || '';
  settingsForm.elements.zigbee_token.value = c.zigbee?.token || '';
  settingsDialog.showModal();
});

settingsCancel.addEventListener('click', () => settingsDialog.close());

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = settingsForm.elements;
  store.config.title    = f.title.value || 'Home';
  store.config.darkMode = f.darkMode.checked;
  store.config.demoMode = f.demoMode.checked;
  store.config.connectors = {
    homekit: { url: f.hk_url.value.trim(),     token: f.hk_token.value },
    matter:  { url: f.matter_url.value.trim(), token: f.matter_token.value },
    zigbee:  { url: f.zigbee_url.value.trim(), token: f.zigbee_token.value },
  };
  store.save();
  settingsDialog.close();
  await reconnect();
});

// Backup buttons
$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([store.export()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smart-home-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$('#btn-import').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    store.import(await file.text());
    setStatus('Configuration imported');
  } catch (err) {
    setStatus(`Import failed: ${err.message}`, true);
  }
});

$('#btn-reset').addEventListener('click', () => {
  if (confirm('Reset to defaults? This will erase your customization.')) {
    store.reset();
    settingsDialog.close();
  }
});

/* ---------------- Detail dialog ---------------- */

function openDetailDialog(id) {
  detailAccessoryId = id;
  const acc = store.config.accessories.find(a => a.id === id);
  if (!acc) return;
  detailContent.innerHTML = '';
  detailContent.appendChild(renderDetail(acc, async (cmd) => {
    await sendAndPersist(acc, cmd);
    // re-render detail in place to reflect new state
    const fresh = store.config.accessories.find(a => a.id === id);
    detailContent.innerHTML = '';
    detailContent.appendChild(renderDetail(fresh, async (cmd2) => sendAndPersist(fresh, cmd2)));
  }));
  detailDialog.showModal();
}

detailCloseBtn.addEventListener('click', () => detailDialog.close());
detailEditBtn.addEventListener('click', () => {
  const id = detailAccessoryId;
  detailDialog.close();
  if (id) openAccessoryDialog(id);
});

/* ---------------- Connector lifecycle ---------------- */

async function reconnect() {
  setStatus('Connecting…');
  setConnectionStatus('connecting');
  connectorManager.configure(store.config);
  try {
    const { ok, total } = await connectorManager.connectAll();
    if (store.config.demoMode) {
      setConnectionStatus('demo');
      setStatus('Demo mode — changes are simulated locally');
    } else if (ok === total) {
      setConnectionStatus('connected');
      setStatus(`Connected to ${ok} bridge${ok === 1 ? '' : 's'}`);
    } else if (ok > 0) {
      setConnectionStatus('connected');
      setStatus(`Connected to ${ok} of ${total} bridges`);
    } else {
      setConnectionStatus('disconnected');
      setStatus('No bridges available — falling back to demo mode');
    }
  } catch (e) {
    setConnectionStatus('disconnected');
    setStatus(`Connection failed: ${e.message}`, true);
  }
}

// Listen for incoming device updates and merge into the store.
connectorManager.onUpdate((u) => {
  if (u.type === 'simulate-motion') {
    // Demo: flip a random motion sensor briefly.
    const sensors = store.config.accessories.filter(a => a.type === 'sensor-motion');
    if (sensors.length === 0) return;
    const target = sensors[Math.floor(Math.random() * sensors.length)];
    store.updateAccessory(target.id, { state: { motion: true, last: Date.now() } });
    setTimeout(() => store.updateAccessory(target.id, { state: { motion: false, last: Date.now() } }), 4000);
  } else if (u.type === 'zigbee' && u.topic) {
    // zigbee2mqtt publishes updates as topic = device friendly_name
    const acc = store.config.accessories.find(a => a.deviceId === u.topic && a.protocol === 'zigbee');
    if (acc && u.payload) {
      const merged = { ...acc.state };
      if ('state' in u.payload)      merged.on = u.payload.state === 'ON' || u.payload.state === 'LOCK';
      if ('brightness' in u.payload) merged.brightness = Math.round(u.payload.brightness / 2.54);
      if ('occupancy' in u.payload)  { merged.motion = !!u.payload.occupancy; merged.last = Date.now(); }
      if ('contact' in u.payload)    { merged.open = !u.payload.contact; merged.last = Date.now(); }
      if ('temperature' in u.payload){ merged.temp = u.payload.temperature; merged.last = Date.now(); }
      store.updateAccessory(acc.id, { state: merged });
    }
  }
});

/* ---------------- UI helpers ---------------- */

function setStatus(text, isError = false) {
  statusTextEl.textContent = text;
  statusTextEl.style.color = isError ? 'var(--danger)' : '';
}

function setConnectionStatus(status) {
  connectionPill.dataset.status = status;
  connectionPill.textContent = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Disconnected',
    demo: 'Demo Mode',
  }[status] || status;
}

/* ---------------- Boot ---------------- */

store.subscribe(renderDashboard);
renderDashboard();
reconnect();
