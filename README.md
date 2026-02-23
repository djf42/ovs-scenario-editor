# OVS Scenario Editor

A graphical desktop application for creating and editing OpenVetSim XML scenario files.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher (includes npm)
- Internet connection for first-time `npm install`

## Setup

```bash
# 1. Open a terminal and navigate to this folder
cd "OVS-Scenario-Editor"

# 2. Install dependencies (only needed once)
npm install

# 3. Launch the app
npm start
```

## How to Use

### Opening a Scenario
- Click **Open** (or Cmd/Ctrl+O) and select a **scenario folder** (the folder containing `main.xml`).

### Creating a New Scenario
- Click **New** (or Cmd/Ctrl+N).
- Switch to the **Scenario Info** tab and fill in the header and patient details.
- Switch back to **Flowchart** and click **+ Add Scene** to create scenes.

### The Flowchart
Each **scene** is a coloured box:
| Colour | Meaning |
|--------|---------|
| 🟢 Green | Starting (initial) scene |
| 🔵 Blue | Normal scene |
| 🔴 Red | Terminal scene (ID 100) |

Arrows between scenes represent **triggers**:
- **Blue** — event trigger (drug given, button pressed, etc.)
- **Amber** — CPR duration trigger
- **Green** — parameter trigger
- **Purple** — trigger group (multiple conditions)
- **Red dashed** — timeout

### Editing a Scene
1. Click any scene node → a panel opens on the right.
2. Edit the **title** and **ID**.
3. Set **initialization parameters** (cardiac, respiration, general) — check the box next to each parameter to include it in this scene's override.
4. Add a **Timeout** (automatically jumps to another scene after N seconds with no action).
5. Add/edit/delete **Triggers** — each trigger defines the condition and which scene to jump to.
6. Click **✔ Apply Changes** — the graph updates immediately.

### Saving
- **Save** (Cmd/Ctrl+S) — overwrites the current file.
- **Save As** (Cmd/Ctrl+Shift+S) — saves to a new XML file.

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Cmd/Ctrl+N | New scenario |
| Cmd/Ctrl+O | Open scenario folder |
| Cmd/Ctrl+S | Save |
| Cmd/Ctrl+Shift+S | Save As |
| Cmd/Ctrl+Shift+F | Fit graph to window |

### Right-Click Menu (on graph)
Right-click a scene node for options:
- **Edit** — open the scene editor
- **Set as Initial Scene** — make this the first scene
- **Delete Scene** — remove scene and all its triggers

Right-click empty canvas space to **Add Scene** or **Fit Graph**.

## Building a Distributable

To package the app for deployment:

```bash
# macOS .dmg
npm run build-mac

# Windows .exe installer
npm run build-win
```

Packaged apps will appear in the `dist/` folder.

## Project Structure

```
OVS-Scenario-Editor/
├── main.js                    Electron main process
├── package.json
├── src/
│   ├── index.html             App shell
│   ├── styles.css             Dark theme
│   ├── renderer.js            Main app controller
│   ├── xmlParser.js           XML → JS model
│   ├── xmlSerializer.js       JS model → XML
│   ├── flowchart.js           vis-network graph manager
│   └── editors/
│       ├── sceneEditor.js     Scene properties panel
│       ├── headerEditor.js    Scenario info tab
│       └── eventsEditor.js    Events tab
└── README.md
```

## Reporting Bugs & Requesting Features

Please use the **[Issues](../../issues)** tab on GitHub to report bugs or suggest improvements. Use the provided templates — attaching your `.xml` scenario file (with any sensitive content removed) is very helpful for reproducing problems.

## Notes

- The `<controls>` section of the XML (which maps simulator body regions to clickable areas) is preserved exactly as-is when saving — the editor does not expose these for editing since they rarely change.
- Scene IDs are arbitrary integers. By convention, ID `100` is used as the terminal/end scene.
- A scenario folder can also contain `images/`, `vocals/`, and `media/` subfolders — the editor does not manage those files directly but lets you reference them by filename.
