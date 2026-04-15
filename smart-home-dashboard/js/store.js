// store.js — persistence layer + reactive state
// Stores dashboard configuration, accessory layout, and connector settings
// in localStorage, and provides a tiny pub/sub for UI updates.

const STORAGE_KEY = 'shd:config:v1';

const DEFAULT_CONFIG = {
  title: 'Home',
  darkMode: true,
  demoMode: true,
  activeRoom: 'all',
  connectors: {
    homekit: { url: '', token: '' },
    matter:  { url: '', token: '' },
    zigbee:  { url: '', token: '' },
  },
  accessories: [
    // Seed examples illustrate the schema. Users can edit/delete freely.
    { id: 'a1', name: 'Living Room Lamp',  protocol: 'homekit', type: 'dimmer',        room: 'Living Room', deviceId: 'demo-lr-lamp',     icon: 'lamp',   size: '1x1', state: { on: true,  brightness: 70 } },
    { id: 'a2', name: 'Kitchen Strip',     protocol: 'matter',  type: 'color-light',   room: 'Kitchen',     deviceId: 'demo-kt-strip',    icon: 'bulb',   size: '2x1', state: { on: true,  brightness: 90, hex: '#ffb05a' } },
    { id: 'a3', name: 'Front Door',        protocol: 'homekit', type: 'lock',          room: 'Entry',       deviceId: 'demo-front-lock',  icon: 'lock',   size: '1x1', state: { locked: true } },
    { id: 'a4', name: 'Bedroom Thermostat',protocol: 'matter',  type: 'thermostat',    room: 'Bedroom',     deviceId: 'demo-br-therm',    icon: 'thermo', size: '2x1', state: { current: 71, target: 70, mode: 'heat' } },
    { id: 'a5', name: 'Hallway Motion',    protocol: 'zigbee',  type: 'sensor-motion', room: 'Hallway',     deviceId: 'demo-hall-motion', icon: 'sensor', size: '1x1', state: { motion: false, last: Date.now() - 600000 } },
    { id: 'a6', name: 'Office Outlet',     protocol: 'zigbee',  type: 'switch',        room: 'Office',      deviceId: 'demo-office-plug', icon: 'outlet', size: '1x1', state: { on: false, watts: 0 } },
    { id: 'a7', name: 'Bedroom Blinds',    protocol: 'matter',  type: 'blind',         room: 'Bedroom',     deviceId: 'demo-br-blind',    icon: 'blind',  size: '1x1', state: { position: 40 } },
    { id: 'a8', name: 'Movie Night',       protocol: 'homekit', type: 'scene',         room: 'Living Room', deviceId: 'demo-scene-movie', icon: 'scene',  size: '1x1', state: {} },
  ],
};

class Store {
  constructor() {
    this.config = this._load();
    this._listeners = new Set();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_CONFIG);
      const parsed = JSON.parse(raw);
      // Forward-compatible: merge unknown new defaults
      return { ...structuredClone(DEFAULT_CONFIG), ...parsed,
        connectors: { ...DEFAULT_CONFIG.connectors, ...(parsed.connectors || {}) }
      };
    } catch (e) {
      console.warn('Failed to load config, using defaults', e);
      return structuredClone(DEFAULT_CONFIG);
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    this._emit();
  }

  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.config = structuredClone(DEFAULT_CONFIG);
    this._emit();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) {
      try { fn(this.config); } catch (e) { console.error(e); }
    }
  }

  // ---- Accessory CRUD ----
  addAccessory(acc) {
    acc.id = acc.id || ('a' + Math.random().toString(36).slice(2, 9));
    acc.state = acc.state || {};
    this.config.accessories.push(acc);
    this.save();
    return acc;
  }

  updateAccessory(id, patch) {
    const idx = this.config.accessories.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.config.accessories[idx] = {
      ...this.config.accessories[idx],
      ...patch,
      state: { ...this.config.accessories[idx].state, ...(patch.state || {}) },
    };
    this.save();
    return this.config.accessories[idx];
  }

  removeAccessory(id) {
    this.config.accessories = this.config.accessories.filter(a => a.id !== id);
    this.save();
  }

  reorder(ids) {
    const map = new Map(this.config.accessories.map(a => [a.id, a]));
    this.config.accessories = ids.map(id => map.get(id)).filter(Boolean);
    this.save();
  }

  getRooms() {
    const rooms = new Set();
    for (const a of this.config.accessories) {
      if (a.room) rooms.add(a.room);
    }
    return ['All', 'Favorites', ...Array.from(rooms).sort()];
  }

  // ---- Backup ----
  export() {
    return JSON.stringify(this.config, null, 2);
  }

  import(json) {
    const parsed = JSON.parse(json);
    if (!parsed.accessories || !Array.isArray(parsed.accessories)) {
      throw new Error('Invalid configuration: missing accessories array');
    }
    this.config = { ...structuredClone(DEFAULT_CONFIG), ...parsed };
    this.save();
  }
}

export const store = new Store();
