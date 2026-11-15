const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const { createStartupHtml, createStartupUpdateScript } = require('./startup-screen.cjs');

let serverProcess;
let mainWindow;
let startupWindow;
let startupRendererReady;
let apiPort = 4180;
let finishingQuit = false;
const defaultUserDataPath=app.getPath('userData');
app.disableHardwareAcceleration();
// Run Chromium's software compositor in-process. Local Flow already disables
// hardware acceleration, and this avoids a separate GPU subprocess failing to
// load on Windows systems without the expected GPU runtime components.
app.commandLine.appendSwitch('in-process-gpu');
if(process.env.LOCAL_FLOW_USER_DATA_DIR)app.setPath('userData',path.resolve(process.env.LOCAL_FLOW_USER_DATA_DIR));
else app.setPath('userData',path.join(app.getPath('appData'),'Local Flow'));
const dataDir = path.join(app.getPath('userData'), 'data');

async function migrateUserData(){
  const candidates=[];
  if(app.isPackaged&&process.env.PORTABLE_EXECUTABLE_DIR)candidates.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR,'Local Flow Data','data'));
  candidates.push(path.join(defaultUserDataPath,'data'));
  const current=await fs.stat(dataDir).catch(()=>null);
  const currentEntries=current?.isDirectory()?await fs.readdir(dataDir).catch(()=>[]):[];
  if(currentEntries.length)return;
  for(const source of candidates){
    if(path.resolve(source).toLowerCase()===path.resolve(dataDir).toLowerCase())continue;
    if(!(await fs.stat(source).catch(()=>null))?.isDirectory())continue;
    await fs.mkdir(dataDir,{recursive:true});
    await fs.cp(source,dataDir,{recursive:true,force:false,errorOnExist:false});
    break;
  }
}

function request(port, pathname, method='GET', body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname:'127.0.0.1', port, path:pathname, method, headers: body?{'content-type':'application/json'}:{} ,timeout:1500 }, res => {
      let data=''; res.setEncoding('utf8'); res.on('data',chunk=>data+=chunk); res.on('end',()=>resolve({status:res.statusCode,data}));
    });
    req.on('error',reject); req.on('timeout',()=>req.destroy(new Error('Local Flow API timed out')));
    if(body)req.write(JSON.stringify(body)); req.end();
  });
}

async function selectPort() {
  for(let port=4180;port<4280;port++) {
    const available=await new Promise(resolve=>{const probe=net.createServer();probe.once('error',()=>resolve(false));probe.listen({host:'127.0.0.1',port,exclusive:true},()=>probe.close(()=>resolve(true)));});
    if(available)return port;
  }
  throw new Error('Could not find a free local API port.');
}

function showStartupStatus(step, title, detail) {
  if (!startupWindow || startupWindow.isDestroyed()) return;
  const update = () => startupWindow?.webContents.executeJavaScript(createStartupUpdateScript(step, title, detail)).catch(() => {});
  if (startupRendererReady) startupRendererReady.then(update).catch(() => {});
  else update();
}

function createStartupWindow() {
  if (startupWindow && !startupWindow.isDestroyed()) return;
  startupWindow = new BrowserWindow({
    width: 520,
    height: 420,
    minWidth: 520,
    maxWidth: 520,
    minHeight: 420,
    maxHeight: 420,
    center: true,
    frame: false,
    resizable: false,
    show: true,
    title: 'Starting LocalFlow',
    backgroundColor: '#10131a',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  startupRendererReady = startupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createStartupHtml())}`);
  startupWindow.on('closed', () => { startupWindow = null; startupRendererReady = null; });
}

async function startApi() {
  showStartupStatus(0, 'Preparing your workspace', 'Checking your local projects and media…');
  await migrateUserData();
  showStartupStatus(0, 'Checking LocalFlow services', 'Looking for an existing local API…');
  apiPort=await selectPort();
  try { const ready=await request(apiPort,'/api/health');if(ready.status===200)return; } catch {}
  showStartupStatus(1, 'Starting the local API', 'Launching LocalFlow’s workspace and generation services…');
  const serverPath=path.join(app.getAppPath(),'server.js');
  serverProcess=spawn(process.execPath,[serverPath],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',LOCAL_FLOW_PORT:String(apiPort),LOCAL_FLOW_DATA_DIR:dataDir},windowsHide:true,stdio:'ignore'});
  serverProcess.on('error',error=>dialog.showErrorBox('Local Flow could not start',error.message));
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    showStartupStatus(1, 'Starting the local API', 'Waiting for the local workspace to become ready…');
    try{const r=await request(apiPort,'/api/health');if(r.status===200)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error('Local Flow API did not start. Check that the installed application files are intact.');
}

async function createWindow() {
  await startApi();
  // The API starts enabled local services as soon as it listens. Do not make
  // window creation wait on ComfyUI/Ollama startup; generation routes will
  // reuse those services and the dependency panel reports their live state.
  showStartupStatus(2, 'Opening your studio', 'Loading your projects and preparing the workspace…');
  mainWindow=new BrowserWindow({width:1500,height:960,minWidth:1080,minHeight:700,backgroundColor:'#111210',title:'Local Flow',autoHideMenuBar:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  await mainWindow.loadURL(`http://127.0.0.1:${apiPort}/`);
  mainWindow.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return {action:'deny'};});
  mainWindow.show();
  if(startupWindow&&!startupWindow.isDestroyed())startupWindow.close();
  mainWindow.on('closed',()=>{mainWindow=null;});
}

const hasSingleInstanceLock=app.requestSingleInstanceLock();
if(!hasSingleInstanceLock)app.quit();
else {
  app.on('second-instance',()=>{if(!mainWindow)return;if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();});
  app.whenReady().then(()=>{createStartupWindow();return createWindow();}).catch(error=>{showStartupStatus(1,'LocalFlow could not start',error.message);dialog.showErrorBox('Local Flow startup failed',error.stack||error.message);app.quit();});
}
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0){createStartupWindow();createWindow().catch(error=>dialog.showErrorBox('Local Flow startup failed',error.message));}});
app.on('before-quit',(event)=>{if(serverProcess&&!serverProcess.killed&&!finishingQuit){event.preventDefault();finishingQuit=true;request(apiPort,'/api/shutdown','POST').catch(()=>{}).finally(()=>{const child=serverProcess;serverProcess=null;if(child&&!child.killed)child.kill();app.quit();});}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
