// connectors.js — protocol abstraction layer.
//
// Each connector exposes the same interface so the UI can drive any device
// without caring which protocol it uses:
//
//   connector.connect()     -> Promise<void>
//   connector.disconnect()  -> void
//   connector.send(acc, command)  -> Promise<state>
//   connector.onUpdate(cb)        -> unsubscribe
//
// Connectors are designed so the dashboard works fully in "demo mode" with
// no real devices configured. Production users should provide credentials
// for one or more of:
//   - HomeKit / Homebridge   (HTTP polling + WebSocket)
//   - Matter controller      (HTTP/SSE — schemas vary by vendor)
//   - zigbee2mqtt            (WebSocket bridge API)

class BaseConnector {
  constructor(settings = {}) {
    this.settings = settings;
    this.connected = false;
    this._listeners = new Set();
  }
  onUpdate(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _emit(update) { for (const l of this._listeners) try { l(update); } catch (e) { console.error(e); } }
  async connect() { this.connected = true; }
  disconnect() { this.connected = false; }
  // eslint-disable-next-line no-unused-vars
  async send(accessory, command) { return command; }
}

/* ---------------- Demo connector ---------------- */
// Used when no credentials are configured (or "Demo mode" is on).
// Maintains state in-memory and simulates motion/sensor events.
class DemoConnector extends BaseConnector {
  constructor() {
    super();
    this._timer = null;
  }
  async connect() {
    this.connected = true;
    // Simulate a motion event every ~25s for any motion sensors.
    this._timer = setInterval(() => {
      this._emit({ type: 'simulate-motion' });
    }, 25000);
  }
  disconnect() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    super.disconnect();
  }
  async send(accessory, command) {
    // Echo the command back as the new state. The store will merge it.
    return command;
  }
}

/* ---------------- HomeKit / Homebridge connector ---------------- */
// Compatible with the Homebridge config-ui-x REST API. The exact path
// depends on the user's setup; this is intentionally minimal.
class HomeKitConnector extends BaseConnector {
  async connect() {
    if (!this.settings.url) throw new Error('HomeKit URL not configured');
    // Test the connection
    const res = await fetch(this._url('/api/status'), { headers: this._headers() });
    if (!res.ok) throw new Error(`HomeKit auth failed (${res.status})`);
    this.connected = true;
  }
  async send(accessory, command) {
    const res = await fetch(this._url(`/api/accessories/${accessory.deviceId}`), {
      method: 'PUT',
      headers: { ...this._headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ characteristicType: this._cmdToCharacteristic(command), value: this._cmdToValue(command) }),
    });
    if (!res.ok) throw new Error(`HomeKit set failed (${res.status})`);
    return command;
  }
  _url(path) { return this.settings.url.replace(/\/$/, '') + path; }
  _headers() {
    const h = { 'Accept': 'application/json' };
    if (this.settings.token) h['Authorization'] = `Bearer ${this.settings.token}`;
    return h;
  }
  _cmdToCharacteristic(c) {
    if ('on' in c) return 'On';
    if ('brightness' in c) return 'Brightness';
    if ('locked' in c) return 'LockTargetState';
    if ('target' in c) return 'TargetTemperature';
    if ('position' in c) return 'TargetPosition';
    return Object.keys(c)[0];
  }
  _cmdToValue(c) { return Object.values(c)[0]; }
}

/* ---------------- Matter connector ---------------- */
// Talks to a Matter controller. Many controllers (matter-server, HA's
// Matter integration, Apple/Google bridges) speak slightly different
// dialects, so this implementation issues normalized commands and lets
// the controller translate to clusters/attributes.
class MatterConnector extends BaseConnector {
  async connect() {
    if (!this.settings.url) throw new Error('Matter controller URL not configured');
    const res = await fetch(this._url('/health'), { headers: this._headers() });
    if (!res.ok) throw new Error(`Matter controller unreachable (${res.status})`);
    this.connected = true;
    this._openStream();
  }
  disconnect() {
    if (this._es) this._es.close();
    super.disconnect();
  }
  _openStream() {
    try {
      this._es = new EventSource(this._url('/events'));
      this._es.onmessage = (msg) => {
        try { this._emit(JSON.parse(msg.data)); } catch {}
      };
    } catch (e) { console.warn('Matter SSE unavailable', e); }
  }
  async send(accessory, command) {
    const res = await fetch(this._url(`/devices/${accessory.deviceId}/command`), {
      method: 'POST',
      headers: { ...this._headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cluster: this._cmdToCluster(accessory, command), payload: command }),
    });
    if (!res.ok) throw new Error(`Matter command failed (${res.status})`);
    return command;
  }
  _url(path) { return this.settings.url.replace(/\/$/, '') + path; }
  _headers() {
    const h = { 'Accept': 'application/json' };
    if (this.settings.token) h['Authorization'] = `Bearer ${this.settings.token}`;
    return h;
  }
  _cmdToCluster(acc, c) {
    // Coarse mapping; controllers should normalize. See Matter spec §1.
    if (acc.type === 'thermostat') return 'thermostat';
    if (acc.type === 'lock')       return 'doorLock';
    if (acc.type === 'blind')      return 'windowCovering';
    if ('hex' in c || 'hue' in c)  return 'colorControl';
    if ('brightness' in c)         return 'levelControl';
    return 'onOff';
  }
}

