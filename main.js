const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let currentFilePath = null;
let currentFolderPath = null;
let allowClose = false; // set to true only after renderer confirms it's safe to quit

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'OVS Scenario Editor',
    backgroundColor: '#ffffff'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Intercept the close button / Cmd+Q so renderer can prompt about unsaved changes
  mainWindow.on('close', (e) => {
    if (!allowClose) {
      e.preventDefault();
      mainWindow.webContents.send('app:closeRequested');
    }
  });

  buildMenu();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Scenario',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('app-cmd', 'new')
        },
        {
          label: 'Open Scenario Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('app-cmd', 'open')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('app-cmd', 'save')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('app-cmd', 'saveAs')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Fit Graph to Window',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow.webContents.send('app-cmd', 'fitGraph')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About OVS Scenario Editor',
          click: async () => {
            await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About OVS Scenario Editor',
              message: 'OVS Scenario Editor',
              detail: 'OpenVetSim XML Scenario Editor\nVersion 1.0.0\n\nCreate and edit veterinary patient simulator scenarios.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Scenario Folder',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;

  const folderPath = result.filePaths[0];
  const xmlPath = path.join(folderPath, 'main.xml');

  if (!fs.existsSync(xmlPath)) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'No Scenario Found',
      message: `No main.xml file found in:\n${folderPath}`
    });
    return null;
  }

  const content = fs.readFileSync(xmlPath, 'utf8');
  currentFilePath = xmlPath;
  currentFolderPath = folderPath;
  mainWindow.setTitle(`OVS Scenario Editor — ${path.basename(folderPath)}`);
  return { folderPath, filePath: xmlPath, content };
});

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Scenario XML',
    filters: [{ name: 'XML Files', extensions: ['xml'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf8');
  currentFilePath = filePath;
  currentFolderPath = path.dirname(filePath);
  return { folderPath: currentFolderPath, filePath, content };
});

ipcMain.handle('file:save', async (_event, content) => {
  if (!currentFilePath) {
    return ipcMain.emit('file:saveAs', _event, content);
  }
  try {
    fs.writeFileSync(currentFilePath, content, 'utf8');
    return { ok: true, filePath: currentFilePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('file:saveAs', async (_event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Scenario As',
    defaultPath: currentFilePath || path.join(app.getPath('documents'), 'main.xml'),
    filters: [{ name: 'XML Files', extensions: ['xml'] }]
  });
  if (result.canceled) return { ok: false };
  try {
    fs.writeFileSync(result.filePath, content, 'utf8');
    currentFilePath = result.filePath;
    currentFolderPath = path.dirname(result.filePath);
    mainWindow.setTitle(`OVS Scenario Editor — ${path.basename(currentFolderPath)}`);
    return { ok: true, filePath: result.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('app:getPaths', () => ({
  filePath: currentFilePath,
  folderPath: currentFolderPath
}));

// ── Layout file handlers ─────────────────────────────────────────────────────
// Positions are stored in layout.json inside the scenario folder.
// Format: { "version": 1, "positions": { "<sceneId>": { "x": 0, "y": 0 }, ... } }

ipcMain.handle('layout:read', (_event, folderPath) => {
  if (!folderPath) return null;
  const layoutPath = path.join(folderPath, 'layout.json');
  if (!fs.existsSync(layoutPath)) return null;
  try {
    const raw = fs.readFileSync(layoutPath, 'utf8');
    const data = JSON.parse(raw);
    // Convert string keys back to numbers so they match scene IDs
    if (data?.positions) {
      const numericPositions = {};
      for (const [k, v] of Object.entries(data.positions)) {
        numericPositions[Number(k)] = v;
      }
      return numericPositions;
    }
    return null;
  } catch (e) {
    console.warn('layout:read failed:', e.message);
    return null;
  }
});

ipcMain.handle('layout:write', (_event, folderPath, positions) => {
  if (!folderPath || !positions) return false;
  const layoutPath = path.join(folderPath, 'layout.json');
  try {
    const data = { version: 1, positions };
    fs.writeFileSync(layoutPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('layout:write failed:', e.message);
    return false;
  }
});

// ── New scenario folder setup ─────────────────────────────────────────────────
// The user picks (or creates) a folder; we scaffold the subfolders and seed
// stock-dog.jpg into images/ so the default avatar is immediately usable.

ipcMain.handle('dialog:newScenarioFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title:       'Choose Scenario Folder',
    buttonLabel: 'Select Folder',
    // createDirectory lets the user click "New Folder" in the picker (Mac / Linux)
    properties:  ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;

  const folderPath = result.filePaths[0];

  // Create the standard subfolders
  for (const sub of ['images', 'vocals', 'media']) {
    fs.mkdirSync(path.join(folderPath, sub), { recursive: true });
  }

  // Seed the default dog image (non-destructive — skip if already present)
  const assetSrc = path.join(__dirname, 'assets', 'stock-dog.jpg');
  const assetDst = path.join(folderPath, 'images', 'stock-dog.jpg');
  if (fs.existsSync(assetSrc) && !fs.existsSync(assetDst)) {
    fs.copyFileSync(assetSrc, assetDst);
  }

  // Seed the default vocal file
  const vocalSrc = path.join(__dirname, 'assets', 'default-vocal.wav');
  const vocalDst = path.join(folderPath, 'vocals', 'default-vocal.wav');
  if (fs.existsSync(vocalSrc) && !fs.existsSync(vocalDst)) {
    fs.copyFileSync(vocalSrc, vocalDst);
  }

  // Seed the default media file
  const mediaSrc = path.join(__dirname, 'assets', 'default-media.jpg');
  const mediaDst = path.join(folderPath, 'media', 'default-media.jpg');
  if (fs.existsSync(mediaSrc) && !fs.existsSync(mediaDst)) {
    fs.copyFileSync(mediaSrc, mediaDst);
  }

  currentFolderPath = folderPath;
  currentFilePath   = path.join(folderPath, 'main.xml');
  mainWindow.setTitle(`OVS Scenario Editor — ${path.basename(folderPath)}`);

  return { folderPath, filePath: currentFilePath };
});

// ── File picker (for vocals / media / image fields) ──────────────────────────
// Returns only the basename so the XML stays portable.
// startDir: absolute path to the folder to open the picker in.
//           Falls back to the scenario folder, then Documents, if it doesn't exist.

ipcMain.handle('dialog:pickFile', async (_event, startDir, filters) => {
  let defaultPath = startDir;
  if (!defaultPath || !fs.existsSync(defaultPath)) {
    defaultPath = currentFolderPath || app.getPath('documents');
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select File',
    defaultPath,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) return null;
  return path.basename(result.filePaths[0]);
});

// ── Unsaved-changes dialog + graceful quit ────────────────────────────────────

// Renderer calls this to show a native Save / Don't Save / Cancel prompt
ipcMain.handle('dialog:confirmUnsaved', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type:      'question',
    buttons:   ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId:  2,
    message:   'You have unsaved changes',
    detail:    'Do you want to save your changes before continuing?'
  });
  return response; // 0 = Save, 1 = Don't Save, 2 = Cancel
});

// Renderer calls this once it has finished saving (or chosen not to save)
ipcMain.on('app:quit', () => {
  app.exit(0);
});

// Renderer calls this when a scenario is closed to reset the window title
ipcMain.on('app:resetTitle', () => {
  if (mainWindow) mainWindow.setTitle('OVS Scenario Editor');
  currentFilePath   = null;
  currentFolderPath = null;
});

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
