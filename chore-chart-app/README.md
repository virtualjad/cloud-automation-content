# Family Chore Chart

A simple, self-contained chore-chart web app to help teenagers create and track household chores. No backend, no installation — just open `index.html` in any modern browser and go.

## Features

- **Family members** — add each kid with a name and a color.
- **Chores** — name, assignee, point value, scheduled days of the week, and optional notes.
- **Today view** — a quick checklist of what's due today. Tap/click the circle to mark done.
- **Weekly chart** — classic grid of chores × days of the week. Navigate past/future weeks.
- **Leaderboard** — points earned this week or all-time, with completion rate and a progress bar.
- **Day streaks** — consecutive days each member completed every scheduled chore.
- **Import / Export** — back up your data to JSON or restore it on another device.
- **Reset** — clear a week's completions or wipe everything.
- **Offline-first** — everything is stored in your browser's `localStorage`.

## Running it

Option 1 — just open the file:
```
open chore-chart-app/index.html
```

Option 2 — serve it locally (recommended if you later add features that require a server context):
```
cd chore-chart-app
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup and tab layout |
| `style.css` | Theme (auto light/dark), layout, week grid, leaderboard styling |
| `app.js` | State management (localStorage), rendering, event handling |

## Data model

All data is persisted under the `chore-chart-v1` key in `localStorage`:

```json
{
  "members": [{ "id": "abc123", "name": "Alex", "color": "#6c9df8" }],
  "chores": [{
    "id": "xyz789",
    "name": "Take out the trash",
    "assigneeId": "abc123",
    "points": 5,
    "days": [1, 3, 5],
    "notes": "Rinse the bin on trash day"
  }],
  "completions": {
    "2026-04-15": { "xyz789": true }
  }
}
```

`days` uses JavaScript's day-of-week convention: `0 = Sunday … 6 = Saturday`.

## Tips for parents

- Use **Export Data** on the Manage tab weekly to keep a backup.
- Let each teen pick their own color — it's their avatar across every view.
- Points are flexible: treat 1 pt = $0.10, or stars, or screen-time minutes — whatever motivates.
- The streak card is a fun nudge: missing *any* scheduled chore for the day resets it.

Enjoy!