/* ---------------- Zigbee (zigbee2mqtt) connector ---------------- */
// Uses zigbee2mqtt's frontend WebSocket API (z2m >= 1.17). The bridge
// publishes a stream of messages on the same socket used to send commands.
class ZigbeeConnector extends BaseConnector {
  async connect() {
    if (!this.settings.url) throw new Error('Zigbee WS URL not configured');
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.settings.url);
      const t = setTimeout(() => reject(new Error('Zigbee WS connect timed out')), 8000);
      ws.onopen = () => {
        clearTimeout(t);
        this.connected = true;
        this._ws = ws;
        if (this.settings.token) {
          ws.send(JSON.stringify({ topic: 'bridge/auth', payload: { token: this.settings.token } }));
        }
        resolve();
      };
      ws.onerror = (e) => { clearTimeout(t); reject(e); };
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(m.data);
          this._emit({ type: 'zigbee', topic: msg.topic, payload: msg.payload });
        } catch {}
      };
      ws.onclose = () => { this.connected = false; };
    });
  }
  disconnect() {
    if (this._ws) try { this._ws.close(); } catch {}
    super.disconnect();
  }
  async send(accessory, command) {
    if (!this._ws || this._ws.readyState !== 1) throw new Error('Zigbee WS not open');
    // z2m commands are published to <friendly-name>/set
    const topic = `${accessory.deviceId}/set`;
    const payload = this._normalize(command);
    this._ws.send(JSON.stringify({ topic, payload }));
    return command;
  }
  _normalize(c) {
    const out = {};
    if ('on' in c) out.state = c.on ? 'ON' : 'OFF';
    if ('brightness' in c) out.brightness = Math.round(c.brightness * 2.54); // 0-100 -> 0-254
    if ('hex' in c) out.color = { hex: c.hex };
    if ('locked' in c) out.state = c.locked ? 'LOCK' : 'UNLOCK';
    if ('position' in c) out.position = c.position;
    if ('target' in c) out.current_heating_setpoint = c.target;
    return Object.keys(out).length ? out : c;
  }
}

/* ---------------- Connector registry ---------------- */
export class ConnectorManager {
  constructor() {
    this.connectors = {};
    this._updateListeners = new Set();
  }

  configure(config) {
    // Tear down any previous instances.
    for (const c of Object.values(this.connectors)) c.disconnect();
    this.connectors = {};

    if (config.demoMode) {
      this.connectors.demo = new DemoConnector();
    } else {
      const c = config.connectors || {};
      this.connectors.homekit = c.homekit?.url ? new HomeKitConnector(c.homekit) : new DemoConnector();
      this.connectors.matter  = c.matter?.url  ? new MatterConnector(c.matter)   : new DemoConnector();
      this.connectors.zigbee  = c.zigbee?.url  ? new ZigbeeConnector(c.zigbee)   : new DemoConnector();
    }

    for (const c of Object.values(this.connectors)) {
      c.onUpdate(u => this._fanout(u));
    }
  }

  async connectAll() {
    const results = await Promise.allSettled(
      Object.entries(this.connectors).map(async ([name, c]) => {
        try { await c.connect(); return name; }
        catch (e) { console.warn(`Connector ${name} failed:`, e.message); throw e; }
      })
    );
    const okCount = results.filter(r => r.status === 'fulfilled').length;
    return { ok: okCount, total: results.length, results };
  }

  pickFor(accessory) {
    if (this.connectors.demo) return this.connectors.demo;
    return this.connectors[accessory.protocol] || this.connectors.demo;
  }

  async send(accessory, command) {
    const c = this.pickFor(accessory);
    if (!c) throw new Error('No connector available');
    return c.send(accessory, command);
  }

  onUpdate(cb) { this._updateListeners.add(cb); return () => this._updateListeners.delete(cb); }
  _fanout(u) { for (const l of this._updateListeners) try { l(u); } catch (e) { console.error(e); } }
}

export const connectorManager = new ConnectorManager();
