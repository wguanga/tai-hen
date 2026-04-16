const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let pythonProcess = null;
let restartCount = 0;
const MAX_RESTARTS = 3;

function startBackend() {
  const backendPath = path.join(__dirname, '..', 'backend');
  pythonProcess = spawn('python', ['-m', 'uvicorn', 'main:app', '--port', '8000'], {
    cwd: backendPath,
    stdio: 'pipe',
  });

  pythonProcess.stdout.on('data', (d) => console.log('[backend]', d.toString().trim()));
  pythonProcess.stderr.on('data', (d) => console.log('[backend]', d.toString().trim()));

  pythonProcess.on('exit', (code) => {
    console.log('[backend] exited with code', code);
    if (!app.isQuitting && restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[backend] restarting (${restartCount}/${MAX_RESTARTS})...`);
      setTimeout(startBackend, 1000);
    }
  });
}

function waitForBackend(timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeout) {
        reject(new Error('Backend startup timeout'));
        return;
      }
      const req = http.get('http://127.0.0.1:8000/health', (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(check, 300);
      });
      req.on('error', () => setTimeout(check, 300));
      req.setTimeout(1000, () => { req.destroy(); setTimeout(check, 300); });
    };
    check();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Paper Reader',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  return win;
}

app.whenReady().then(async () => {
  startBackend();
  try {
    await waitForBackend();
    console.log('[main] backend ready');
  } catch (e) {
    console.error('[main]', e.message);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  app.isQuitting = true;
  if (pythonProcess) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pythonProcess.pid), '/T', '/F']);
    } else {
      pythonProcess.kill('SIGTERM');
    }
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
