# Smart Home Dashboard

A customizable, single-page web dashboard for controlling **HomeKit**,
**Matter**, and **Zigbee** accessories from one place. Zero build step,
no server required — open `index.html` in any modern browser.

## Features

- **Customizable layout** — add, edit, remove, drag-to-reorder tiles. Three
  tile sizes (small / wide / large) and per-tile icons.
- **Multi-protocol support** — HomeKit (via Homebridge), Matter (via any
  controller exposing a normalized HTTP API), and Zigbee (via the
  zigbee2mqtt frontend WebSocket).
- **Rich accessory types** — lights, dimmers, color lights, switches /
  outlets, thermostats, locks, blinds, fans, motion / contact /
  temperature sensors, and scenes.
- **Rooms & favorites** — group accessories by room and switch between
  views with the tab bar at the top.
- **Demo mode** — full UI works without any bridge configured. Useful for
  designing your layout before connecting real devices.
- **Persistent config** — every change is saved to `localStorage`. Export
  / import / reset from the Settings dialog.
- **Light & dark themes**, mobile-friendly responsive grid.

## Quick start

```bash
# Serve locally (any static server works)
cd smart-home-dashboard
python3 -m http.server 8000
# then open http://localhost:8000
```

Because the app uses ES modules, it must be loaded over `http://`
(or `https://`) — opening `index.html` directly with `file://` will
fail in most browsers.

## Connecting real bridges

Open the **Settings** dialog (gear icon) and disable *Demo mode*, then
configure one or more connectors:

| Protocol | Bridge software             | Field         | Example                                    |
|----------|-----------------------------|---------------|--------------------------------------------|
| HomeKit  | Homebridge (config-ui-x)    | Base URL      | `http://homebridge.local:8581`             |
| Matter   | matter-server / HA Matter   | Base URL      | `http://matter-controller.local:8080`      |
| Zigbee   | zigbee2mqtt frontend        | WebSocket URL | `ws://zigbee2mqtt.local:8080/api`          |

Optional bearer tokens are sent as `Authorization: Bearer …` for HTTP
connectors and as a `bridge/auth` payload for the Zigbee connector.

> **CORS:** browsers will block cross-origin requests unless the bridge
> sends permissive CORS headers. If you can't change the bridge, host the
> dashboard behind the same reverse proxy (Caddy / Nginx / Traefik).

## Adding accessories

Click the **+** button in the top bar.

| Field      | Notes                                                       |
|------------|-------------------------------------------------------------|
| Name       | Display name shown on the tile                              |
| Protocol   | `homekit`, `matter`, or `zigbee`                            |
| Type       | Determines the tile UI and which controls appear in detail |
| Room       | Used for the room tabs (free text, autocompletes)           |
| Icon       | "Auto" picks based on type, or override with a specific one |
| Device ID  | Bridge-specific identifier — see below                      |

### Device ID conventions

- **HomeKit / Homebridge** — the accessory `uniqueId` from
  `GET /api/accessories` on Homebridge UI.
- **Matter** — the node ID assigned by your controller.
- **Zigbee** — the device's `friendly_name` in `zigbee2mqtt`
  (e.g. `living_room_lamp`).

## File layout

```
smart-home-dashboard/
├── index.html          # App shell
├── css/styles.css      # Themeable design system
├── js/
│   ├── main.js         # Application controller (edit mode, modals, status)
│   ├── store.js        # localStorage-backed config + reactive state
│   ├── connectors.js   # HomeKit / Matter / Zigbee / Demo connectors
│   └── accessories.js  # Type metadata + tile / detail renderers
└── README.md
```

## Customization

Everything is data-driven. To add a new accessory type:

1. Add an entry to `TYPES` in `js/accessories.js` with `tile`, `detail`,
   `primary`, and `isOn` functions.
2. Add a default state factory clause in `defaultStateFor()` in
   `js/main.js`.
3. Add a `<option>` in the type dropdown in `index.html`.

To add a new connector, subclass `BaseConnector` in `js/connectors.js` and
register it in `ConnectorManager.configure()`.

## Backup

Settings → *Export Config* writes the full configuration (including
accessory layout) to a JSON file. *Import Config* restores it on the same
or another browser.

## Browser support

Tested against current Chrome, Safari, Firefox, and Edge. Uses
`<dialog>`, `EventSource`, `WebSocket`, and CSS Grid — all standard
since 2022.
