# Steam Chatroom — Project Map

## Servers

| Server | URL | Purpose |
|--------|-----|---------|
| **Localhost** | `http://localhost:3000` | Local machine — active coding & instant updates |
| **Staging** | `http://192.168.132.132:3002` | Optiplex — tests Docker/Network before Live |
| **Live** | `https://play.nolimitnexus.com` | NAS → Cloudflare Tunnel — the real game |

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
LOCALHOST (For active coding & instant updates):
  http://localhost:3000/            ← Game
  http://localhost:3000/editor.html ← Editor
  http://localhost:3000/studio.html ← Goop Lab
  http://localhost:3000/hub.html    ← Hub

STAGING / DEV (Optiplex - For testing Docker before Live):
  http://192.168.132.132:3002/            ← Game
  http://192.168.132.132:3002/editor.html ← Editor
  http://192.168.132.132:3002/studio.html ← Goop Lab
  http://192.168.132.132:3002/hub.html    ← Hub

LIVE (NAS - Production):
  https://play.nolimitnexus.com/            ← Game
  https://studio.nolimitnexus.com/          ← Editor
  https://gooplab.nolimitnexus.com/         ← Goop Lab
  https://hub.nolimitnexus.com/             ← Hub
```

---

## Data Flow

- **Editor Save button** pushes map data to **Local, Dev, and Live** simultaneously!
- ⚠️ **Important Editor Save Rule:** Because of browser "Mixed Content" security (HTTPS vs HTTP), you must use the **Local** or **Dev** Editor to push to all three environments. If you save from the **Live** (HTTPS) editor, your browser will block the push to Local/Dev, and the changes will only save to Live.
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
