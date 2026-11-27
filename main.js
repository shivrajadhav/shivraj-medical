const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) { app.quit(); }

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } }
function writeCfg(c) { try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} }

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    const s = path.join(src, n), d = path.join(dst, n);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// Decide where data lives (first run asks about the old HTA folder)
function resolveDataDir() {
  const cfg = readCfg();
  if (cfg.dataDir && fs.existsSync(cfg.dataDir)) return cfg.dataDir;
  const def = path.join(app.getPath('documents'), 'ShivrajMedicalData');
  fs.mkdirSync(def, { recursive: true });
  if (!fs.existsSync(path.join(def, 'Shivraj_Data.json'))) {
    const r = dialog.showMessageBoxSync({
      type: 'question',
      title: 'Shivraj Medical - first start',
      message: 'Do you have data from the old Shivraj_Medical.hta program?',
      detail: 'If yes, choose the old folder (the one containing Shivraj_Data.json). Your old files are only copied, never changed.\n\nNew data folder:\n' + def,
      buttons: ['Import old data', 'Start fresh'],
      defaultId: 0, cancelId: 1
    });
    if (r === 0) {
      for (;;) {
        const pick = dialog.showOpenDialogSync({ title: 'Select the OLD Shivraj folder', properties: ['openDirectory'] });
        if (!pick) break;
        if (fs.existsSync(path.join(pick[0], 'Shivraj_Data.json'))) {
          try { copyDir(pick[0], def); } catch (e) { dialog.showErrorBox('Import problem', String(e.message || e)); }
          // remove old program files that were in that folder
          for (const n of ['Shivraj_Medical.hta','Shivraj_Medical_All_In_One.html','medicines_slim.js','medicines_details.js']) { try { fs.unlinkSync(path.join(def, n)); } catch (e) {} }
          break;
        }
        dialog.showMessageBoxSync({ type: 'warning', message: 'Shivraj_Data.json was not found in that folder. Please choose again.' });
      }
    }
  }
  writeCfg({ dataDir: def });
  return def;
}

let win;
function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1280, height: 800, show: false, title: 'Shivraj Medical',
    webPreferences: { nodeIntegration: true, contextIsolation: false, spellcheck: false }
  });
  win.maximize(); win.show();
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && i.key === 'F12' && i.control) win.webContents.toggleDevTools();
  });
}

ipcMain.on('get-data-dir', (e) => { e.returnValue = resolveDataDir(); });
ipcMain.on('choose-folder', (e) => {
  const r = dialog.showOpenDialogSync(win, { title: 'Choose a folder (for example your pendrive)', properties: ['openDirectory', 'createDirectory'] });
  e.returnValue = r ? r[0] : '';
});
ipcMain.on('show-file', (e, fp) => { shell.showItemInFolder(fp); });
ipcMain.on('open-folder', (e, d) => { shell.openPath(d); });

// window.prompt() replacement (Electron has none)
ipcMain.on('prompt', (event, message, def) => {
  const w = new BrowserWindow({ parent: win, modal: true, width: 440, height: 220, resizable: false, minimizable: false, maximizable: false,
    autoHideMenuBar: true, title: 'Shivraj Medical', webPreferences: { nodeIntegration: true, contextIsolation: false } });
  w.setMenu(null);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const html = `<body style="font-family:Segoe UI,Arial;margin:16px;font-size:14px">
  <div style="margin-bottom:10px">${esc(message)}</div>
  <input id=v value="${esc(def)}" style="width:100%;box-sizing:border-box;font-size:16px;padding:6px">
  <div style="margin-top:14px;text-align:right">
  <button id=ok style="font-size:14px;padding:6px 18px">OK</button>
  <button id=no style="font-size:14px;padding:6px 14px">Cancel</button></div>
  <script>const {ipcRenderer}=require('electron');
  const v=document.getElementById('v'); v.focus(); v.select();
  const done=x=>ipcRenderer.send('prompt-done',x);
  document.getElementById('ok').onclick=()=>done(v.value);
  document.getElementById('no').onclick=()=>done(null);
  v.onkeydown=e=>{if(e.key==='Enter')done(v.value);if(e.key==='Escape')done(null);};<\/script></body>`;
  let finished = false;
  const finish = (val) => { if (finished) return; finished = true; event.returnValue = val; ipcMain.removeListener('prompt-done', onDone); if (!w.isDestroyed()) w.destroy(); };
  const onDone = (e, val) => { if (e.sender === w.webContents) finish(val); };
  ipcMain.on('prompt-done', onDone);
  w.on('closed', () => finish(null));
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

app.whenReady().then(createWindow);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
