# Steam Chatroom — Project Map

## Servers

| Server | URL | Purpose |
|--------|-----|---------|
| **Development** | `http://localhost:3000` | Your PC — active coding & testing |
| **Live** | `https://chatroom.nolimitnexus.com` | NAS → Cloudflare Tunnel — the real game |

> Local server auto-syncs map data from Live every 30 seconds.

---

## Pages

| Page | Path | What It Does |
|------|------|-------------|
| 🎮 **Game Client** | `/` | Multiplayer chatroom — login, WASD, fish, fight, chat |
| 🗺️ **World Editor** | `/editor.html` | Map editor — place objects, observe players |
| 🧪 **Goop Lab** | `/studio.html` | Goop character workshop — shape/material/effects |
| ⚡ **Command Hub** | `/hub.html` | Dashboard — server status, player list, all links |

---

## Bookmark These

```
DEVELOPMENT:
  http://localhost:3000/            ← Game
  http://localhost:3000/editor.html ← Editor
  http://localhost:3000/studio.html ← Goop Lab
  http://localhost:3000/hub.html    ← Hub

LIVE:
  https://chatroom.nolimitnexus.com/            ← Game
  https://chatroom.nolimitnexus.com/editor.html ← Editor
  https://chatroom.nolimitnexus.com/studio.html ← Goop Lab
  https://chatroom.nolimitnexus.com/hub.html    ← Hub
```

---

## Data Flow

- **Editor Save button** pushes map data to both Local + Live simultaneously.
- **Local server** auto-pulls map changes from Live every 30 seconds.
- **shared-characters.js** and **shared-environment.js** are loaded from GitHub Pages CDN by all pages on all servers.

---

## File Structure

```
steam_chatroom/
├── server.js            ← Express + Socket.io (port 3000)
├── public/
│   ├── index.html       ← 🎮 Game Client
│   ├── client.js        ← Game logic
│   ├── style.css        ← Game styles
│   ├── editor.html      ← 🗺️ World Editor
│   ├── editor.js        ← Editor logic
│   ├── studio.html      ← 🧪 Goop Lab
│   ├── studio.js        ← Goop Lab logic
│   ├── studio.css       ← Goop Lab styles
│   ├── hub.html         ← ⚡ Command Hub
│   ├── ripples.js       ← Water ripple shader
│   ├── campfire.js      ← Campfire VFX
│   └── ObjectFactory.js ← Object builder
└── data/
    ├── map.json         ← World objects (per-server)
    └── droppedItems.json
```
