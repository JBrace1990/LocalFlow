import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
import { buildManagedComfyArgs } from './comfy-runtime-args.js';
import { allocateSceneDurations } from './src/project-setup.js';
import { allocateStoryboardRevisionDurations } from './src/storyboard-revision.js';
import { normalizeComfyQueue } from './src/comfy-queue.js';
import { parseExportOutputPath } from './src/timeline-export.js';
import { renderStoryboardPdf, writeStoryboardPdf } from './src/storyboard-pdf.js';
import { mergeStoryboardSceneRevision } from './src/storyboard-revision.js';
import { isDesignPreparationQuestion, lastQuestion, storyChatYesNoChoices } from './src/story-chat-approval.js';
import { serveMediaFile } from './src/media-response.js';
import { revealMediaInFileManager } from './src/media-explorer.js';
import { buildSafeEnhancedPrompt, isFaithfulEnhancedSetting } from './src/prompt-enhancement.js';
import { uniqueComfyReferenceSlots } from './src/comfy-reference-slots.js';
import { buildCreatorCanonContext } from './src/story-chat-canon.js';
import { findVisualPlanCanonConflicts } from './src/visual-development-canon-guard.js';
import { localWan22I2VWorkflow, wan22Readiness } from './src/wan22-i2v.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const APP_VERSION = JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8')).version;
const SERVER_BUILD = createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex').slice(0,16);
const execFileAsync = promisify(execFile);
const DATA = process.env.LOCAL_FLOW_DATA_DIR ? path.resolve(process.env.LOCAL_FLOW_DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.LOCAL_FLOW_PORT || process.env.PORT || 4180);
const MAX_BODY = 96 * 1024 * 1024;
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);
let watchTimer;
let scanState = { scanning: false, lastScan: null, folder: '', found: 0, errors: [] };
let scanPromise = null;
const downloads = new Map();
const minimaxJobs = new Map();
const ollamaPulls = new Map();
const dependencyInstalls = new Map();
let comfyChild=null;
let comfyStartPromise=null;
let comfyLastExit=null;
function isExplicitStoryApproval(value){
  const text=String(value||'').trim().replace(/[’]/g,"'");
  if(!text||/^(?:no|not yet|wait|hold on|don't|do not|not ready|let me revise|i want to revise|i'd like to revise)\b/i.test(text))return false;
  if(/\b(?:but|however|though|except)\b[^.!?]{0,140}\b(?:revise|change|wait|hold|not ready|not yet|before we proceed)\b/i.test(text))return false;
  return /^(?:yes|yeah|yep|sure|absolutely|definitely|sounds good|that sounds good|that's right|i agree|i approve|approve|approved|i'm ready|please do|please proceed|go ahead|proceed|do it|let'?s do it|let'?s proceed|prepare (?:the )?designs|begin visual preproduction)(?:\b|[.!?,\s]|$)/i.test(text);
}
async function startComfyIfConfigured(force=false){
  if(comfyStartPromise)return comfyStartPromise;
  comfyStartPromise=(async()=>{
    const config=await getConfig(); if(!config.comfyAutoStart&&!force)return {started:false,reason:'Automatic start disabled'};
    try{const health=await fetch(`${String(config.comfyUrl).replace(/\/$/,'')}/system_stats`,{signal:AbortSignal.timeout(1500)});if(health.ok){comfyLastExit=null;return {started:false,reason:'Already running'};}}catch{}
    if(comfyChild&&!comfyChild.killed)return {started:true,reason:'Already launched by Local Flow'};
    if(!config.comfyCommand){const found=await findComfyInstall();if(!found)throw new Error('No ComfyUI launch command found. Configure its Python executable in Settings.');Object.assign(config,{comfyCommand:found.command,comfyArgs:found.args,comfyCwd:found.cwd});await writeJson(paths.config,config);}
    const command=path.resolve(String(config.comfyCommand)),configuredArgs=Array.isArray(config.comfyArgs)?config.comfyArgs.map(String):[];await fs.access(command);
    // Local Flow ships a thin ComfyUI entrypoint that skips optional built-in
    // 3D packages (not used by our image/video workflows). Without it, recent
    // ComfyUI installs can hang importing Trellis/Numba before opening the API.
    const resourceRoot=process.resourcesPath||'';
    const wrapperCandidates=[path.join(ROOT,'runtime','comfyui-background.py'),...(resourceRoot?[path.join(resourceRoot,'runtime','comfyui-background.py')]:[])];
    const mainScriptIndex=configuredArgs.findIndex(arg=>path.basename(arg).toLowerCase()==='main.py');
    let comfyArgs=configuredArgs,comfyEnv={...process.env};
    if(mainScriptIndex>=0){
      const comfyInput=path.join(DATA,'comfy-input'),comfyOutput=path.join(DATA,'comfy-output'),comfyTemp=path.join(DATA,'comfy-temp');
      await Promise.all([fs.mkdir(comfyInput,{recursive:true}),fs.mkdir(comfyOutput,{recursive:true}),fs.mkdir(comfyTemp,{recursive:true}),fs.mkdir(paths.media,{recursive:true})]);
      comfyArgs=buildManagedComfyArgs(configuredArgs,{inputDirectory:comfyInput,outputDirectory:comfyOutput,tempDirectory:comfyTemp});
    }
    const wrapperPath=wrapperCandidates.find(candidate=>{try{return require('node:fs').existsSync(candidate);}catch{return false;}});
    if(wrapperPath){
      const mainIndex=comfyArgs.findIndex(arg=>path.basename(arg).toLowerCase()==='main.py');
      const pythonFlags=mainIndex>=0?comfyArgs.slice(0,mainIndex):[];
      const appArgs=mainIndex>=0?comfyArgs.slice(mainIndex+1):comfyArgs.filter(arg=>arg!=='-s');
      comfyArgs=['-X','utf8',...pythonFlags.filter(arg=>arg!=='-s'),wrapperPath,...appArgs];
      comfyEnv={...comfyEnv,LOCAL_FLOW_COMFY_ROOT:String(config.comfyCwd||path.dirname(configuredArgs[mainIndex]||'')),LOCAL_FLOW_COMFY_LOAD_3D:config.comfyLoadOptional3D?'1':'0',PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'};
    }
    const logFile=path.join(DATA,'logs','comfyui-start.log');await fs.mkdir(path.dirname(logFile),{recursive:true});comfyLastExit=null;
    const child=spawn(command,comfyArgs,{cwd:config.comfyCwd||path.dirname(command),env:comfyEnv,windowsHide:true,stdio:['ignore','pipe','pipe'],detached:false});comfyChild=child;
    const writeLog=chunk=>{fs.appendFile(logFile,chunk).catch(()=>{});};child.stdout?.on('data',writeLog);child.stderr?.on('data',writeLog);
    child.on('exit',(code,signal)=>{comfyLastExit=`ComfyUI process exited (code ${code??'unknown'}${signal?`, ${signal}`:''}). See ${logFile}`;if(comfyChild===child)comfyChild=null;});
    child.on('error',error=>{comfyLastExit=`Could not launch ComfyUI: ${error.message}`;if(comfyChild===child)comfyChild=null;});
    return {started:true,reason:'Started by Local Flow',logFile};
  })();try{return await comfyStartPromise;}finally{comfyStartPromise=null;}
}
const paths = {
  config: path.join(DATA, 'settings.json'),
  models: path.join(DATA, 'models.json'),
  media: path.join(DATA, 'media'),
  trash: path.join(DATA, 'trash'),
  assets: path.join(DATA, 'assets.json'),
};
await fs.mkdir(DATA, { recursive: true });
await fs.mkdir(paths.media, { recursive: true });
await fs.mkdir(paths.trash, { recursive: true });

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function writeJson(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(data, null, 2)); }
function recoverLegacyJobIds(job,assetIndex={}){if(!job||!job.id)return false;let changed=false;const slug=value=>String(value||'recovered').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'recovered',scope=slug(job.project||job.id),scene=slug(job.scene||job.id),guessedProjectId=`project-${scope}`,guessedSceneId=`scene-${scope}-${scene}`,mediaFiles=[...(Array.isArray(job.files)?job.files:[]),...(job.file?[{file:job.file,assetId:job.assetId}]:[])],matches=mediaFiles.map(file=>assetIndex[path.basename(String(file.file||''))]).filter(Boolean),associations=matches.flatMap(row=>row.associations||[row]).filter(row=>row.projectId&&row.sceneId),association=associations.find(row=>(!job.assetId||!row.assetId||row.assetId===job.assetId))||associations[0];if(association){if(!job.projectId||job.projectId===guessedProjectId){if(job.projectId!==association.projectId){job.projectId=association.projectId;changed=true;}}if(!job.sceneId||job.sceneId===guessedSceneId){if(job.sceneId!==association.sceneId){job.sceneId=association.sceneId;changed=true;}}if(!job.assetId&&association.assetId){job.assetId=association.assetId;changed=true;}}if(!job.projectId){job.projectId=guessedProjectId;changed=true;}if(!job.sceneId){job.sceneId=guessedSceneId;changed=true;}if(!association&&job.projectId===guessedProjectId&&job.sceneId===guessedSceneId){if(job.legacyProjectName!==job.project){job.legacyProjectName=job.project;changed=true;}if(job.legacySceneName!==job.scene){job.legacySceneName=job.scene;changed=true;}}if(!job.assetId){job.assetId=`asset-${String(job.id).replace(/[^\w.-]+/g,'-')}`;changed=true;}return changed;}
let assetIndexWrite=Promise.resolve();
async function registerMediaAsset(record){const filename=path.basename(String(record?.file||record?.name||''));if(!filename)return;const write=assetIndexWrite.then(async()=>{const index=await readJson(paths.assets,{}),previous=index[filename]||{},priorAssociations=previous.associations||((previous.assetId||previous.projectId||previous.sceneId)?[previous]:[]),current={assetId:String(record.assetId||''),projectId:String(record.projectId||''),sceneId:String(record.sceneId||''),kind:record.kind||previous.kind||'',source:record.source||previous.source||undefined,model:record.model||previous.model||undefined,modelId:record.modelId||previous.modelId||undefined,provider:record.provider||previous.provider||undefined,batchId:record.batchId||undefined,variant:record.variant??undefined,variantCount:record.variantCount??undefined,rating:record.rating||undefined,createdAt:record.createdAt||undefined},associations=[];for(const candidate of [...priorAssociations,current].filter(a=>a.assetId||a.projectId||a.sceneId)){const match=associations.find(a=>a.projectId===candidate.projectId&&a.sceneId===candidate.sceneId&&(!a.assetId||!candidate.assetId||a.assetId===candidate.assetId));if(match)Object.assign(match,Object.fromEntries(Object.entries(candidate).filter(([,value])=>value!==undefined&&value!=='')));else associations.push({...candidate});}index[filename]={...previous,...record,file:filename,associations,updatedAt:new Date().toISOString()};await writeJson(paths.assets,index);});assetIndexWrite=write.catch(()=>{});return write;}

function videoContinuityMetadata(input={}){if(input.type!=='Video clip')return {};return {startSceneId:String(input.startSceneId||''),endSceneId:String(input.endSceneId||''),transition:input.transition==='flow'?'flow':'hard-cut',language:String(input.language||'English')};}
const getConfig = async () => ({ modelFolders: [], mediaFolder: paths.media, trashRetentionDays: 30, comfyUrl:'http://127.0.0.1:8188', comfyAutoStart:true, comfyCommand:'', comfyArgs:[], workflows:{}, defaultBatchCount:1, autoAssembleVideos:false, autoGenerateKeyframesAfterStoryboard:true, defaultVideoFps:24, defaultVideoResolution:'340p', ...(await readJson(paths.config, {})) });
const safePath = (root, name) => { const full = path.resolve(root, name); if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid file path'); return full; };
const isLoopbackUrl = value => { try { const url=new URL(value); return ['http:','https:'].includes(url.protocol) && ['127.0.0.1','localhost','[::1]'].includes(url.hostname); } catch { return false; } };
async function automaticComfyModelFolders(){if(process.platform!=='win32')return[];const local=process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),candidates=[path.join(local,'Comfy-Desktop','ComfyUI-Shared','models'),path.join(local,'Comfy-Desktop','ComfyUI-Installs','ComfyUI','ComfyUI','models')],found=[];for(const folder of candidates)if(await fs.access(folder).then(()=>true).catch(()=>false))found.push(path.resolve(folder));return [...new Map(found.map(folder=>[folder.toLowerCase(),folder])).values()];}
async function scanModels() {
  if(scanPromise)return scanPromise;
  scanPromise=(async()=>{
   const config = await getConfig(),scanFolders=[...new Set([...config.modelFolders,...await automaticComfyModelFolders()].map(folder=>path.resolve(folder)))];
   scanState = { ...scanState, scanning: true, folder: scanFolders.join('; '), errors: [] };
  const previous=await readJson(paths.models,[]);
  const found = new Map(previous.map(row=>[row.id,row]));
   const folders=new Set(scanFolders.map(f=>f.toLowerCase()));
  for(const [id,row] of found) if(folders.has(path.resolve(row.folder||'').toLowerCase())) found.delete(id);
  const visited = new Set();
  const supported = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.gguf', '.onnx', '.engine', '.bin']);
  const ignoreDirs = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'outputs', 'output', 'cache', 'caches', 'temp', 'tmp']);
  async function walk(dir, depth = 0) {
    if (depth > 9 || visited.has(dir)) return;
    visited.add(dir);
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (error) { scanState.errors.push(`${dir}: ${error.code || error.message}`); return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ignoreDirs.has(entry.name.toLowerCase())) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!entry.isFile() || !supported.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const stat = await fs.stat(full);
        const id = `${full.toLowerCase()}|${stat.size}|${stat.mtimeMs}`;
        const ext = path.extname(entry.name).toLowerCase();
      const kind = /video|wan|ltx|hunyuan|mochi|cogvideo|kling/i.test(entry.name) ? 'Video' : /clip|t5|llama|text.encoder|vae|controlnet/i.test(entry.name) ? 'Other' : 'Image';
      found.set(id, { id, name: path.basename(entry.name, ext), file: full, folder: dir, format: ext.slice(1), bytes: stat.size, modified: stat.mtime.toISOString(), type: kind, source: 'Folder scan' });
      } catch {}
    }
  }
   for (const folder of scanFolders) await walk(folder);
  const models = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  await writeJson(paths.models, models);
   scanState = { scanning: false, lastScan: new Date().toISOString(), folder: scanFolders.join('; '), found: models.length, errors: scanState.errors.slice(0, 12) };
  return { models, scan: scanState };
  })();
  try{return await scanPromise;}finally{scanPromise=null;}
}
function scheduleScan() { clearInterval(watchTimer); watchTimer = setInterval(() => scanModels().catch(() => {}), 60_000); }
function response(res, status, body, headers = {}) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', ...headers }); res.end(JSON.stringify(body)); }
function downloadResponse(res, buffer, contentType, filename) { res.writeHead(200, { 'content-type': contentType, 'content-length': buffer.length, 'content-disposition': `attachment; filename="${filename}"`, 'x-download-name': filename, 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS' }); res.end(buffer); }
function exportFilename(value, fallback) { const name = path.basename(String(value || fallback)).replace(/[^\w.-]+/g, '_'); return name && name !== '.' && name !== '..' ? name : fallback; }
async function storyboardImageForScene(image, config) {
  const source = String(image || ''), data = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i.exec(source);
  if (data) return Buffer.from(data[2], 'base64');
  if (!source.startsWith('/api/media/')) return null;
  const name = decodeURIComponent(source.slice('/api/media/'.length).split('?')[0]);
  if (path.basename(name) !== name || !['.png', '.jpg', '.jpeg'].includes(path.extname(name).toLowerCase())) return null;
  return fs.readFile(safePath(config.mediaFolder, name));
}
async function ollamaJson(baseUrl, model, prompt, { numPredict = 4096 } = {}) {
  const r=await fetch(baseUrl.replace(/\/$/,'')+'/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,prompt,stream:false,format:'json',options:{num_predict:numPredict}}),signal:AbortSignal.timeout(600000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'Ollama generation failed');
  const raw=String(data.response||'').trim();
  try{return JSON.parse(raw);}catch{const match=raw.match(/\{[\s\S]*\}/);if(match){try{return JSON.parse(match[0]);}catch{}}throw new Error('The local language model returned invalid JSON.');}
}
function buildCreativeChatSystem({shotCount=8,style='anime cinematic',assets=[],activeDesign=null,storyboardProposal=null,creatorCanon=''}={}) {
  const system=`You are the collaborative story partner inside Local Flow. Work with the creator on the complete concept before visual assets or scenes are generated. Explore the premise, what makes it distinct, genre and tone, protagonist and motivations, central conflict and stakes, setting, story arc, and desired ending as the conversation develops.

CONVERSATION RULES:
- Keep each reply concise, conversational, and focused on the next useful step. Do not restate the whole pitch or send the entire story again.
- Reply in one short paragraph or a few compact bullets. Never return a numbered questionnaire or a list of questions. Ask at most one focused question per assistant turn.
- The creator should not have to specify every detail. For non-canon gaps, proactively develop concrete, coherent ideas as clearly labeled AI proposals; do not turn routine creative choices into questions. This includes visual details such as a character's face, clothing, color scheme, art direction, and camera language.
- For missing character motivation, choose a clearly labeled proposal instead of asking the creator to invent one. Do not ask the creator to define the protagonist, crew, shield, planet, conflict, or ending if they have already given enough premise to suggest a coherent direction.
- Never present an unconfirmed name, motivation, world rule, or plot detail as a fact. Label each new story idea as a proposal until the creator accepts it.
- Advance only one story decision per turn. On the first turn, briefly acknowledge the creator's premise, offer one concise and distinctive story-hook proposal grounded in it, then ask at most one specific question about a genuinely consequential unresolved choice. Do not enumerate routine story components.
- Ask a question only when an unresolved choice materially changes the creator's intended story and cannot be safely offered as a proposal. When asking, make it specific and easy to answer; offer a few concise choices when useful.
- Never ask a vague "Should we proceed?" question. Ask the exact design-approval question only when the concept has enough confirmed story direction to present a useful plan for the creator to review.
- Separate confirmed canon from AI proposals in the wording. Do not imply that a proposal has been accepted.

${creatorCanon?`\n${creatorCanon}\n`:''}
CANON RULE: Every concrete detail explicitly supplied or approved by the creator is fixed canon. Preserve names, facts, relationships, events, world rules, visual constraints, and preferences exactly. Never replace, reinterpret, or overwrite a creator detail with an AI idea. When revising, change only what the creator requested and retain all other approved details.

Use the attached project settings only as preferences, not as authority to alter the creator's story. Number of scenes requested: ${String(shotCount)}. Current visual style preference: ${String(style)}.${activeDesign?`\n\nCURRENT DESIGN WORKSPACE: Focus on this one asset only while refining it with the creator. Do not restart or summarize the full story, and do not move to another asset unless asked. Preserve explicit canon; expand unspecified design details as labeled visual proposals. Ask one focused question only if a consequential design choice cannot be proposed safely. Current asset: ${JSON.stringify(activeDesign).slice(0,4000)}`:''} Existing reference/asset notes (descriptions only): ${JSON.stringify(assets).slice(0,16000)}${activeDesign?`\n\nIn this focused design conversation, discuss only the active asset and its visual direction. Treat user messages as edits or questions about this asset, preserve accepted details, and keep suggestions separate. Do not ask whether to prepare the full plan and never emit [[LOCALFLOW_STORYBOARD_READY]].`:storyboardProposal?`\n\nCURRENT STORYBOARD REVIEW: Visual development is already approved and the creator is reviewing this proposed storyboard: ${JSON.stringify(storyboardProposal).slice(0,12000)}. Discuss only the creator's requested changes to this scene plan. Preserve all confirmed story and design details. Do not return to asset planning, do not regenerate a new storyboard by yourself, and do not claim approval. After a requested change, summarize the precise change and let the creator decide whether to revise the draft. Do not emit [[LOCALFLOW_STORYBOARD_READY]].`:`\n\nWhen the first-pass concept is mature enough, summarize only confirmed facts and clearly separate optional AI proposals. Ask exactly: “Should I prepare the character and visual asset designs first?” Do not start generation until the creator explicitly agrees. Only after that explicit approval, answer briefly and append the exact token [[LOCALFLOW_STORYBOARD_READY]] at the end. Never emit that token before approval.`}`;
  return system;
}
function normalizeCreativeReply(value) {
  let text=String(value||'').trim();
  if(!text)return text;
  const lines=text.split(/\r?\n/);
  const numberedItems=lines.filter(line=>/^\s*\d+[.)]\s+/.test(line));
  const numbered=numberedItems.length>=2&&numberedItems.filter(line=>/\?\s*$|^\s*\d+[.)]\s+(?:who|what|where|when|why|how|which|should|would|could|do|does|is|are|can)\b/i.test(line)).length>=Math.ceil(numberedItems.length/2);
  if(numbered){
    const firstItem=lines.findIndex(line=>/^\s*\d+[.)]\s+/.test(line));
    const prefix=lines.slice(0,firstItem).join('\n').trim();
    const afterList=lines.slice(firstItem).filter(line=>!/^\s*\d+[.)]\s+/.test(line));
    const lastQuestionLine=afterList.map(line=>line.includes('?')).lastIndexOf(true);
    const finalQuestion=lastQuestionLine>=0?afterList[lastQuestionLine].slice(afterList[lastQuestionLine].lastIndexOf('\n')+1).trim():'';
    text=[prefix,finalQuestion].filter(Boolean).join('\n\n');
  }
  const questionLines=text.split(/\r?\n/);
  const indices=questionLines.map((line,index)=>line.includes('?')?index:-1).filter(index=>index>=0);
  if((text.match(/\?/g)||[]).length>1){
    const lastIndex=indices.at(-1);
    questionLines.splice(0,questionLines.length,...questionLines.filter((line,index)=>!line.includes('?')||index===lastIndex));
    const finalIndex=questionLines.findLastIndex(line=>line.includes('?'));
    const finalLine=questionLines[finalIndex];
    const lastEarlierQuestion=finalLine.lastIndexOf('?',finalLine.length-2);
    if(lastEarlierQuestion>=0)questionLines[finalIndex]=finalLine.slice(lastEarlierQuestion+1).trim();
    text=questionLines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  return text;
}
function creativeChatOptionChoices(text) {
  const question=lastQuestion(text);
  if(isDesignPreparationQuestion(question))return [
    {label:'Prepare the design plan',description:'Start building the reusable character, uniform, and art-direction designs.',reply:'Yes, prepare the character and visual asset designs first.'},
    {label:'Keep refining the story',description:'Continue shaping the concept before preparing any visual designs.',reply:'No, not yet. I want to keep refining the story first.'},
  ];
  const yesNoChoices=storyChatYesNoChoices(question);if(yesNoChoices.length)return yesNoChoices;
  const numberedOptions=String(text||'').split(/\r?\n/).map(line=>line.match(/^\s*\d+[.)]\s+(.+)$/)?.[1]?.trim()).filter(Boolean);
  if(numberedOptions.length>=2&&/\b(which|choose|prefer|best captures|ending direction|these endings|these options)\b/i.test(question))return numberedOptions.slice(0,5).map((raw,index)=>{const clean=raw.replace(/[*_`]/g,'').trim();const label=(clean.split(/\s+(?:—|–|-)\s+|:\s+|\.\s+/)[0]||clean).slice(0,56).trim();return {label:label||`Option ${index+1}`,description:clean.slice(0,180),reply:`For this choice, I prefer: ${clean}`};});
  const match=question.match(/\b([a-z][a-z -]{1,30}),\s*([a-z][a-z -]{1,30}),\s*or\s+([a-z][a-z -]{1,30})\??$/i);
  if(!match)return [];
  return match.slice(1).map((value,index)=>{const option=(index===0?value.replace(/^(?:should|would|could|can)\s+/i,'').replace(/^it\s+(?:be\s+)?/i,'').replace(/^you\s+(?:prefer|choose)\s+/i,'').replace(/^be\s+/i,'').replace(/^which\s+(?:option|aspect|trait)\s*:?\s*/i,'').replace(/^what\s+(?:aspect|trait)\s+(?:should\s+)?(?:be\s+)?/i,'').replace(/^its ability to\s+/i,''):value).trim();const label=option.replace(/\b\w/g,char=>char.toUpperCase());return {label,description:`Choose “${option}” for this story direction.`,reply:`For this part, I prefer ${option}.`};});
}
async function bodyJson(req) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error('Request body too large'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
function writableFile(file){return createWriteStream(file,{flags:'w'});}
async function listFiles(root, trash = false) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const assetIndex=await readJson(paths.assets,{});
  const jobs=await readJson(path.join(DATA,'jobs.json'),[]),jobAssetIndex=Object.fromEntries(jobs.flatMap(job=>(job.files||[]).map(file=>[file.file,{...file,assetId:file.assetId||job.assetId,projectId:file.projectId||job.projectId,sceneId:file.sceneId||job.sceneId,provider:file.provider||job.provider||(job.modelId?'ComfyUI':undefined),model:file.model||job.model,modelId:file.modelId||job.modelId,batchId:file.batchId||job.batchId,variant:file.variant||job.variant,variantCount:file.variantCount||job.variantCount}])));
  const rows = [];
  for (const e of entries) if (e.isFile()) {
    const full = path.join(root, e.name), stat = await fs.stat(full).catch(() => null); if (!stat) continue;
    const split = e.name.indexOf('__');
    const base = trash && split >= 0 ? e.name.slice(split + 2) : e.name;
    const ext = path.extname(base).toLowerCase(); if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) continue;
    const indexed=assetIndex[base]||{},jobRecord=jobAssetIndex[base]||{},association=(indexed.associations||[]).find(a=>a.assetId||a.projectId||a.sceneId)||{};
    rows.push({ ...jobRecord,...indexed,assetId:indexed.assetId||association.assetId||jobRecord.assetId,projectId:indexed.projectId||association.projectId||jobRecord.projectId,sceneId:indexed.sceneId||association.sceneId||jobRecord.sceneId,provider:indexed.provider||association.provider||jobRecord.provider,model:indexed.model||association.model||jobRecord.model,modelId:indexed.modelId||association.modelId||jobRecord.modelId, name: base, storedName: e.name, url: `/api/media/${encodeURIComponent(e.name)}${trash ? '?trash=1' : ''}`, kind: VIDEO_EXT.has(ext) ? 'Video' : 'Image', bytes: stat.size, modified: stat.mtime.toISOString(), trashedAt: trash ? new Date(Number(e.name.split('__')[0]) || stat.mtimeMs).toISOString() : null });
  }
  return rows.sort((a, b) => b.modified.localeCompare(a.modified));
}
async function localImageData(image) {
  if(!image)return null;
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if(match)return `data:image/${match[1]};base64,${match[2]}`;
  if(image.startsWith('/api/media/')){const config=await getConfig();const name=decodeURIComponent(image.slice('/api/media/'.length).split('?')[0]);const file=safePath(config.mediaFolder,name);const stat=await fs.stat(file);if(stat.size>30*1024*1024)throw new Error('MiniMax reference images must be 30 MB or smaller');const ext=path.extname(name).toLowerCase();const mime=ext==='.jpg'||ext==='.jpeg'?'jpeg':ext==='.webp'?'webp':'png';return `data:image/${mime};base64,${(await fs.readFile(file)).toString('base64')}`;}
  return null;
}
async function minimaxRequest(pathname, key, options={}) { const base=options.region==='cn'?'https://api.minimaxi.com':'https://api.minimax.io';const res=await fetch(`${base}${pathname}`,{...options,headers:{...(options.headers||{}),authorization:`Bearer ${key}`},signal:AbortSignal.timeout(options.timeout||120000)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.base_resp?.status_msg||data.error?.message||data.message||`MiniMax request failed (${res.status})`);if(data.base_resp&&data.base_resp.status_code!==0)throw new Error(data.base_resp.status_msg||`MiniMax API error ${data.base_resp.status_code}`);return data; }
async function saveRemoteMedia(url,destination,filename) { const res=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!res.ok)throw new Error(`Could not download generated media (${res.status})`);const full=safePath(destination,filename);await fs.mkdir(destination,{recursive:true});await fs.writeFile(full,Buffer.from(await res.arrayBuffer()));return {name:filename,url:`/api/media/${encodeURIComponent(filename)}`}; }
async function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (rel === '/') rel = '/index.html';
  if(rel.includes('..')){res.writeHead(400);return res.end('Invalid path');}
  const root=path.join(ROOT,'dist');let full=safePath(root,rel.slice(1));const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
  try{let stat=await fs.stat(full);if(!stat.isFile())throw new Error();res.writeHead(200,{'content-type':types[path.extname(full).toLowerCase()]||'application/octet-stream','cache-control':path.extname(full)==='.html'?'no-cache':'public, max-age=31536000, immutable'});createReadStream(full).pipe(res);}catch{if(!path.extname(rel)){try{full=path.join(root,'index.html');res.writeHead(200,{'content-type':types['.html'],'cache-control':'no-cache'});return createReadStream(full).pipe(res);}catch{}}res.writeHead(404);res.end('Build the interface with npm run build first.');}
}
function localZImageWorkflow(prompt, prefix, referenceImageName) {
  const styledPrompt = `${prompt}. Follow the described scene literally and preserve its intended subjects, setting, visual style, and character details. Keep recurring characters, clothing, props, and vehicle design consistent with the prompt and any reference frame. If the prompt describes a spacecraft, show a purpose-built vessel traveling in space with a sealed hull and engines; do not substitute an airplane, airliner, jet, boat, or naval vessel, and do not add wings or atmospheric flight details unless requested. Do not add named characters or story elements absent from the scene. Use cinematic composition and detailed lighting. No captions, lettering, logos, speech bubbles, or interface text.`;
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: styledPrompt, clip: ['2', 0] } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': referenceImageName ? { class_type: 'LoadImage', inputs: { image: referenceImageName } } : { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 576, batch_size: 1 } },
    ...(referenceImageName ? { '10': { class_type: 'VAEEncode', inputs: { pixels: ['6', 0], vae: ['3', 0] } } } : {}),
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: referenceImageName ? ['10', 0] : ['6', 0], seed: Math.floor(Math.random() * 2147483647), steps: 9, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: referenceImageName ? 0.72 : 1 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: prefix } },
  };
}
function localQwenImage21Workflow(prompt, prefix, referenceCount = 0, aspectRatio = '16:9', resolution = 1024) {
  const [ratioW, ratioH] = String(aspectRatio).split(':').map(Number);
  const megapixel = Math.max(512, Math.min(2048, Number(resolution) || 1024));
  const scale = megapixel / Math.max(ratioW || 16, ratioH || 9);
  const width = Math.max(64, Math.round((ratioW || 16) * scale / 64) * 64);
  const height = Math.max(64, Math.round((ratioH || 9) * scale / 64) * 64);
  const slots = Math.max(0, Math.min(16, Number(referenceCount) || 0));
  const images = Object.fromEntries(Array.from({ length: slots }, (_, index) => [`images.image_${index + 1}`, [`${10 + index}`, 0]]));
  const graph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_2.1_int8_convrot.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_8b_int8_convrot.safetensors', type: 'qwen_image', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' } },
    '4': { class_type: 'TextEncodeQwenImage21', inputs: { clip: ['2', 0], prompt, negative_prompt: '', vae: ['3', 0], resolution: 1024, ...images } },
    '5': { class_type: 'QwenImage21Cache', inputs: { model: ['1', 0], device: 'auto', dtype: 'default' } },
    '6': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['5', 0], positive: ['4', 0], negative: ['4', 1], latent_image: slots ? ['4', 2] : ['6', 0], seed: Math.floor(Math.random() * 2147483647), steps: 25, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: prefix } },
  };
  for (let index = 0; index < slots; index++) graph[String(10 + index)] = { class_type: 'LoadImage', inputs: { image: `local-flow-reference-${index + 1}.png` } };
  return graph;
}
function normalizeVisionFocusRegion(region, confidence, role = '') {
  if (!region || typeof region !== 'object') return null;
  let confidenceValue=confidence??region.confidence;
  let coordinates=['x','y','width','height'].map(key=>Number(region[key]));
  const pixelBox=Array.isArray(region.bbox_2d)&&region.bbox_2d.length===4;
  if(pixelBox){const [left,top,right,bottom]=region.bbox_2d.map(Number);coordinates=[left,top,right-left,bottom-top];if(confidenceValue===undefined&&region.label)confidenceValue=0.85;}
  if (confidenceValue === undefined || !Number.isFinite(Number(confidenceValue)) || Number(confidenceValue) < 0.55) return null;
  const values = coordinates;
  if (values.some(value => !Number.isFinite(value))) return null;
  let [x, y, width, height] = pixelBox?values:values.map(value => value / 1000);
  if (x < 0 || y < 0 || width < (pixelBox?40:0.05) || height < (pixelBox?50:0.05) || (!pixelBox&&(width >= 0.98 && height >= 0.98)) || (!pixelBox&&(x + width > 1.000001 || y + height > 1.000001))) return null;
  if (String(role).toLowerCase() === 'character') {
    if (width / height > 0.45) return null;
    const marginX = width * 0.075, marginY = height * 0.05;
    x = Math.max(0, x - marginX); y = Math.max(0, y - marginY);
    width = pixelBox?width+marginX*2:Math.min(1 - x, width + marginX * 2); height = pixelBox?height+marginY*2:Math.min(1 - y, height + marginY * 2);
  }
  return { x, y, width, height, ...(pixelBox?{unit:'px'}:{}) };
}
function normalizedReferenceCropFilter(region) {
  if (!region || typeof region !== 'object') return null;
  const values = ['x', 'y', 'width', 'height'].map(key => Number(region[key]));
  if (values.some(value => !Number.isFinite(value))) return null;
  const [x, y, width, height] = values;
  if(region.unit==='px'){
    if(x<0||y<0||width<40||height<50)return null;
    return `crop=${Math.round(width)}:${Math.round(height)}:${Math.round(x)}:${Math.round(y)}`;
  }
  if (x < 0 || y < 0 || width < 0.05 || height < 0.05 || x + width > 1.000001 || y + height > 1.000001) return null;
  return `crop=iw*${width.toFixed(6)}:ih*${height.toFixed(6)}:iw*${x.toFixed(6)}:ih*${y.toFixed(6)}`;
}
function animagineReferencePrompt(prompt, assignments = []) {
  const roleNames = { character: 'character identity and face only', wardrobe: 'uniform and costume construction only', vehicle: 'vehicle silhouette and markings only', location: 'environment layout and palette only', prop: 'prop design only', 'series-style': 'series-wide anime linework, shading, and color language only', style: 'rendering style only', palette: 'color relationships only', silhouette: 'shape and silhouette only', subject: 'the depicted subject only' };
  const references = (Array.isArray(assignments) ? assignments : []).map((row, index) => {
    const role = String(row?.role || row?.referenceRole || 'subject').toLowerCase();
    const name = String(row?.assetName || row?.sourceAssetName || row?.name || `Reference ${index + 1}`);
    return `Reference ${index + 1} (${name}) guides ${roleNames[role] || role}. Preserve only those assigned traits; create a new pose, camera, and scene composition.`;
  });
  if (!references.length) return String(prompt || '');
  return `${prompt}\n\nAttached IP-Adapter references in exact order:\n${references.join('\n')}\nDo not copy any reference pose, crop, sheet layout, labels, or background. Follow the requested scene action and composition.`;
}
function localAnimagineXL4Workflow(prompt, prefix, referenceImageNames = [], referenceAssignments = [], aspectRatio = '16:9') {
  const [ratioW, ratioH] = String(aspectRatio).split(':').map(Number);
  const scale = 1024 / Math.max(ratioW || 16, ratioH || 9);
  const width = Math.max(64, Math.round((ratioW || 16) * scale / 64) * 64);
  const height = Math.max(64, Math.round((ratioH || 9) * scale / 64) * 64);
  const graph = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'animagine-xl-4.0-opt.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: animagineReferencePrompt(prompt, referenceAssignments), clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'low quality, worst quality, blurry, deformed, duplicate person, extra limbs, extra fingers, text, watermark, logo, collage, character sheet, multiple views', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: Math.floor(Math.random() * 2147483647), steps: 30, cfg: 5.5, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: prefix } },
  };
  if (!referenceImageNames.length) return graph;
  graph['8'] = { class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: 'ip-adapter-plus_sdxl_vit-h.safetensors' } };
  graph['9'] = { class_type: 'CLIPVisionLoader', inputs: { clip_name: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors' } };
  const groups = new Map();
  for (const [index, imageName] of referenceImageNames.entries()) {
    const assignment = referenceAssignments[index] || {};
    const role = String(assignment.role || assignment.referenceRole || 'subject').toLowerCase();
    const imageNode = String(10 + index);
    graph[imageNode] = { class_type: 'LoadImage', inputs: { image: imageName } };
    const identity = String(assignment.assignedAssetId || assignment.assetId || assignment.assetName || assignment.sourceAssetName || assignment.name || `reference-${index}`).trim().toLowerCase();
    const key = `${role}\u001f${identity}`;
    if (!groups.has(key)) groups.set(key, { role, indices: [] });
    groups.get(key).indices.push(index);
  }
  let modelLink = ['1', 0], combineId = 60, applyId = 80;
  for (const group of groups.values()) {
    const { role, indices } = group;
    if (['series-style', 'style', 'palette'].includes(role)) {
      for (const index of indices) {
        const adapterNode = String(30 + index), imageNode = String(10 + index);
        graph[adapterNode] = { class_type: 'IPAdapterStyleComposition', inputs: { model: modelLink, ipadapter: ['8', 0], image_style: [imageNode, 0], image_composition: [imageNode, 0], weight_style: 0.55, weight_composition: 0, expand_style: false, combine_embeds: 'average', start_at: 0, end_at: 0.9, embeds_scaling: 'V only', clip_vision: ['9', 0] } };
        modelLink = [adapterNode, 0];
      }
      continue;
    }
    const weight = role === 'character' ? 0.9 : role === 'vehicle' ? 0.75 : role === 'location' ? 0.55 : 0.65;
    if (indices.length === 1) {
      const index = indices[0], adapterNode = String(30 + index), imageNode = String(10 + index);
      graph[adapterNode] = { class_type: 'IPAdapterAdvanced', inputs: { model: modelLink, ipadapter: ['8', 0], image: [imageNode, 0], weight, weight_type: 'linear', combine_embeds: 'average', start_at: 0, end_at: 0.9, embeds_scaling: 'V only', clip_vision: ['9', 0] } };
      modelLink = [adapterNode, 0];
      continue;
    }
    const embeds = indices.map(index => {
      const node = String(40 + index);
      graph[node] = { class_type: 'IPAdapterEncoder', inputs: { ipadapter: ['8', 0], image: [String(10 + index), 0], weight: 1, clip_vision: ['9', 0] } };
      return [node, 0];
    });
    let combined = embeds.shift();
    while (embeds.length) {
      const batch = [combined, ...embeds.splice(0, 4)], node = String(combineId++);
      graph[node] = { class_type: 'IPAdapterCombineEmbeds', inputs: { ...Object.fromEntries(batch.map((embed, index) => [`embed${index + 1}`, embed])), method: 'add' } };
      combined = [node, 0];
    }
    const adapterNode = String(applyId++);
    graph[adapterNode] = { class_type: 'IPAdapterEmbeds', inputs: { model: modelLink, ipadapter: ['8', 0], pos_embed: combined, weight: weight / indices.length, weight_type: 'linear', start_at: 0, end_at: 0.9, embeds_scaling: 'V only', clip_vision: ['9', 0] } };
    modelLink = [adapterNode, 0];
  }
  graph['5'].inputs.model = modelLink;
  return graph;
}
function enhancedReferenceAssignmentBlock(references, maxReferences = 16) {
  if (!Array.isArray(references) || !references.length) return '';
  const limit = Math.max(1, Math.min(16, Math.trunc(Number(maxReferences) || 1)));
  const compact = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const rows = references.slice(0, limit).map((reference, index) => {
    const subject = compact(reference?.assetName || reference?.name) || 'visual subject';
    const role = compact(reference?.roleName || reference?.role) || 'visual design';
    const fixed = compact(reference?.assetDescription);
    const observations = compact(reference?.referenceObservations);
    const details = [fixed && `Preserve these fixed details: ${fixed}.`, observations && `Visual observations: ${observations}.`].filter(Boolean).join(' ');
    return `Reference ${index + 1} is ${subject} (${role}). Use it only for the assigned ${role}; preserve its identity and design without copying its pose or composition.${details ? ` ${details}` : ''}`;
  });
  return `Visual reference assignments (images are attached separately in this exact order):\n${rows.join('\n')}`;
}

function isMeaningfullyEnhancedPrompt(source, candidate) {
  const tokenize = value => String(value || '').toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const original = String(source || '').trim();
  const result = String(candidate || '').trim();
  if (!original || !result) return false;
  if (original.replace(/\s+/g, ' ').toLocaleLowerCase() === result.replace(/\s+/g, ' ').toLocaleLowerCase()) return false;
  const sourceWords = new Set(tokenize(original));
  const resultWords = new Set(tokenize(result));
  if (!sourceWords.size || !resultWords.size) return false;
  const retained = [...sourceWords].filter(word => resultWords.has(word)).length;
  const retention = retained / sourceWords.size;
  const added = [...resultWords].filter(word => !sourceWords.has(word)).length;
  return retention >= 0.5 && added >= 4;
}

async function inspectAnimagineComfy(baseUrl) {
  const unavailable = { filesReady: false, supported: false, ready: false, readinessNote: 'Animagine XL 4.0 needs its SDXL checkpoint, IP-Adapter Plus SDXL weights, CLIP Vision ViT-H weights, and the ComfyUI IPAdapter Plus nodes.' };
  try {
    const response = await fetch(`${String(baseUrl).replace(/\/$/, '')}/internal/folder_paths`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return unavailable;
    const paths = await response.json();
    const exists = async (kind, name) => {
      for (const folder of paths[kind] || []) { try { await fs.access(path.join(folder, name)); return true; } catch {} }
      return false;
    };
    const filesReady = (await Promise.all([
      exists('checkpoints', 'animagine-xl-4.0-opt.safetensors'),
      exists('ipadapter', 'ip-adapter-plus_sdxl_vit-h.safetensors'),
      exists('clip_vision', 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors'),
    ])).every(Boolean);
    const nodeNames = ['CheckpointLoaderSimple', 'IPAdapterModelLoader', 'IPAdapterAdvanced', 'IPAdapterStyleComposition', 'CLIPVisionLoader'];
    const supported = (await Promise.all(nodeNames.map(async name => {
      try { const node = await fetch(`${String(baseUrl).replace(/\/$/, '')}/object_info/${name}`, { signal: AbortSignal.timeout(1500) }); return node.ok && Boolean((await node.json())[name]); } catch { return false; }
    }))).every(Boolean);
    const ready = filesReady && supported;
    return { filesReady, supported, ready, readinessNote: ready ? 'Animagine XL 4.0 and role-aware IP-Adapter references are ready in ComfyUI.' : filesReady ? 'Animagine model files are installed, but ComfyUI needs the IPAdapter Plus nodes enabled.' : unavailable.readinessNote };
  } catch { return unavailable; }
}
function qwenReferencePrompt(prompt, assignments = [], referenceCount = null) {
  const selected = (Array.isArray(assignments) ? assignments : []).slice(0, 16);
  const refs = Array.from({ length: Math.max(selected.length, Math.min(16, Number(referenceCount) || 0)) }, (_, index) => selected[index] || { name: `Selected reference ${index + 1}`, role: 'subject' });
  if (!refs.length) return prompt;
  const roleNames = { character: 'the same character identity', wardrobe: 'uniform or costume construction', vehicle: 'vehicle design and silhouette', location: 'environment design', prop: 'prop design', style: 'anime rendering style', 'series-style': 'series-wide art direction and linework', palette: 'color palette', silhouette: 'shape and silhouette', subject: 'subject appearance' };
  const guide = refs.map((ref, index) => {
    const role = String(ref.role || ref.roleName || 'subject').toLowerCase();
    const roleName = roleNames[role] || ref.roleName || role;
    const identity = ref.assetName || ref.sourceAssetName || ref.name || `Reference ${index + 1}`;
    const styleRoles = ['style', 'series-style', 'palette'];
    const description = [ref.assetDescription, styleRoles.includes(role) ? ref.assetVisualStyle : '', ref.referenceObservations].filter(Boolean).join('; ');
    return `<image${index + 1}> is ${identity}, assigned only for ${roleName}${description ? ` (${description})` : ''}.`;
  }).join('\n');
  return `Selected visual references are supplied as images in this exact order. Use each only for its assigned details; references guide the new design but do not define the pose, camera, layout, or background.\n${guide}\n\nCreate a new composition that follows the requested action and scene. Preserve the referenced identities and assigned design traits while applying the project style. Never reproduce a character sheet, collage, reference layout, or unrelated subject.\n\nRequested image:\n${prompt}`;
}
function localMiniMaxH3ReferenceWorkflow(prompt, prefix, durationSeconds = 5, resolution = '720p', aspectRatio = '16:9', referenceImageNames = [], imageName = null, endImageName = null) {
  const duration = Math.max(5, Math.min(15, Number(durationSeconds) || 5));
  const heights = { '340p': 340, '480p': 480, '540p': 540, '720p': 720, '1080p': 1080 };
  const [ratioW, ratioH] = String(aspectRatio).split(':').map(Number);
  const requestedHeight = heights[resolution] || 720;
  const frameHeight = Math.round(requestedHeight / 32) * 32;
  const width = Math.round((frameHeight * (ratioW || 16) / (ratioH || 9)) / 32) * 32;
  const rawFrames = Math.round(duration * 24);
  const lower = Math.max(124, rawFrames - (((rawFrames - 5) % 17 + 17) % 17));
  const upper = lower + 17;
  const frames = rawFrames - lower <= upper - rawFrames ? lower : upper;
  const selectedReferences = (Array.isArray(referenceImageNames) ? referenceImageNames : []).filter(Boolean).slice(0, 9);
  const graph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', weight_dtype: 'default' } },
    '16': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', strength_model: 1 } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', type: 'minimax', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' } },
    ...(imageName ? { '5': { class_type: 'LoadImage', inputs: { image: imageName } } } : {}),
    ...(endImageName ? { '18': { class_type: 'LoadImage', inputs: { image: endImageName } } } : {}),
    '6': { class_type: 'MiniMaxH3ReferenceToVideo', inputs: {
      clip: ['2', 0], vae: ['3', 0], audio_vae: ['4', 0], prompt, width, height: frameHeight,
      length: frames, ref_image_size: 'match',
      ...(selectedReferences.length ? { ref_images: Object.fromEntries(selectedReferences.map((_, index) => [`ref_image_${index}`, [`${30 + index}`, 0]])) } : {}),
    } },
    ...Object.fromEntries(selectedReferences.map((imageName, index) => [`${30 + index}`, { class_type: 'LoadImage', inputs: { image: imageName } }])),
  };
  let conditioning = ['6', 0];
  if (imageName) {
    graph['20'] = { class_type: 'MiniMaxH3AddGuide', inputs: { positive: conditioning, latent: ['6', 1], frame_idx: 0, vae: ['3', 0], image: ['5', 0] } };
    conditioning = ['20', 0];
  }
  if (endImageName) {
    graph['21'] = { class_type: 'MiniMaxH3AddGuide', inputs: { positive: conditioning, latent: ['6', 1], frame_idx: -1, vae: ['3', 0], image: ['18', 0] } };
    conditioning = ['21', 0];
  }
  graph['7'] = { class_type: 'RandomNoise', inputs: { noise_seed: Math.floor(Math.random() * 2147483647) } };
  graph['8'] = { class_type: 'BasicGuider', inputs: { model: ['16', 0], conditioning } };
  graph['9'] = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } };
  graph['10'] = { class_type: 'BasicScheduler', inputs: { model: ['16', 0], scheduler: 'simple', steps: 8, denoise: 1 } };
  graph['11'] = { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['7', 0], guider: ['8', 0], sampler: ['9', 0], sigmas: ['10', 0], latent_image: ['6', 1] } };
  graph['12'] = { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['3', 0] } };
  graph['13'] = { class_type: 'VAEDecodeAudio', inputs: { samples: ['11', 0], vae: ['4', 0] } };
  graph['14'] = { class_type: 'CreateVideo', inputs: { images: ['12', 0], audio: ['13', 0], fps: 24, bit_depth: 8, color_space: 'sRGB', codec: 'auto' } };
  graph['15'] = { class_type: 'SaveVideo', inputs: { video: ['14', 0], filename_prefix: prefix, format: 'auto', codec: { codec: 'auto' } } };
  return graph;
}
function localMiniMaxH3Workflow(prompt, imageName, prefix, durationSeconds = 5, resolution = '720p', aspectRatio = '16:9', endImageName = null) {
  const duration = Math.max(5, Math.min(15, Number(durationSeconds) || 5));
  const heights = { '340p': 340, '480p': 480, '540p': 540, '720p': 720, '1080p': 1080 };
  const [ratioW, ratioH] = String(aspectRatio).split(':').map(Number);
  const requestedHeight = heights[resolution] || 720;
  const frameHeight = Math.round(requestedHeight / 32) * 32;
  const width = Math.round((frameHeight * (ratioW || 16) / (ratioH || 9)) / 32) * 32;
  const rawFrames = Math.round(duration * 24);
  const lower = Math.max(124, rawFrames - (((rawFrames - 5) % 17 + 17) % 17));
  const upper = lower + 17;
  const frames = rawFrames - lower <= upper - rawFrames ? lower : upper;
  const motionPrompt = `${prompt}. Animate the established storyboard image as the opening frame. Preserve its exact art medium and series rendering style, character identities, clothing, props, environment, lighting, palette, and proportions. Create natural, readable motion that follows the described action, with restrained camera movement and no design drift. When an ending frame is supplied, transition toward that composition and preserve its depicted identities and layout. Do not add dialogue, subtitles, captions, logos, or readable text unless the prompt explicitly requests them.`;
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', weight_dtype: 'default' } },
    '16': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', strength_model: 1 } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', type: 'minimax', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' } },
    ...(imageName ? { '5': { class_type: 'LoadImage', inputs: { image: imageName } } } : {}),
    ...(endImageName ? { '18': { class_type: 'LoadImage', inputs: { image: endImageName } } } : {}),
    '6': { class_type: 'MiniMaxH3ImageToVideo', inputs: { clip: ['2', 0], vae: ['3', 0], prompt: motionPrompt, width, height: frameHeight, length: frames, ...(imageName ? { first_frame: ['5', 0] } : {}), ...(endImageName ? { last_frame: ['18', 0] } : {}) } },
    '7': { class_type: 'RandomNoise', inputs: { noise_seed: Math.floor(Math.random() * 2147483647) } },
    '8': { class_type: 'BasicGuider', inputs: { model: ['16', 0], conditioning: ['6', 0] } },
    '9': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    '10': { class_type: 'BasicScheduler', inputs: { model: ['16', 0], scheduler: 'simple', steps: 8, denoise: 1 } },
    '11': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['7', 0], guider: ['8', 0], sampler: ['9', 0], sigmas: ['10', 0], latent_image: ['6', 1] } },
    '12': { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['3', 0] } },
    '13': { class_type: 'VAEDecodeAudio', inputs: { samples: ['11', 0], vae: ['4', 0] } },
    '14': { class_type: 'CreateVideo', inputs: { images: ['12', 0], audio: ['13', 0], fps: 24, bit_depth: 8, color_space: 'sRGB', codec: 'auto' } },
    '15': { class_type: 'SaveVideo', inputs: { video: ['14', 0], filename_prefix: prefix, format: 'auto', codec: { codec: 'auto' } } },
  };
}
function buildMiniMaxH3VideoWorkflowForSource({prompt,prefix,durationSeconds,resolution,aspectRatio,sourceMode='storyboard',referenceImageNames=[],imageName=null,endImageName=null}) {
  const references=Array.isArray(referenceImageNames)?referenceImageNames.filter(Boolean):[];
  if(sourceMode==='text'&&references.length){
    return {graph:localMiniMaxH3ReferenceWorkflow(prompt,prefix,durationSeconds,resolution,aspectRatio,references,null,null),nativeVideoReferenceWorkflow:true,imageInputNames:references};
  }
  // For storyboard clips, the selected keyframe already contains the approved
  // visual identity and composition. Feeding character sheets into H3's
  // reference-to-video inputs can make it animate those sheets as scene content.
  return {graph:localMiniMaxH3Workflow(prompt,sourceMode==='text'?null:imageName,prefix,durationSeconds,resolution,aspectRatio,sourceMode==='text'?null:endImageName),nativeVideoReferenceWorkflow:false,imageInputNames:sourceMode==='text'?[]:(imageName?[imageName]:[])};
}
async function getWan22ComfyReadiness(baseUrl) {
  const base=String(baseUrl||'http://127.0.0.1:8188').replace(/\/$/,'');
  const pathsResponse=await fetch(`${base}/internal/folder_paths`,{signal:AbortSignal.timeout(3000)});
  if(!pathsResponse.ok)throw new Error('ComfyUI model paths unavailable');
  const paths=await pathsResponse.json();
  const hasFile=async(kind,name)=>{for(const folder of paths[kind]||[]){try{await fs.access(path.join(folder,name));return true;}catch{}}return false;};
  const hasNode=async name=>{try{const response=await fetch(`${base}/object_info/${name}`,{signal:AbortSignal.timeout(2000)});if(!response.ok)return false;const info=await response.json();return Boolean(info[name]);}catch{return false;}};
  return wan22Readiness({hasFile,hasNode});
}

async function uploadComfyInputImage(inputImage, baseUrl, filenamePrefix, fitReferenceToSquare = false, focusRegion = null) {
  if(!inputImage)return null;
  let content,mime='image/png',sourceName=`${filenamePrefix}-${Date.now()}.png`;
  const dataMatch=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(inputImage);
  if(dataMatch){mime=`image/${dataMatch[1]}`;sourceName=`${filenamePrefix}-${Date.now()}.${dataMatch[1]==='jpeg'?'jpg':dataMatch[1]}`;content=Buffer.from(dataMatch[2],'base64');}
  else if(inputImage.startsWith('/api/media/')){const name=decodeURIComponent(inputImage.slice('/api/media/'.length).split('?')[0]);const config=await getConfig();sourceName=path.basename(name);content=await fs.readFile(safePath(config.mediaFolder,name));const ext=path.extname(sourceName).toLowerCase();mime=ext==='.webp'?'image/webp':ext==='.jpg'||ext==='.jpeg'?'image/jpeg':'image/png';}
  else throw new Error('Reference image must be saved in Local Flow media or be a supported data URL');
  let tempDir='';
  try{
  const subjectCrop = fitReferenceToSquare ? normalizedReferenceCropFilter(focusRegion) : null;
  if(fitReferenceToSquare){
    tempDir=await fs.mkdtemp(path.join(os.tmpdir(),'local-flow-reference-'));
    const sourcePath=path.join(tempDir,sourceName),fittedPath=path.join(tempDir,'reference-fit.png');
    await fs.writeFile(sourcePath,content);
    const ffmpeg=await locateFfmpeg(await getConfig());
    const fitFilters = ['scale=1024:1024:force_original_aspect_ratio=decrease', 'pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=black@0.0', 'format=rgba'];
    const runFit = filters => execFileAsync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',sourcePath,'-vf',filters.join(','),'-frames:v','1',fittedPath],{windowsHide:true,timeout:20000});
    try { await runFit([...(subjectCrop?[subjectCrop]:[]),...fitFilters]); }
    catch (error) { if (!subjectCrop) throw error; await runFit(fitFilters); }
    content=await fs.readFile(fittedPath);mime='image/png';sourceName=`${path.basename(sourceName,path.extname(sourceName))}-fit.png`;
  }
  const form=new FormData();form.append('image',new Blob([content],{type:mime}),sourceName);form.append('type','input');form.append('overwrite','true');
  let uploadError='';
  try{
    const upload=await fetch(`${baseUrl}/upload/image`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
    if(upload.ok){const result=await upload.json().catch(()=>({}));if(result.name)return result.name;uploadError='ComfyUI upload returned no input filename';}
    else uploadError=`ComfyUI image upload failed (${upload.status}): ${(await upload.text().catch(()=>'' )).trim()}`;
  }catch(error){uploadError=error.message||'ComfyUI image upload failed';}

  // Some ComfyUI Desktop versions return HTTP 500 from /upload/image even
  // though their input directory is writable. LoadImage reads directly from
  // that directory, so copy the image there as a compatible fallback.
  const base=String(baseUrl).replace(/\/$/,'');
  let paths={};try{const response=await fetch(`${base}/internal/folder_paths`,{signal:AbortSignal.timeout(3000)});if(response.ok)paths=await response.json();}catch{}
  let stats={};try{const response=await fetch(`${base}/system_stats`,{signal:AbortSignal.timeout(3000)});if(response.ok)stats=await response.json();}catch{}
  const argv=stats?.system?.argv||[];
  const inputArgIndex=argv.findIndex(value=>value==='--input-directory');
  const inputArg=inputArgIndex>=0?argv[inputArgIndex+1]:argv.find(value=>String(value).startsWith('--input-directory='))?.slice('--input-directory='.length);
  const mainScript=argv.find(value=>/[/\\]main\.py$/i.test(String(value)));
  const candidates=[...(Array.isArray(paths.input)?paths.input:[paths.input]),inputArg,mainScript?path.join(path.dirname(mainScript),'input'):null].filter(value=>typeof value==='string'&&value.trim());
  const uniqueCandidates=[...new Set(candidates.map(value=>path.resolve(value)))];
  const prefix=String(filenamePrefix||'local-flow-reference').split(/[\\/]/).filter(Boolean).at(-1)||'local-flow-reference';
  const safeName=`${prefix.replace(/[^\w.-]+/g,'_')}-${randomUUID()}${path.extname(sourceName)||'.png'}`;
  const fallbackFailures=[];
  for(const folder of uniqueCandidates){
    const target=safePath(folder,safeName);let handle;
    try{
      await fs.access(folder);
      handle=await fs.open(target,'wx');await handle.writeFile(content);await handle.close();handle=null;
      return safeName;
    }catch(error){fallbackFailures.push(`${folder} (${error.code||error.message})`);try{await handle?.close();}catch{}try{await fs.unlink(target);}catch{} }
  }
  const fallbackError=uniqueCandidates.length?`ComfyUI input folder was found but could not be written: ${fallbackFailures.join('; ')}`:'ComfyUI did not expose an input folder through /internal/folder_paths or /system_stats';
  throw new Error(`${uploadError}; direct input-folder fallback failed: ${fallbackError}`);
  }finally{if(tempDir)await fs.rm(tempDir,{recursive:true,force:true}).catch(()=>{});}
}
async function submitComfyJob({baseUrl, prompt, workflow, inputImage, image, referenceImages=[], referenceAssignments=[], endFrameImage, sourceMode='storyboard', filenamePrefix='local-flow', modelPath, modelId, type, duration, resolution='720p', aspectRatio='16:9'}) {
  inputImage=inputImage||image;
  const fitAnimagineReferences=type==='Keyframe'&&modelId==='comfy-animagine-xl-4';
  const imageName=await uploadComfyInputImage(inputImage,baseUrl,filenamePrefix,fitAnimagineReferences);
  const uploadedReferences=[];
  const uploadVisualReferences=!(type==='Video clip'&&['comfy-minimax-h3','comfy-wan22-i2v'].includes(modelId)&&sourceMode!=='text');
  for(const [index,reference] of (uploadVisualReferences&&Array.isArray(referenceImages)?referenceImages.slice(0,16):[]).entries()){
    if(!reference)continue;
    const assignment=referenceAssignments[index]||{};
    const comfyInputName=reference===inputImage&&imageName&&!fitAnimagineReferences?imageName:await uploadComfyInputImage(reference,baseUrl,`${filenamePrefix}-reference-${index+1}`,fitAnimagineReferences,assignment.focusRegion);
    uploadedReferences.push({comfyInputName,assignment});
  }
  const selectedReferences=uniqueComfyReferenceSlots(uploadedReferences);
  const referenceImageNames=selectedReferences.map(row=>row.comfyInputName);
  const effectiveReferenceAssignments=selectedReferences.map(row=>row.assignment);
  const referenceBindings=selectedReferences.map(({comfyInputName,assignment},index)=>({slot:index+1,comfyInputName,assetId:String(assignment.assetId||''),assignedAssetId:String(assignment.assignedAssetId||assignment.parentAssetId||assignment.sourceAssetId||''),name:String(assignment.name||assignment.assetName||assignment.sourceAssetName||`Reference ${index+1}`).slice(0,180),role:String(assignment.roleName||assignment.role||'visual guide').slice(0,80),category:String(assignment.assetCategory||assignment.category||'').slice(0,80),scope:String(assignment.scope||'scene').slice(0,40),sourceKind:String(assignment.sourceKind||'').slice(0,60)}));
  if(modelId==='comfy-animagine-xl-4'&&!referenceImageNames.length&&imageName)referenceImageNames.push(imageName);
  const endImageName=modelId==='comfy-wan22-i2v'?null:(endFrameImage?await uploadComfyInputImage(endFrameImage,baseUrl,`${filenamePrefix}-end`):null);
  let promptGraph=workflow || null;
  let nativeVideoReferenceWorkflow=false;
  let selectedVideoImageNames=null;
  if(!promptGraph && type==='Keyframe' && modelId==='comfy-qwen-image-2-1') promptGraph=localQwenImage21Workflow(qwenReferencePrompt(prompt,effectiveReferenceAssignments,referenceImageNames.length),filenamePrefix,referenceImageNames.length,aspectRatio,1024);
  if(!promptGraph && type==='Keyframe' && modelId==='comfy-animagine-xl-4') promptGraph=localAnimagineXL4Workflow(prompt,filenamePrefix,referenceImageNames,effectiveReferenceAssignments,aspectRatio);
  if(!promptGraph && type==='Keyframe') promptGraph=localZImageWorkflow(prompt,filenamePrefix,imageName);
  if(!promptGraph && type==='Video clip'){
    if(modelId==='comfy-minimax-h3'){
      const selected=buildMiniMaxH3VideoWorkflowForSource({prompt,prefix:filenamePrefix,durationSeconds:duration,resolution,aspectRatio,sourceMode,referenceImageNames,imageName,endImageName});
      promptGraph=selected.graph;nativeVideoReferenceWorkflow=selected.nativeVideoReferenceWorkflow;selectedVideoImageNames=selected.imageInputNames;
    }else if(modelId==='comfy-wan22-i2v'){
      if(sourceMode==='text'||!imageName)throw new Error('Wan 2.2 I2V needs a generated or selected storyboard keyframe. Choose image-to-video for this model.');
      promptGraph=localWan22I2VWorkflow({prompt,imageName,prefix:filenamePrefix,durationSeconds:duration,resolution,aspectRatio});
      selectedVideoImageNames=[imageName];
    }else promptGraph=localMiniMaxH3Workflow(prompt,sourceMode==='text'?null:imageName,filenamePrefix,duration,resolution,aspectRatio,sourceMode==='text'?null:endImageName);
  }
  if(!promptGraph) throw new Error(type==='Video clip'&&sourceMode!=='text'?'Choose or generate a storyboard keyframe before creating a local video clip.':'No compatible local image model is installed. Install Z-Image-Turbo in ComfyUI or configure a workflow in Settings.');
  const graph=JSON.parse(JSON.stringify(promptGraph));
  if(modelPath){const selectedFile=path.basename(modelPath);for(const node of Object.values(graph))for(const [key,value] of Object.entries(node.inputs||{}))if(value==='$LOCAL_FLOW_MODEL')node.inputs[key]=selectedFile;}
  const nodes=Object.values(graph);
  const promptNode=nodes.find(n=>n.class_type==='CLIPTextEncode' && n.inputs?.text!==undefined);
  if(promptNode&&workflow) promptNode.inputs.text=prompt;
  if(!nativeVideoReferenceWorkflow){
    const imageNodes=nodes.filter(node=>node.class_type==='LoadImage'&&node.inputs?.image!==undefined);
    const selectedImageNames=selectedVideoImageNames??(referenceImageNames.length?referenceImageNames:(imageName?[imageName]:[]));
    if(selectedImageNames.length>imageNodes.length)throw new Error(`This ComfyUI workflow has ${imageNodes.length} image input slot${imageNodes.length===1?'':'s'}, but ${selectedImageNames.length} references were selected. Choose a workflow with enough LoadImage inputs or select fewer references.`);
    selectedImageNames.forEach((name,index)=>{if(imageNodes[index])imageNodes[index].inputs.image=name;});
    if(endImageName){const endNode=imageNodes.at(-1);if(!endNode||imageNodes.length<2)throw new Error('The selected ComfyUI video workflow needs a separate LoadImage input for its ending frame.');endNode.inputs.image=endImageName;}
  }
  const res=await fetch(`${baseUrl}/prompt`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:graph,client_id:'local-flow'})});
  const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error?.message||`ComfyUI rejected workflow (${res.status})`);
  return {promptId:data.prompt_id,workflow:graph,referenceBindings};
}
async function locateFfmpeg(config) {
  let bundled='';
  try { bundled=appFfmpegPath(); } catch {}
  const candidates=[config.ffmpegPath,process.env.FFMPEG_PATH,'ffmpeg',path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Comfy-Desktop','ComfyUI-Installs','ComfyUI','ComfyUI','.venv','Lib','site-packages','imageio_ffmpeg','binaries','ffmpeg-win-x86_64-v7.1.exe'),bundled].filter(Boolean);
  for(const candidate of candidates){try{if(candidate==='ffmpeg'){await execFileAsync(candidate,['-version'],{windowsHide:true,timeout:5000});return candidate;}await fs.access(candidate);return candidate;}catch{}}
  throw new Error('FFmpeg was not found. Reinstall Local Flow or set an existing FFmpeg executable in Settings.');
}
function appFfmpegPath(){
  if(process.resourcesPath){const packaged=path.join(process.resourcesPath,'app.asar.unpacked','node_modules','ffmpeg-static',`ffmpeg${process.platform==='win32'?'.exe':''}`);if(require('node:fs').existsSync(packaged))return packaged;}
  return require('ffmpeg-static');
}
async function dependencyStatus(config){
  const probe=async(base,route)=>{try{const r=await fetch(`${base.replace(/\/$/,'')}${route}`,{signal:AbortSignal.timeout(1300)});return r.ok;}catch{return false;}};
  const commandExists=async(command)=>{try{await execFileAsync(process.platform==='win32'?'where.exe':'which',[command],{windowsHide:true,timeout:1800});return true;}catch{return false;}};
  let ffmpeg='Bundled';try{const bin=await locateFfmpeg(config);await execFileAsync(bin,['-version'],{windowsHide:true,timeout:5000});if(path.resolve(bin)!==path.resolve(appFfmpegPath()))ffmpeg='Installed';}catch{ffmpeg='Missing';}
  const comfyUrl=config.comfyUrl||'http://127.0.0.1:8188';
  const ollamaUrl=config.ollamaUrl||'http://127.0.0.1:11434';
  const ollamaInstalledPath=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Programs','Ollama','ollama.exe');
  const [comfyRunning,ollamaRunning,ollamaCommand,pythonCommand,ttsRunning,sfxRunning,ollamaExeInstalled]=await Promise.all([
    probe(comfyUrl,'/system_stats'),probe(ollamaUrl,'/api/tags'),commandExists('ollama'),commandExists('python'),probe(config.ttsUrl||'http://127.0.0.1:8880/v1','/models'),Boolean(config.sfxUrl)&&probe(config.sfxUrl,'/health'),fs.access(ollamaInstalledPath).then(()=>true).catch(()=>false)
  ]);
  const detectedComfy=await findComfyInstall();
  const configuredComfy=Boolean(config.comfyCommand&&await fs.access(config.comfyCommand).then(()=>true).catch(()=>false));
  return [
    {id:'electron',name:'Local Flow runtime',state:'Bundled',detail:`Electron + Node.js ${process.versions.node}`},
    {id:'ffmpeg',name:'FFmpeg video tools',state:ffmpeg,detail:ffmpeg==='Bundled'?'Packaged with Local Flow':'Set an existing FFmpeg path in Settings'},
    {id:'comfyui',name:'ComfyUI image/video runtime',state:comfyRunning?'Running':comfyChild&&!comfyChild.killed?'Starting':comfyLastExit?'Failed':configuredComfy||detectedComfy?'Installed':'Not detected',detail:comfyRunning?comfyUrl:comfyChild&&!comfyChild.killed?'Starting in background; waiting for ComfyUI API':comfyLastExit|| (configuredComfy?'Configured to start with Local Flow':detectedComfy?`Detected at ${detectedComfy.cwd}`:'Install separately or select an existing launcher in Settings'),canConfigure:Boolean(detectedComfy&&!configuredComfy)},
    {id:'ollama',name:'Ollama storyboard runtime',state:ollamaRunning?'Running':ollamaCommand||ollamaExeInstalled?'Installed':'Not detected',detail:ollamaRunning?ollamaUrl:ollamaCommand||ollamaExeInstalled?'Installed on this PC; start Ollama and refresh':'Install with the official Ollama setup'},
    {id:'tts',name:'Local text-to-speech service',state:ttsRunning?'Running':'Not detected',detail:config.ttsUrl||'Configure a local OpenAI-compatible TTS endpoint'},
    {id:'sfx',name:'Local sound-generation service',state:sfxRunning?'Running':'Not configured',detail:config.sfxUrl||'Configure a local compatible sound endpoint in Settings'},
    {id:'python',name:'Python for local AI runtimes',state:pythonCommand?'Installed':'Not detected',detail:'Used by Python-based ComfyUI and audio services'}
  ];
}
async function findComfyInstall(){
  if(process.platform!=='win32')return null;
  const local=process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),home=os.homedir();
  const desktopCandidates=[path.join(local,'Programs','ComfyUI Desktop','ComfyUI Desktop.exe'),path.join(local,'Programs','ComfyUI Desktop','ComfyUI.exe'),path.join(local,'Programs','ComfyUI','ComfyUI.exe'),path.join(local,'Comfy-Desktop','ComfyUI.exe')];
  for(const command of desktopCandidates)if(await fs.access(command).then(()=>true).catch(()=>false))return{command,args:[],cwd:path.dirname(command)};
  const roots=[path.join(local,'Comfy-Desktop','ComfyUI-Installs','ComfyUI','ComfyUI'),path.join(home,'ComfyUI'),path.join(home,'ComfyUI_windows_portable','ComfyUI'),path.join(home,'ComfyUI_windows_portable')];
  for(const root of roots){
    const main=path.join(root,'main.py'),python=path.join(root,'.venv','Scripts','python.exe');
    if(await fs.access(main).then(()=>true).catch(()=>false)&&await fs.access(python).then(()=>true).catch(()=>false))return{command:python,args:[main,'--listen','127.0.0.1','--port','8188'],cwd:root};
    const embedded=path.join(root,'python_embeded','python.exe'),embeddedMain=path.join(root,'ComfyUI','main.py');
    if(await fs.access(embedded).then(()=>true).catch(()=>false)&&await fs.access(embeddedMain).then(()=>true).catch(()=>false))return{command:embedded,args:[embeddedMain,'--listen','127.0.0.1','--port','8188'],cwd:path.dirname(embeddedMain)};
    const exe=path.join(root,'ComfyUI.exe');if(await fs.access(exe).then(()=>true).catch(()=>false))return{command:exe,args:[],cwd:root};
  }
  return null;
}
async function assembleVideos({clips,destination,filename,fps=24,resolution='720p',config}) {
  if(!Array.isArray(clips)||clips.length<2||clips.length>100)throw new Error('Select between 2 and 100 video clips to merge.');
  const inputs=clips.map(item=>{const name=String(item).startsWith('/api/media/')?decodeURIComponent(String(item).slice('/api/media/'.length).split('?')[0]):path.basename(String(item));if(name!==path.basename(name)||!VIDEO_EXT.has(path.extname(name).toLowerCase()))throw new Error('Assembly accepts saved video files from the Local Flow media library.');return safePath(config.mediaFolder,name);});
  for(const file of inputs)await fs.access(file);
  const folder=path.resolve(destination||config.mediaFolder);await fs.mkdir(folder,{recursive:true});
  const safeName=path.basename(filename||`LocalFlow-film-${Date.now()}.mp4`).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');const output=safePath(folder,safeName.toLowerCase().endsWith('.mp4')?safeName:`${safeName}.mp4`);
  const ffmpeg=await locateFfmpeg(config),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'local-flow-assembly-')),manifest=path.join(tmp,'clips.txt');
  const quote=p=>path.resolve(p).replace(/\\/g,'/').replace(/'/g,"'\\''"),fpsValue=Math.max(1,Math.min(60,Number(fps)||24)),profiles={'340p':[600,340],'540p':[960,540],'720p':[1280,720],'1080p':[1920,1080]},[width,height]=profiles[resolution]||profiles['720p'];
  try{
    const normalized=[];
    for(let i=0;i<inputs.length;i++){
      const input=inputs[i],probe=await execFileAsync(ffmpeg,['-hide_banner','-i',input],{windowsHide:true,timeout:15000,maxBuffer:2*1024*1024}).catch(error=>error),hasAudio=/\bAudio:/i.test(String(probe?.stderr||'')),target=path.join(tmp,`clip-${String(i).padStart(3,'0')}.mp4`),args=['-hide_banner','-loglevel','error','-y','-i',input];
      if(!hasAudio)args.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000');
      args.push('-map','0:v:0','-map',hasAudio?'0:a:0':'1:a:0','-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fpsValue},format=yuv420p`,'-af','aresample=48000:async=1:first_pts=0,apad','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-shortest',target);
      await execFileAsync(ffmpeg,args,{windowsHide:true,timeout:1800000,maxBuffer:8*1024*1024});normalized.push(target);
    }
    await fs.writeFile(manifest,normalized.map(file=>`file '${quote(file)}'`).join('\n'),'utf8');
    await execFileAsync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',manifest,'-c','copy','-movflags','+faststart',output],{windowsHide:true,timeout:1800000,maxBuffer:8*1024*1024});
    const stat=await fs.stat(output);return {name:path.basename(output),url:`/api/media/${encodeURIComponent(path.basename(output))}`,kind:'Video',bytes:stat.size,clips:inputs.length,resolution,fps:fpsValue};
  }catch(e){await fs.rm(output,{force:true});throw new Error(`Could not assemble clips: ${e.stderr||e.message}`);}finally{await fs.rm(tmp,{recursive:true,force:true});}
}
async function renderTimeline({tracks,filename,destination,fps=24,resolution='340p',config}) {
  if(!Array.isArray(tracks)||tracks.length<1||tracks.length>120)throw new Error('Add between 1 and 120 timeline clips.');
  const ffmpeg=await locateFfmpeg(config),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'local-flow-timeline-'));
  const ordered=[...tracks].sort((a,b)=>(Number(a.start)||0)-(Number(b.start)||0));
  const args=['-hide_banner','-loglevel','error','-y'];for(const clip of ordered){const raw=String(clip.name||clip.url||'');const name=raw.startsWith('/api/media/')?decodeURIComponent(raw.slice('/api/media/'.length).split('?')[0]):raw,ext=path.extname(name).toLowerCase(),isImage=clip.kind==='Image'||IMAGE_EXT.has(ext);if(path.basename(name)!==name||!isImage&&!VIDEO_EXT.has(ext)&&!['.mp3','.wav','.m4a','.aac','.ogg','.flac','.webm'].includes(ext))throw new Error('Timeline clips must be saved image, video, or audio files.');const file=safePath(config.mediaFolder,name);await fs.access(file);if(isImage){const duration=Math.max(.1,Number(clip.duration)||5)+(Math.max(0,Number(clip.trimIn)||0));args.push('-loop','1','-framerate',String(Math.max(1,Math.min(60,Number(fps)||24))),'-t',String(duration),'-i',file);}else args.push('-i',file);}
  const video=ordered.filter(c=>c.kind==='Video'||c.kind==='Image'||VIDEO_EXT.has(path.extname(c.name||c.url||'').toLowerCase())||IMAGE_EXT.has(path.extname(c.name||c.url||'').toLowerCase()));
  if(!video.length)throw new Error('Add at least one video clip to export a film.');
  const filters=[],durationOf=c=>Math.max(.1,Number(c.duration)||5),startOf=c=>Math.max(0,Number(c.start)||0),timelineEnd=Math.max(...ordered.map(c=>startOf(c)+durationOf(c))),videoClips=ordered.map((c,i)=>({c,i})).filter(({c})=>c.kind==='Video'||c.kind==='Image'||VIDEO_EXT.has(path.extname(c.name||c.url||'').toLowerCase())||IMAGE_EXT.has(path.extname(c.name||c.url||'').toLowerCase())),profiles={'340p':[600,340],'540p':[960,540],'720p':[1280,720],'1080p':[1920,1080]},[width,height]=profiles[resolution]||profiles['340p'];
  const safeNumber=n=>Number(n.toFixed(3));filters.push(`color=c=black:s=${width}x${height}:r=${Math.max(1,Math.min(60,Number(fps)||24))}:d=${safeNumber(timelineEnd)}[base0]`);let base='base0';
  const escapeDrawtext=value=>String(value).replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/%/g,'\\%').replace(/,/g,'\\,').replace(/\[/g,'\\[').replace(/\]/g,'\\]').replace(/\r?\n/g,'\\n');
  for(let n=0;n<videoClips.length;n++){const {c,i}=videoClips[n],start=startOf(c),duration=durationOf(c),trimIn=Math.max(0,Number(c.trimIn)||0),fadeIn=Math.max(0,Math.min(duration/2,Number(c.fadeIn)||0)),fadeOut=Math.max(0,Math.min(duration/2,Number(c.fadeOut)||0)),fadeFilters=[fadeIn?`fade=t=in:st=0:d=${safeNumber(fadeIn)}:alpha=1`:'',fadeOut?`fade=t=out:st=${safeNumber(duration-fadeOut)}:d=${safeNumber(fadeOut)}:alpha=1`:'',c.caption?.trim()?`drawtext=fontfile='${process.platform==='win32'?'C\\:/Windows/Fonts/arial.ttf':'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'}':text='${escapeDrawtext(c.caption)}':fontcolor=white:fontsize=h*0.055:x=(w-text_w)/2:y=h-text_h-h*0.08:box=1:boxcolor=black@0.55:boxborderw=12`:''].filter(Boolean).join(',');const label=`v${i}`,next=`base${n+1}`;filters.push(`[${i}:v]trim=start=${trimIn}:duration=${duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuva420p${fadeFilters?`,${fadeFilters}`:''},setpts=PTS+${safeNumber(start)}/TB[${label}]`);filters.push(`[${base}][${label}]overlay=eof_action=pass:shortest=0:enable='between(t,${safeNumber(start)},${safeNumber(start+duration)})'[${next}]`);base=next;}
  filters.push(`[${base}]trim=duration=${safeNumber(timelineEnd)},setpts=PTS-STARTPTS[vout]`);
  const audios=[];for(let i=0;i<ordered.length;i++){const c=ordered[i],ext=path.extname(c.name||c.url||'').toLowerCase(),isVideo=c.kind==='Video'||VIDEO_EXT.has(ext),isImage=c.kind==='Image'||IMAGE_EXT.has(ext);if(isVideo||isImage)continue;const trimIn=Math.max(0,Number(c.trimIn)||0),duration=durationOf(c),volume=Math.max(0,Math.min(2,Number(c.volume??1))),start=startOf(c),fadeIn=Math.max(0,Math.min(duration/2,Number(c.fadeIn)||0)),fadeOut=Math.max(0,Math.min(duration/2,Number(c.fadeOut)||0)),label=`a${i}`,fadeFilters=[fadeIn?`afade=t=in:st=0:d=${safeNumber(fadeIn)}`:'',fadeOut?`afade=t=out:st=${safeNumber(duration-fadeOut)}:d=${safeNumber(fadeOut)}`:''].filter(Boolean).join(',');filters.push(`[${i}:a]atrim=start=${trimIn}:duration=${duration},asetpts=PTS-STARTPTS,volume=${volume}${fadeFilters?`,${fadeFilters}`:''},adelay=${Math.round(start*1000)}|${Math.round(start*1000)},apad=whole_dur=${safeNumber(timelineEnd)},atrim=duration=${safeNumber(timelineEnd)}[${label}]`);audios.push(`[${label}]`);}
  if(audios.length){if(audios.length===1)filters.push(`${audios[0]}anull[aout]`);else filters.push(`${audios.join('')}amix=inputs=${audios.length}:duration=longest:normalize=0,atrim=duration=${safeNumber(timelineEnd)}[aout]`);}
  const outputRoot=path.resolve(destination||config.mediaFolder),output=safePath(outputRoot,path.basename(filename||`LocalFlow-Edit-${Date.now()}.mp4`));try{await fs.mkdir(outputRoot,{recursive:true});args.push('-filter_complex',filters.join(';'),'-map','[vout]');if(audios.length)args.push('-map','[aout]');args.push('-r',String(Math.max(1,Math.min(60,Number(fps)||24))),'-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p');if(audios.length)args.push('-c:a','aac','-b:a','192k');args.push('-movflags','+faststart',output);await execFileAsync(ffmpeg,args,{windowsHide:true,timeout:1800000,maxBuffer:8*1024*1024});const stat=await fs.stat(output),inMedia=outputRoot.toLowerCase()===path.resolve(config.mediaFolder).toLowerCase();return{name:path.basename(output),path:output,url:inMedia?`/api/media/${encodeURIComponent(path.basename(output))}`:null,kind:'Video',bytes:stat.size};}catch(e){await fs.rm(output,{force:true});throw new Error(`Could not export timeline: ${e.stderr||e.message}`);}finally{await fs.rm(tmp,{recursive:true,force:true});}
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return response(res, 204, {});
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/health') return response(res, 200, { ok: true, version: APP_VERSION, serverBuild: SERVER_BUILD, config: await getConfig(), scan: scanState });
      if (url.pathname === '/api/comfy/queue' && req.method === 'GET') { const config=await getConfig(),base=(config.comfyUrl||'http://127.0.0.1:8188').replace(/\/$/,'');try{const upstream=await fetch(`${base}/queue`,{signal:AbortSignal.timeout(5000)});if(!upstream.ok)throw new Error(`ComfyUI queue request failed (${upstream.status})`);return response(res,200,{connected:true,items:normalizeComfyQueue(await upstream.json())});}catch(error){return response(res,200,{connected:false,items:[],error:error.message});} }
      if (url.pathname === '/api/dependencies' && req.method === 'GET') return response(res,200,{dependencies:await dependencyStatus(await getConfig()),installs:[...dependencyInstalls.values()]});
      if (url.pathname === '/api/dependencies/comfy/configure' && req.method === 'POST') {const found=await findComfyInstall();if(!found)return response(res,404,{error:'No supported ComfyUI installation was found in the usual Windows folders. Set its executable path manually in Settings.'});const config=await getConfig();Object.assign(config,{comfyCommand:found.command,comfyArgs:found.args,comfyCwd:found.cwd,comfyAutoStart:true});await writeJson(paths.config,config);return response(res,200,{configured:true,command:found.command,cwd:found.cwd});}
      if (url.pathname === '/api/dependencies/ollama/install' && req.method === 'POST') {
        if(process.platform!=='win32')return response(res,400,{error:'One-click Ollama installation is currently available on Windows only.'});
        const existing=[...dependencyInstalls.values()].find(x=>x.id==='ollama'&&x.state==='Installing');if(existing)return response(res,202,existing);
        const id=randomUUID(),job={id,dependency:'ollama',state:'Installing',message:'Starting Ollama installation with winget'};dependencyInstalls.set(id,job);
        const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command','irm https://ollama.com/install.ps1 | iex'],{windowsHide:true,stdio:'ignore'});
        child.on('error',e=>{job.state='Failed';job.message=e.message;});child.on('exit',code=>{job.state=code===0?'Complete':'Failed';job.message=code===0?'Ollama installed. Restart it if it did not start automatically.':`winget exited with code ${code}`;});
        return response(res,202,job);
      }
      if (url.pathname === '/api/generate/cancel' && req.method === 'POST') {
        const {baseUrl='http://127.0.0.1:8188',promptId}=await bodyJson(req);
        if(!isLoopbackUrl(baseUrl))return response(res,400,{error:'ComfyUI must run on this machine'});
        if(!/^[\w-]{1,100}$/.test(String(promptId||'')))return response(res,400,{error:'Invalid ComfyUI job id'});
        const base=baseUrl.replace(/\/$/,''),readQueue=async()=>{const result=await fetch(`${base}/queue`,{signal:AbortSignal.timeout(5000)});if(!result.ok)throw new Error(`ComfyUI queue check failed (${result.status})`);return result.json();},hasId=row=>Array.isArray(row)?row[1]===promptId:row?.prompt_id===promptId||row?.promptId===promptId;
        let queue=await readQueue();
        if((queue.queue_running||[]).some(hasId))return response(res,409,{error:'This generation has started running and cannot be cancelled from Local Flow.'});
        if(!(queue.queue_pending||[]).some(hasId))return response(res,409,{error:'This generation is no longer waiting in the ComfyUI queue.'});
        const removed=await fetch(`${base}/queue`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({delete:[promptId]}),signal:AbortSignal.timeout(5000)});
        if(!removed.ok)return response(res,502,{error:`ComfyUI could not cancel the queued job (${removed.status})`});
        queue=await readQueue();
        if((queue.queue_running||[]).some(hasId))return response(res,409,{error:'This generation started while cancellation was requested; it is still running.'});
        if((queue.queue_pending||[]).some(hasId))return response(res,502,{error:'ComfyUI still reports this generation as queued.'});
        const history=await fetch(`${base}/history/${encodeURIComponent(promptId)}`,{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():{}).catch(()=>({}));
        if(history[promptId])return response(res,409,{error:'This generation completed before cancellation took effect.'});
        const jobs=await readJson(path.join(DATA,'jobs.json'),[]),job=jobs.find(item=>item.id===promptId);
        if(job){job.state='Cancelled';job.error='Cancelled before ComfyUI started the generation.';job.cancelledAt=new Date().toISOString();await writeJson(path.join(DATA,'jobs.json'),jobs);}
        return response(res,200,{cancelled:true,promptId});
      }
      if (url.pathname.startsWith('/api/dependencies/installs/') && req.method === 'GET') {const job=dependencyInstalls.get(url.pathname.split('/').at(-1));return job?response(res,200,job):response(res,404,{error:'Install job not found'});}
      if (url.pathname === '/api/dependencies/start' && req.method === 'POST') { const {service,force=false}=await bodyJson(req);if(service==='comfyui'){try{const result=await startComfyIfConfigured(Boolean(force));const config=await getConfig();return response(res,result.started?202:200,{service,state:result.started?'Starting':result.reason==='Already running'?'Running':'Failed',detail:result.reason,logFile:result.logFile,comfyUrl:config.comfyUrl});}catch(e){comfyLastExit=e.message;return response(res,400,{error:e.message});}}if(service==='ollama'){const config=await getConfig(),base=config.ollamaUrl||'http://127.0.0.1:11434';try{const r=await fetch(`${base.replace(/\/$/,'')}/api/tags`,{signal:AbortSignal.timeout(1500)});if(r.ok)return response(res,200,{service,state:'Running',detail:base});}catch{};const command=config.ollamaCommand||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Programs','Ollama','ollama.exe');try{await fs.access(command);const child=spawn(command,config.ollamaArgs?.length?config.ollamaArgs:['serve'],{windowsHide:true,stdio:'ignore',detached:true});child.unref();return response(res,202,{service,state:'Starting',detail:'Ollama is starting in the background'});}catch(e){return response(res,400,{error:`Could not start Ollama: ${e.message}`});}}return response(res,400,{error:`Unsupported local service: ${service||'(missing)'}`}); }
      if (url.pathname === '/api/launcher/start' && req.method === 'POST') { try{const result=await startComfyIfConfigured();return response(res,200,{...result,comfyUrl:(await getConfig()).comfyUrl});}catch(e){return response(res,400,{error:e.message});} }
      if (url.pathname === '/api/runner/check' && req.method === 'POST') { const {baseUrl='http://127.0.0.1:8188'}=await bodyJson(req); try{const r=await fetch(`${baseUrl.replace(/\/$/,'')}/system_stats`,{signal:AbortSignal.timeout(3500)});return response(res,r.ok?200:502,{connected:r.ok,status:r.status,stats:r.ok?await r.json():null});}catch(e){return response(res,502,{connected:false,error:e.message});} }
      if (url.pathname === '/api/ollama/models' && req.method === 'GET') { const base=(url.searchParams.get('url')||'http://127.0.0.1:11434').replace(/\/$/,'');if(!isLoopbackUrl(base))return response(res,400,{error:'Ollama must run on this machine',models:[]});try{const r=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(3500)});const d=await r.json();return response(res,r.ok?200:502,{models:d.models||[]});}catch(e){return response(res,502,{error:e.message,models:[]});} }
      if (url.pathname === '/api/ollama/pull' && req.method === 'POST') { const {model,baseUrl='http://127.0.0.1:11434'}=await bodyJson(req);if(!isLoopbackUrl(baseUrl))return response(res,400,{error:'Ollama must run on this machine'});if(!model||model.includes('..')||!/^[\w./:-]{1,160}$/.test(model))return response(res,400,{error:'Enter a valid Ollama model name, such as qwen2.5:7b'});const id=randomUUID();const job={id,model,state:'Downloading',status:'Starting download',completed:0,total:0,error:null};ollamaPulls.set(id,job);(async()=>{try{const r=await fetch(`${baseUrl.replace(/\/$/,'')}/api/pull`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:model,stream:true})});if(!r.ok)throw new Error(`Ollama pull failed (${r.status})`);if(!r.body)throw new Error('Ollama returned no download stream');const reader=r.body.getReader();let buffer='';let pullSucceeded=false;while(true){const {done,value}=await reader.read();if(done)break;buffer+=new TextDecoder().decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const item=JSON.parse(line);if(item.error)throw new Error(item.error);job.status=item.status||job.status;job.completed=item.completed||job.completed;job.total=item.total||job.total;if(item.status==='success'){pullSucceeded=true;job.state='Complete';job.status='Model ready';}}}if(buffer.trim()){const item=JSON.parse(buffer);if(item.error)throw new Error(item.error);job.status=item.status||job.status;job.completed=item.completed||job.completed;job.total=item.total||job.total;if(item.status==='success')pullSucceeded=true;}if(!pullSucceeded)throw new Error('Ollama stream ended before the model was ready');job.state='Complete';job.status='Model ready';}catch(e){job.state='Failed';job.status=e.message;job.error=e.message;}})();return response(res,202,{id,model,state:job.state}); }
      if (url.pathname.startsWith('/api/ollama/pulls/') && req.method === 'GET') { const id=url.pathname.slice('/api/ollama/pulls/'.length);const job=ollamaPulls.get(id);return job?response(res,200,job):response(res,404,{error:'Ollama download not found'}); }
      if (url.pathname === '/api/prompt/enhance' && req.method === 'POST') {
        const {baseUrl='http://127.0.0.1:11434',model,prompt,description='',title='',imageModel='',maxReferences=1,visualBible={},continuityAssets=[],references=[]}=await bodyJson(req);
        if(!model||!prompt?.trim())return response(res,400,{error:'Choose a local Ollama model and provide an image prompt'});
        if(!isLoopbackUrl(baseUrl))return response(res,400,{error:'Ollama must run on this machine'});
        const bible=typeof visualBible==='string'?visualBible:Object.entries(visualBible||{}).map(([key,value])=>`${key}: ${typeof value==='string'?value:JSON.stringify(value)}`).join('\n');
        const assetNotes=(continuityAssets||[]).map(asset=>`- ${asset.name||asset.category||'Asset'} [${asset.category||'design'}]: ${asset.description||''}${asset.designExpansion?` | approved visual-design proposals for imagery: ${asset.designExpansion}`:''}${asset.visualStyle?` | rendering: ${asset.visualStyle}`:''}`).join('\n');
        const referenceNotes=(references||[]).slice(0,Math.max(1,Number(maxReferences)||1)).map((ref,index)=>`- Reference slot ${ref.slot||index+1}: ROLE=${ref.roleName||ref.role||'visual guide'}; SUBJECT=${ref.assetName||ref.name||'unnamed asset'}; CATEGORY=${ref.assetCategory||'unspecified'}. Fixed details: ${ref.assetDescription||'none supplied'}. Visual observations: ${ref.referenceObservations||'none supplied'}.`).join('\n');
        const creatorSceneContext=[title,description,prompt].filter(Boolean).join('\n');
        const instruction=`You are a production prompt editor for a storyboard image model. Expand the prompt into a concrete, image-model-ready description for ONE finished cinematic frame. Return only the final prompt, with no preface, markdown, analysis, or questions.

HARD CANON RULES:
- The creator's scene action and facts are authoritative. Preserve them exactly; do not invent plot events, characters, relationships, dialogue, props, locations, or costume changes.
- Do not invent or name a specific location, background, environment, prop, character, or story object that is absent from the creator prompt, scene notes, visual bible, or approved continuity assets. If the creator names only a broad setting, preserve it at that same level without inventing a sub-location. If no setting is named anywhere, use a restrained neutral backdrop without adding story objects. Do not infer where a weapon or other prop is carried or stored; show only what the creator's action requires.
- Character identity, asset appearance, uniforms, and style must follow the supplied continuity details. Never swap identities or merge characters.
- Preserve every setting or environment the creator names. Keep broad settings broad: if the creator says only "spacecraft setting", do not replace it with an empty background and do not invent a ship interior, exterior, bridge, cockpit, corridor, hangar, or other specific ship location.
- Never replace a creator-specified environment with a neutral backdrop or empty background. Use a neutral backdrop only when no environment or setting is named anywhere in the creator's scene prompt, title, or notes.
- For each approved asset, use its stable details and visual-design proposals as explicit visual guidance when relevant. These proposals may add image-design detail but never add story actions or change named traits.
- Reference images are already supplied separately to the image model. Use the named reference-slot map below to state which visual traits belong to which subject. Do not tell the image model to find, load, or use a file by filename, and do not use literal image tokens.
- A reference is a visual guide for its assigned role only. Never copy a reference sheet, layout, pose, framing, or unrelated content. Create the new scene action and composition described by the creator.
- If an asset is not assigned or its identity is unclear, do not guess. Keep it out of the prompt or describe it generically as the creator did.

Improve only useful visual direction: Add camera, composition, lighting, palette, and rendering detail, plus pose, depth, and cinematic framing where useful. Do not fill unspecified story-world details with invented content. Add visual detail only for camera, composition, lighting, palette, rendering, and the physical action explicitly named by the creator. Do not merely repeat or lightly reword the creator prompt: add several concrete visual decisions for details the creator left open, while retaining the source scene action and important named details. Keep the result concise enough for a diffusion model and avoid contradictory adjectives, repeated prose, and prompt-engineering chatter. Include a short negative constraint only when it prevents a likely failure (extra people, duplicate bodies, collage, text).

Scene: ${String(title)}
Scene notes: ${String(description)}
Image model: ${String(imageModel)} (up to ${Math.max(1,Number(maxReferences)||1)} visual reference slots)
Series visual bible:\n${String(bible||'No additional series bible supplied.')}
Approved continuity assets:\n${String(assetNotes||'No named continuity assets supplied.')}
Reference slot assignments:\n${String(referenceNotes||'No visual references assigned.')}
Creator image prompt (preserve its meaning):\n${String(prompt)}`;
        const requestEnhancement=async(promptText)=>{const result=await fetch(baseUrl.replace(/\/$/, '')+'/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,prompt:promptText,stream:false,options:{temperature:0.2}})});const data=await result.json();if(!result.ok)throw new Error(data.error||'Ollama prompt enhancement failed');return String(data.response||'').trim().replace(/^```(?:\w+)?\s*|\s*```$/g,'');};
        let enhanced=await requestEnhancement(instruction);
        if(!isMeaningfullyEnhancedPrompt(prompt,enhanced)||!isFaithfulEnhancedSetting(creatorSceneContext,enhanced)){
          enhanced=await requestEnhancement(`${instruction}\n\nRETRY: Your previous response either repeated/dropped the creator prompt or changed the stated setting. Preserve the same scene action and all named subjects and settings. Keep broad settings at the same level of detail: a spacecraft setting stays a generic spacecraft setting unless the creator names a ship interior, exterior, bridge, cockpit, corridor, hangar, or other sub-location. Never replace a named environment with a gradient. Add concrete camera, composition, pose, and lighting detail without inventing story facts. Previous attempt to avoid repeating: ${enhanced.slice(0,5000)}`);
        }
        const fallback=!isMeaningfullyEnhancedPrompt(prompt,enhanced)||!isFaithfulEnhancedSetting(creatorSceneContext,enhanced);
        if(fallback)enhanced=buildSafeEnhancedPrompt({prompt,visualBible});
        if(!enhanced)return response(res,400,{error:'Add an image prompt before using Enhance.'});
        const referenceBlock=enhancedReferenceAssignmentBlock(references,maxReferences);
        return response(res,200,{prompt:referenceBlock?`${enhanced}\n\n${referenceBlock}`:enhanced,fallback});
      }
      if (url.pathname === '/api/creative/chat' && req.method === 'POST') {
        const {baseUrl='http://127.0.0.1:11434',model,messages=[],shotCount=8,style='anime cinematic',assets=[],activeDesign=null,storyboardProposal=null,creatorCanon:providedCreatorCanon='' }=await bodyJson(req);
        if(!model||!Array.isArray(messages)||!messages.some(item=>item.role==='user'))return response(res,400,{error:'Choose a local language model and start the conversation with your story idea.'});
        if(!isLoopbackUrl(baseUrl))return response(res,400,{error:'Story Chat only connects to a local Ollama service.'});
        const prior=(messages||[]).filter(item=>['user','assistant'].includes(item.role)&&typeof item.content==='string').slice(-20).map(item=>({role:item.role,content:item.content.slice(0,12000)}));
        const creatorCanon=providedCreatorCanon||buildCreatorCanonContext(messages);
        const system=buildCreativeChatSystem({shotCount,style,assets,activeDesign,storyboardProposal,creatorCanon});
        try{
          const upstream=await fetch(baseUrl.replace(/\/$/,'')+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},...prior],stream:true,options:{temperature:0.2}}),signal:AbortSignal.timeout(600000)});
          if(!upstream.ok){const detail=await upstream.text();return response(res,502,{error:'Ollama Story Chat failed: '+detail.slice(0,500)});}
          if(!upstream.body)return response(res,502,{error:'Ollama returned no response stream.'});
          res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive','access-control-allow-origin':'*'});
          const reader=upstream.body.getReader(),decoder=new TextDecoder();let buffer='',assistantText='';
          while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const rows=buffer.split('\n');buffer=rows.pop()||'';for(const row of rows){if(!row.trim())continue;let item;try{item=JSON.parse(row);}catch{continue;}if(item.error)throw new Error(item.error);const token=String(item.message?.content||'');if(token){assistantText+=token;res.write('data: '+JSON.stringify({token})+'\n\n');}if(item.done){const last=prior.at(-1),before=prior.at(-2),approved=last?.role==='user'&&isExplicitStoryApproval(last.content)&&before?.role==='assistant'&&isDesignPreparationQuestion(before.content);if(approved&&!assistantText.includes('[[LOCALFLOW_STORYBOARD_READY]]'))res.write('data: '+JSON.stringify({token:'\n\n[[LOCALFLOW_STORYBOARD_READY]]'})+'\n\n');}}
            if(done)break;}
          const originalAssistantText=assistantText;assistantText=normalizeCreativeReply(assistantText);if(assistantText!==originalAssistantText)res.write('event: replace\ndata: '+JSON.stringify({content:assistantText})+'\n\n');
          const choices=creativeChatOptionChoices(assistantText);
          if(choices.length)res.write('event: choices\ndata: '+JSON.stringify({choices})+'\n\n');
          res.end();
        }catch(error){if(!res.headersSent)return response(res,502,{error:error.message});if(!res.writableEnded){res.write('event: error\ndata: '+JSON.stringify({error:error.message})+'\n\n');res.end();}}
        return;
      }
      if (url.pathname === '/api/visual-development/plan' && req.method === 'POST') {
        const {baseUrl='http://127.0.0.1:11434',model,brief,creatorMessages=[],creatorCanon='',style='anime cinematic',assets=[]}=await bodyJson(req);
        if(!model||!brief?.trim())return response(res,400,{error:'Chat through and approve the story direction before preparing its visual asset plan.'});
        if(!isLoopbackUrl(baseUrl))return response(res,400,{error:'Visual development only connects to a local Ollama service.'});
        const prompt='Create a visual-development plan from this collaborative story conversation. Return JSON only with this shape: {"title":"","concept":{"premise":"","uniqueHook":"","genreAndTone":"","protagonist":"","goal":"","conflictAndStakes":"","setting":"","arcAndEnding":""},"visualBible":{"characters":"","setting":"","style":"","continuity":""},"assets":[{"name":"","category":"Character|Wardrobe|Vehicle|Location|Prop|Style","brief":"","aliases":"","visualStyle":"","relatedAssets":[],"neededFor":""}]}.\n\nThe brief below contains only creator-authored turns. Assistant proposals that the creator did not accept are excluded. Treat these creator statements as the sole story canon; only a later creator statement may clearly change earlier canon. Preserve the creator’s exact names, plot facts, design constraints, tone, and preferences. Do not add plot, characters, locations, or visual details just because they are conventional. If an essential field is not specified, leave it concise/blank or mark it as an unconfirmed proposal. Propose only the reusable assets needed to represent approved story content: distinct characters, shared uniforms, important vehicles, locations, props, and series art direction. Do not create scenes or storyboard panels here. Keep each asset brief focused on stable identity/design details, not one scene’s action. Add asset links only when the conversation establishes them. The style preference is: '+String(style)+'. Existing image reference descriptions may guide what the creator means, but cannot override their text: '+JSON.stringify(assets).slice(0,14000)+'\n\nAUTHORITATIVE CREATOR CANON:\n'+String(creatorCanon).slice(0,12000)+'\n\nConversation:\n'+String(brief).slice(0,28000);
        try{let result=await ollamaJson(baseUrl,model,prompt);if(!result||!Array.isArray(result.assets))throw new Error('The model did not return a visual asset list.');let canonConflicts=findVisualPlanCanonConflicts(result,creatorMessages);if(canonConflicts.length){const repairPrompt=prompt+'\\n\\nCANON VALIDATION FAILED. Your previous JSON contradicted these explicit creator constraints: '+canonConflicts.join(' ')+' Return a corrected complete JSON plan. Do not describe the transformation as impossible or the love as mutual unless the creator explicitly changes those constraints.';result=await ollamaJson(baseUrl,model,repairPrompt);if(!result||!Array.isArray(result.assets))throw new Error('The model did not return a visual asset list.');canonConflicts=findVisualPlanCanonConflicts(result,creatorMessages);if(canonConflicts.length)throw new Error('The story plan conflicts with creator-approved canon and was not accepted: '+canonConflicts.join(' '));}result.title=String(result.title||'Untitled story');result.concept=result.concept&&typeof result.concept==='object'?result.concept:{};const displayText=value=>{if(value==null)return '';if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);if(Array.isArray(value))return value.map(displayText).filter(Boolean).join('\n');if(typeof value==='object')return Object.entries(value).map(([key,item])=>{const text=displayText(item);return text?key+': '+text:''}).filter(Boolean).join('\n');return '';};result.visualBible=Object.fromEntries(Object.entries({...result.concept,...(result.visualBible&&typeof result.visualBible==='object'?result.visualBible:{style:String(style)})}).map(([key,value])=>[key,displayText(value)]));result.assets=result.assets.slice(0,24).map((asset,index)=>({...asset,id:String(asset.id||'plan-asset-'+(index+1)),name:displayText(asset.name)||'Design '+(index+1),category:displayText(asset.category)||'Character',brief:displayText(asset.brief||asset.description),description:displayText(asset.description||asset.brief),visualStyle:displayText(asset.visualStyle)||displayText(result.visualBible.style)||style}));return response(res,200,result);}catch(error){return response(res,502,{error:error.message});}
      }
      if (url.pathname === '/api/assets/develop' && req.method === 'POST') {
        const input=await bodyJson(req),{baseUrl='http://127.0.0.1:11434',model,name='Visual asset',category='Other',aliases='',description='',visualStyle='',references=[],projectName='',projectStyle='',projectContext='',creatorCanon=''}=input;
        if(!model)return response(res,400,{error:'Choose a local Ollama model before developing visual details.'});
        if(!isLoopbackUrl(baseUrl))return response(res,400,{error:'Visual asset development only connects to a local Ollama service.'});
        if(!Array.isArray(references))return response(res,400,{error:'References must be a list of image references.'});
        try{
          const usable=references.slice(0,16).map((row,index)=>({row,index})).filter(({row})=>row&&typeof row==='object'&&(row.imageUrl||row.url));
          const images=[],imageReferenceIndices=[];
          for(const [referenceIndex,{row}] of usable.entries()){const dataUrl=await localImageData(row.imageUrl||row.url);if(dataUrl){const match=/^data:image\/[\w.+-]+;base64,(.+)$/.exec(dataUrl);if(match){images.push(match[1]);imageReferenceIndices.push(referenceIndex);}}}
          const refs=usable.map(({row},index)=>({slot:index+1,name:String(row.name||`Reference ${index+1}`),role:String(row.role||row.referenceRole||'visual guide'),owner:String(row.ownerName||''),description:String(row.description||''),visualStyle:String(row.visualStyle||'')}));
          const focusGuidance='Also add focusRegion and focusConfidence to every referenceAnalysis entry. For concrete subject/item roles (character, vehicle, location, prop, wardrobe), use vision to locate the assigned subject and return focusRegion as a generous bounding box in normalized 0..1000 coordinates {"x":0,"y":0,"width":0,"height":0}, framing that subject with small margins while excluding labels, face insets, unrelated sheet panels, and other subjects where possible. Return null and confidence 0 for broad style, palette, or composition guides, or if no reliable crop exists. These boxes crop the actual image sent to the image adapter, so identify the assigned subject rather than the whole sheet.';
          const prompt='Develop reusable visual-design details for one story asset. Return JSON only with this shape: {"fixedVisualDetails":"","designExpansion":"","visualStyle":"","referenceAnalysis":[{"name":"","role":"","observations":"","focusRegion":null,"focusConfidence":0.0}]}.\n\nCreator-provided identity, stated appearance, approved story facts, and project-bible constraints are fixed canon. fixedVisualDetails must repeat only those supplied facts, without adding new visual claims. designExpansion is separate, proposed visual direction that fills only details the creator has left unspecified. Never alter, reinterpret, embellish, or suggest alternatives to any stated trait: preserve exact age, face, eye and hair colors, build, scars, clothing, palette, medium, and any other named detail. In particular, do not infer new hues from palette names or recolor eyes, hair, skin, costume, or insignia. For designExpansion, proactively fill all visually important details the creator left unspecified, using 4–8 specific production-ready proposals. For a character, this may include facial features, hair shape, build, silhouette, expression, costume cut, palette accents, materials, insignia placement, accessories, and neutral pose; for vehicles, locations, and props, propose their defining silhouette, forms, materials, markings, palette, and lighting. Keep proposals compatible with canon and project art direction, editable rather than canon. Suggestions must fit the stated role and style. Avoid hedging words (could/might/maybe), plot claims, new identity marks, or repeated description. Keep action separate from stable traits. Analyze every supplied reference only for its assigned role; it guides the design, not the composition or pose of the future image. '+
            'Asset name: '+String(name).slice(0,240)+'\nCategory: '+String(category).slice(0,100)+'\nAliases: '+String(aliases).slice(0,500)+'\nCreator description / canon: '+String(description).slice(0,5000)+'\nRequested asset style: '+String(visualStyle).slice(0,1500)+'\nProject: '+String(projectName).slice(0,200)+'\nApproved project style: '+String(projectStyle).slice(0,1200)+'\nProject visual bible: '+String(projectContext).slice(0,5000)+'\nAuthoritative creator canon:\n'+String(creatorCanon).slice(0,12000)+'\nReference assignments: '+JSON.stringify(refs).slice(0,9000)+'\n\nReturn fixedVisualDetails as a compact paragraph repeating only the creator-supplied canon. In designExpansion, return a cohesive, concrete visual expansion that fills important unspecified design gaps; phrase every invented detail as an editable proposal, not canon. Do not mention or modify stated properties. If an attribute was supplied, it is not an open gap. Keep visualStyle aligned with project direction. referenceAnalysis must include one concise observations entry per supplied reference, retaining its assigned role.';
          const message={role:'user',content:focusGuidance+'\n\n'+prompt};if(images.length)message.images=images;
          const upstream=await fetch(baseUrl.replace(/\/$/,'')+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'You are a visual development assistant. Exact creator canon has priority over stylistic inference. Never change a specified detail. Separate verbatim canon from editable proposals that fill only omitted visual details. Never infer colors for specified features. Analyze attached images only according to the assigned roles. Return valid JSON only, no markdown.'},message],stream:false,format:'json',options:{temperature:0.45}}),signal:AbortSignal.timeout(600000)});
          const data=await upstream.json().catch(()=>({}));if(!upstream.ok)throw new Error(data.error||`Ollama visual development failed (${upstream.status})`);
          const raw=String(data.message?.content||'').trim();let result;try{result=JSON.parse(raw);}catch{const match=raw.match(/\{[\s\S]*\}/);if(match)try{result=JSON.parse(match[0]);}catch{}}
          if(!result||typeof result!=='object')throw new Error('The local language model returned invalid visual-design details.');
          const referenceAnalysis=refs.map((reference,index)=>{const row=Array.isArray(result.referenceAnalysis)?result.referenceAnalysis[index]||{}:{};return {name:String(row.name||reference.name||`Reference ${index+1}`),role:String(row.role||reference.role||'visual guide'),observations:String(row.observations||''),focusRegion:normalizeVisionFocusRegion(row.focusRegion,row.focusConfidence,reference.role)};});
          const cropRoles=new Set(['character','vehicle','location','prop','wardrobe']);
          const cropIndexes=refs.map((row,index)=>({row,index,imageIndex:imageReferenceIndices.indexOf(index)})).filter(entry=>cropRoles.has(entry.row.role.toLowerCase())&&entry.imageIndex>=0&&!referenceAnalysis[entry.index]?.focusRegion);
          for(let start=0;start<cropIndexes.length;start+=4){
            const group=cropIndexes.slice(start,start+4);
            try{
              const cropTargets=group.map((entry,index)=>{const role=entry.row.role.toLowerCase(),name=entry.row.name,details=entry.row.description||'';if(role==='character')return `Image ${index+1}: Inspect this anime character sheet for ${name} (${details}). Identify the main FRONT-FACING full-body drawing of this named person in the center views; do not select the large portrait on the left, any face inset, or side/back view. Bound only that single figure from top of hair through soles of boots, with about 3% margin. Exclude every neighboring view, portrait, label, and detail panel.`;if(role==='vehicle')return `Image ${index+1}: Inspect the vehicle reference for ${name} (${details}). Bound one complete, large view of the craft only; exclude blueprint thumbnails, labels, and sheet panels.`;return `Image ${index+1}: Inspect the ${role} reference for ${name} (${details}). Bound the main relevant subject only and exclude unrelated panels and labels.`;});
              const cropPrompt='Return one bounding box for each attached image in the same order. Output JSON only: {"regions":[{"x":0,"y":0,"width":0,"height":0,"confidence":0.0}]}. Each box uses normalized integer 0..1000 top-left x/y and width/height. Do not return a generic center crop or half-sheet. If no confident subject-specific crop is possible, return confidence 0.\n'+cropTargets.join('\n');
              const cropMessage={role:'user',content:cropPrompt,images:group.map(entry=>images[entry.imageIndex])};
              const cropResponse=await fetch(baseUrl.replace(/\/$/,'')+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'You are an image-region locator. Return accurate normalized bounding boxes for the assigned subjects only. Never return the entire sheet when a subject can be isolated. Output valid JSON only.'},cropMessage],stream:false,format:'json',options:{temperature:0.1}}),signal:AbortSignal.timeout(180000)});
              if(!cropResponse.ok)continue;
              const cropData=await cropResponse.json().catch(()=>({}));let cropResult;try{cropResult=JSON.parse(String(cropData.message?.content||''));}catch{cropResult=null;}
              const regions=Array.isArray(cropResult?.regions)?cropResult.regions:[];
              for(const [groupIndex,entry] of group.entries()){
                const box=regions.find(region=>Number(region?.slot)===groupIndex+1)||regions[groupIndex];
                const focusRegion=normalizeVisionFocusRegion(box,box?.confidence,entry.row.role);
                if(focusRegion)referenceAnalysis[entry.index].focusRegion=focusRegion;
              }
            }catch{}
          }
           return response(res,200,{fixedVisualDetails:String(result.fixedVisualDetails||description||''),designExpansion:String(result.designExpansion||''),visualStyle:String(result.visualStyle||visualStyle||projectStyle||''),referenceAnalysis,referenceVisionUsed:images.length>0,referenceCount:refs.length,imagesAnalyzed:images.length});
        }catch(error){return response(res,502,{error:error.message});}
      }
      if (url.pathname === '/api/storyboard/stream' && req.method === 'POST') {
        const {baseUrl='http://127.0.0.1:11434',model,brief,shotCount=8,style='anime cinematic',targetDurationSeconds=90,assets=[],revisionSceneIndex=null,creatorInstruction='',creatorCanon='',existingScenes=[],storyboardTitle='',visualBible=null}=await bodyJson(req);
        if(!model||!brief?.trim())return response(res,400,{error:'A story plan is required to revise scenes.'});if(!isLoopbackUrl(baseUrl))return response(res,400,{error:'Storyboard generation only connects to local Ollama.'});
        const count=Math.max(1,Math.min(40,Number(shotCount)||8));const prompt='Return JSON only: {"title":"","visualBible":{"style":""},"scenes":[{"title":"","description":"","prompt":"","duration":"4s","assetNames":[]}]}\nCreate exactly '+count+' sequential anime cinematic storyboard scenes. Follow the creator canon in the brief exactly. Never substitute or contradict approved details; do not add new plot events or characters. Each scene shows one clear moment in the agreed story. Keep visual identity, costume, ship/location design and art direction consistent; image prompts should describe only the requested action and composition, plus approved stable visual facts. For every scene, set assetNames to an array containing only the exact canonical name values from the reusable asset list that are visibly present or directly relevant to that scene; use an empty array when none apply. Never invent, paraphrase, or alias these names in assetNames. Keep character, uniform, vehicle, location, and prop assignments distinct. Use the provided reusable assets where relevant. Do not treat reference images as the scene composition. Requested style: '+String(style)+'.\nAssets: '+JSON.stringify(assets).slice(0,14000)+'\nBrief and approved revisions:\n'+String(brief).slice(0,28000);
        try{let storyboard;if(Number.isInteger(revisionSceneIndex)){if(!Array.isArray(existingScenes)||existingScenes.length!==count)throw new Error('The requested scene revision does not match the current storyboard.');const currentScene=existingScenes[revisionSceneIndex];if(!currentScene)throw new Error('The requested scene revision does not match the current storyboard.');const scenePrompt='Return JSON only in this format: {"scene":{"description":"","prompt":"","duration":"4s","assetNames":[]}}. Revise only scene '+(revisionSceneIndex+1)+' of the existing storyboard. Keep its current title and preserve every other scene unchanged. Apply only the creator\'s explicit requested edit; retain all other story canon and setting details. Do not invent new locations, characters, events, or changes to the ending. The prompt must depict the same scene action with only the requested adjustment. Use only canonical asset names from the provided list.\nCurrent scene: '+JSON.stringify(currentScene)+'\nCreator instruction: '+String(creatorInstruction||brief).slice(0,3000)+'\nAuthoritative creator canon:\n'+String(creatorCanon).slice(0,12000)+'\nArt style: '+String(style)+'\nApproved assets: '+JSON.stringify(assets).slice(0,8000);const revised=await ollamaJson(baseUrl,model,scenePrompt,{numPredict:1800});storyboard={title:storyboardTitle,visualBible,scenes:mergeStoryboardSceneRevision(existingScenes,revisionSceneIndex,revised.scene)};}else{storyboard=await ollamaJson(baseUrl,model,prompt);if(!Array.isArray(storyboard.scenes))throw new Error('The model did not return storyboard scenes.');storyboard.scenes=storyboard.scenes.slice(0,count);storyboard.scenes=allocateStoryboardRevisionDurations(storyboard.scenes,targetDurationSeconds);}res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache','connection':'keep-alive','access-control-allow-origin':'*'});for(const scene of storyboard.scenes)res.write('event: scene\ndata: '+JSON.stringify({scene})+'\n\n');res.write('event: done\ndata: '+JSON.stringify({storyboard})+'\n\n');res.end();}catch(error){if(res.headersSent){res.write('event: error\ndata: '+JSON.stringify({error:error.message})+'\n\n');res.end();}else response(res,502,{error:error.message});}return;
      }

      if (url.pathname === '/api/storyboard' && req.method === 'POST') { const {baseUrl='http://127.0.0.1:11434',model,brief,shotCount=6,style='cinematic',assets=[],targetDurationSeconds=90,creatorCanon=''}=await bodyJson(req);if(!model||!brief?.trim())return response(res,400,{error:'Choose a local Ollama model and provide the approved story brief'});if(!isLoopbackUrl(baseUrl))return response(res,400,{error:'Ollama must run on this machine'});const count=Math.max(1,Math.min(40,Number(shotCount)||6));const prompt='Return JSON only: {"title":"","visualBible":{"style":""},"scenes":[{"title":"","description":"","prompt":"","duration":"4s","assetNames":[]}]}. Create exactly '+count+' sequential '+String(style)+' storyboard scenes that total approximately '+Number(targetDurationSeconds||90)+' seconds for the approved creator concept below. Creator-stated and accepted details are canon; preserve them exactly and do not add, substitute, or contradict plot facts, characters, ship, clothing, or setting. Each image describes a distinct requested story moment, not a reference sheet or a copy of a reference image. Keep character identity and asset design consistent. For every scene, set assetNames to an array containing only exact canonical name values from the reusable asset list for assets visibly present or directly relevant in that scene; use an empty array when none apply. Never invent, paraphrase, or alias these names. Keep characters, uniforms, vehicles, locations, and props distinct. Use stable asset details only where relevant; never let asset references replace the scene action. Each prompt should state the exact scene action, camera framing, setting, and approved art direction. Missing facts should stay unspecified rather than invented.\nReusable approved assets: '+JSON.stringify(assets).slice(0,18000)+'\nAUTHORITATIVE CREATOR CANON:\n'+String(creatorCanon).slice(0,12000)+'\nApproved concept and chat:\n'+String(brief).slice(0,28000);try{const storyboard=await ollamaJson(baseUrl,model,prompt);if(!Array.isArray(storyboard.scenes))throw new Error('The model did not return storyboard scenes.');const durations=allocateSceneDurations(targetDurationSeconds,count);storyboard.scenes=storyboard.scenes.slice(0,count).map((scene,index)=>({...scene,duration:durations[index]}));return response(res,200,storyboard);}catch(error){return response(res,502,{error:error.message});} }
      if (url.pathname === '/api/settings' && req.method === 'GET') return response(res, 200, { ...(await getConfig()), scan: scanState });
      if (url.pathname === '/api/settings' && req.method === 'POST') { const data = await bodyJson(req); const old = await getConfig(); const next = { ...old, ...data, modelFolders: [...new Set((data.modelFolders || old.modelFolders).map(x => path.resolve(x)))] }; await writeJson(paths.config, next); await fs.mkdir(next.mediaFolder, { recursive: true }); scheduleScan(); return response(res, 200, next); }
      if (url.pathname === '/api/settings' && req.method === 'PUT') { const data = await bodyJson(req); const old=await getConfig(); const next={...old,...data,modelFolders:data.modelFolders||old.modelFolders}; await writeJson(paths.config,next); if(data.mediaFolder)await fs.mkdir(next.mediaFolder,{recursive:true}); return response(res,200,next); }
      if (url.pathname === '/api/audio/tts' && req.method === 'POST') { const {text,voice,rate=1}=await bodyJson(req);const config=await getConfig();const base=String(config.ttsUrl||'http://127.0.0.1:8880/v1').replace(/\/$/,'');if(!text||String(text).length>12000)return response(res,400,{error:'Enter narration up to 12,000 characters.'});if(!isLoopbackUrl(base))return response(res,400,{error:'For local generation, the speech service must run on this machine.'});try{const r=await fetch(`${base}/audio/speech`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:config.ttsModel||'kokoro',input:String(text),voice:voice||config.ttsVoice||'af_heart',response_format:config.ttsFormat||'wav',speed:Math.max(.7,Math.min(1.3,Number(rate)||1))}),signal:AbortSignal.timeout(600000)});if(!r.ok){const msg=await r.text();throw new Error(`TTS service returned ${r.status}: ${msg.slice(0,280)}`);}const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>100*1024*1024)throw new Error('Speech service returned an empty or oversized audio file.');const ext=(config.ttsFormat||'wav').toLowerCase().replace(/[^a-z0-9]/g,'');if(!['wav','mp3','opus','aac','flac'].includes(ext))throw new Error('Unsupported speech audio format in Settings.');const name=`Narration-${Date.now()}.${ext}`,target=safePath(config.mediaFolder,name);await fs.writeFile(target,bytes);return response(res,201,{media:{name,url:`/api/media/${encodeURIComponent(name)}`,kind:'Audio',bytes:bytes.length}});}catch(e){return response(res,502,{error:`Could not generate saved narration. Check the local TTS service in Settings. ${e.message}`});} }
      if (url.pathname === '/api/audio/sfx' && req.method === 'POST') { const {prompt,duration=5}=await bodyJson(req);const config=await getConfig();const base=String(config.sfxUrl||'').replace(/\/$/,'');if(!prompt||String(prompt).length>1800)return response(res,400,{error:'Describe the sound effect in 1,800 characters or fewer.'});if(!base||!isLoopbackUrl(base))return response(res,400,{error:'Configure a local audio generation URL in Settings. This must be a local sound generation service.'});try{const r=await fetch(`${base}/audio/generations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:config.sfxModel||'audio',prompt:String(prompt),duration_seconds:Math.max(1,Math.min(30,Number(duration)||5)),response_format:config.sfxFormat||'wav'}),signal:AbortSignal.timeout(600000)});if(!r.ok){const msg=await r.text();throw new Error(`Audio generation service returned ${r.status}: ${msg.slice(0,280)}`);}const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>100*1024*1024)throw new Error('Sound service returned an empty or oversized audio file.');const ext=(config.sfxFormat||'wav').toLowerCase().replace(/[^a-z0-9]/g,'');if(!['wav','mp3','opus','aac','flac'].includes(ext))throw new Error('Unsupported sound audio format in Settings.');const name=`Sound-${Date.now()}.${ext}`,target=safePath(config.mediaFolder,name);await fs.writeFile(target,bytes);return response(res,201,{media:{name,url:`/api/media/${encodeURIComponent(name)}`,kind:'Audio',bytes:bytes.length}});}catch(e){return response(res,502,{error:`Could not generate sound effect. Check your configured local audio generation service. ${e.message}`});} }
      if (url.pathname === '/api/comfy/models' && req.method === 'GET') { const config=await getConfig();const base=(config.comfyUrl||'http://127.0.0.1:8188').replace(/\/$/,'');try{const r=await fetch(`${base}/internal/folder_paths`,{signal:AbortSignal.timeout(2500)});if(!r.ok)throw new Error('ComfyUI model paths unavailable');const paths=await r.json();const exists=async(kind,name)=>{for(const folder of paths[kind]||[]){try{await fs.access(path.join(folder,name));return true;}catch{}}return false;};const models=[];if(await exists('diffusion_models','z_image_turbo_bf16.safetensors')&&await exists('text_encoders','qwen_3_4b.safetensors')&&await exists('vae','ae.safetensors'))models.push({id:'comfy-z-image',name:'Z-Image-Turbo',type:'Image',file:'z_image_turbo_bf16.safetensors',detail:'ComfyUI local model store'});const qwenNodes=await Promise.all(['TextEncodeQwenImage21','QwenImage21Cache'].map(async name=>{try{const result=await fetch(`${base}/object_info/${name}`,{signal:AbortSignal.timeout(1500)});return result.ok&&Boolean((await result.json())[name]);}catch{return false;}}));if(qwenNodes.every(Boolean)&&await exists('diffusion_models','qwen_image_2.1_int8_convrot.safetensors')&&await exists('text_encoders','qwen3vl_8b_int8_convrot.safetensors')&&await exists('vae','qwen_image_2.1_vae_bf16.safetensors'))models.push({id:'comfy-qwen-image-2-1',name:'Qwen Image 2.1',type:'Image',file:'qwen_image_2.1_int8_convrot.safetensors',maxReferences:16,detail:'ComfyUI local model store · native multi-reference image conditioning'});const animagine=await inspectAnimagineComfy(base);models.push({id:'comfy-animagine-xl-4',name:'Animagine XL 4.0',type:'Image',file:'animagine-xl-4.0-opt.safetensors',maxReferences:8,referenceMode:'ipadapter',filesReady:animagine.filesReady,supported:animagine.supported,ready:animagine.ready,readinessNote:animagine.readinessNote,detail:'Anime checkpoint · role-aware IP-Adapter Plus SDXL references'});if(await exists('diffusion_models','minimax_h3_fl2va_pruned_int8_convrot.safetensors')&&await exists('text_encoders','qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors')&&await exists('vae','minimax_h3_video_vae_fp16.safetensors')&&await exists('vae','minimax_h3_audio_vae_fp32.safetensors')&&await exists('loras','minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'))models.push({id:'comfy-minimax-h3',name:'MiniMax H3 (Local)',type:'Video',file:'minimax_h3_fl2va_pruned_int8_convrot.safetensors',detail:'ComfyUI local model store'});const wanReadiness=await getWan22ComfyReadiness(base);if(wanReadiness.ready)models.push({id:'comfy-wan22-i2v',name:'Wan 2.2 I2V (Local)',type:'Video',file:'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',maxReferences:0,videoInputMode:'storyboard-keyframe',referenceMode:'first-frame',detail:'ComfyUI local image-to-video · uses the approved storyboard frame as the exact opening frame'});return response(res,200,{models});}catch(e){return response(res,200,{models:[],error:e.message});} }      if (url.pathname === '/api/models' && req.method === 'GET') return response(res, 200, { models: await readJson(paths.models, []), scan: scanState });
      if (url.pathname === '/api/providers/huggingface/search' && req.method === 'GET') { const q=(url.searchParams.get('q')||'').trim();if(!q)return response(res,200,{models:[]});try{const r=await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=16&sort=downloads&direction=-1`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`Hugging Face responded ${r.status}`);const data=await r.json();return response(res,200,{models:data.map(m=>({id:m.id,downloads:m.downloads,likes:m.likes,pipeline:m.pipeline_tag,tags:(m.tags||[]).slice(0,8),gated:m.gated||false}))});}catch(e){return response(res,502,{error:e.message,models:[]});} }
      if (url.pathname === '/api/providers/huggingface/files' && req.method === 'GET') { const repo=url.searchParams.get('repo');if(!repo||!/^[\w.-]+\/[\w.-]+$/.test(repo))return response(res,400,{error:'A valid owner/repository is required'});try{const r=await fetch(`https://huggingface.co/api/models/${repo}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`Hugging Face responded ${r.status}`);const data=await r.json();return response(res,200,{id:data.id,files:(data.siblings||[]).map(f=>({name:f.rfilename,size:f.size||f.lfs?.size||0,lfs:f.lfs||null})).filter(f=>['.safetensors','.gguf','.ckpt','.pt','.pth','.onnx','.bin'].includes(path.extname(f.name).toLowerCase()))});}catch(e){return response(res,502,{error:e.message});} }
      if (url.pathname === '/api/providers/huggingface/download' && req.method === 'POST') { const {repo,file,token}=await bodyJson(req);if(!repo||!/^[\w.-]+\/[\w.-]+$/.test(repo)||!file||path.isAbsolute(file)||file.split(/[\\/]/).includes('..'))return response(res,400,{error:'Select a valid model file'});const config=await getConfig();const root=config.downloadFolder||config.modelFolders.at(-1);if(!root)return response(res,400,{error:'Choose a model download folder in Settings first'});const id=randomUUID();const target=safePath(path.join(root,repo.replace('/','--')),file);await fs.mkdir(path.dirname(target),{recursive:true});const job={id,repo,file,target,state:'Downloading',received:0,total:0,error:null};downloads.set(id,job);(async()=>{let temp=`${target}.${id}.partial`;try{const headers=token?{authorization:`Bearer ${token}`}:{ };const r=await fetch(`https://huggingface.co/${repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}`,{headers,redirect:'follow'});if(!r.ok)throw new Error(`Download failed (${r.status})`);job.total=Number(r.headers.get('content-length')||0);if(!r.body)throw new Error('Provider returned no file content');await new Promise((resolve,reject)=>{const out=createWriteStream(temp,{flags:'wx'});r.body.pipeTo(new WritableStream({write(chunk){job.received+=chunk.byteLength;if(!out.write(chunk))return new Promise(done=>out.once('drain',done));},close(){out.end();out.once('finish',resolve);},abort(error){out.destroy(error);reject(error);}})).catch(reject);});await fs.rename(temp,target);job.state='Complete';scanModels().catch(()=>{});}catch(e){job.state='Failed';job.error=e.message;await fs.rm(temp,{force:true});}})();return response(res,202,{id,state:job.state}); }
      if (url.pathname === '/api/providers/huggingface/downloads' && req.method === 'GET') return response(res,200,{downloads:[...downloads.values()].map(({id,repo,file,state,received,total,error})=>({id,repo,file,state,received,total,error}))});
      if (url.pathname === '/api/providers/huggingface/search' && req.method === 'GET') { const q=(url.searchParams.get('q')||'').trim();if(!q)return response(res,200,{models:[]});try{const r=await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=16&sort=downloads&direction=-1`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`Hugging Face responded ${r.status}`);const data=await r.json();return response(res,200,{models:data.map(m=>({id:m.id,downloads:m.downloads,likes:m.likes,pipeline:m.pipeline_tag,tags:(m.tags||[]).slice(0,8),gated:m.gated||false}))});}catch(e){return response(res,502,{error:e.message,models:[]});} }
      if (url.pathname === '/api/providers/huggingface/files' && req.method === 'GET') { const repo=url.searchParams.get('repo');if(!repo||!/^[\w.-]+\/[\w.-]+$/.test(repo))return response(res,400,{error:'A valid owner/repository is required'});try{const r=await fetch(`https://huggingface.co/api/models/${repo}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`Hugging Face responded ${r.status}`);const data=await r.json();return response(res,200,{id:data.id,files:(data.siblings||[]).map(f=>({name:f.rfilename,size:f.size||0,lfs:f.lfs||null})).filter(f=>['.safetensors','.gguf','.ckpt','.pt','.pth','.onnx','.bin'].includes(path.extname(f.name).toLowerCase()))});}catch(e){return response(res,502,{error:e.message});} }
      if (url.pathname === '/api/providers/huggingface/download' && req.method === 'POST') { const {repo,file,token}=await bodyJson(req);if(!repo||!/^[\w.-]+\/[\w.-]+$/.test(repo)||!file||path.isAbsolute(file)||file.split(/[\\/]/).includes('..'))return response(res,400,{error:'Select a valid model file'});const config=await getConfig();const root=config.modelFolders[0];if(!root)return response(res,400,{error:'Add a model destination folder in Settings first'});const id=randomUUID();const target=safePath(path.join(root,repo.replace('/','--')),file);await fs.mkdir(path.dirname(target),{recursive:true});const job={id,repo,file,target,state:'Downloading',received:0,total:0,error:null};downloads.set(id,job);(async()=>{try{const headers=token?{authorization:`Bearer ${token}`}:{ };const r=await fetch(`https://huggingface.co/${repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}`,{headers,redirect:'follow'});if(!r.ok)throw new Error(`Download failed (${r.status})`);job.total=Number(r.headers.get('content-length')||0);if(!r.body)throw new Error('Provider returned no file content');const counter=new TransformStream({transform(chunk,controller){job.received+=chunk.byteLength;controller.enqueue(chunk);}});await pipeline(r.body,counter,writableFile(target));job.state='Complete';}catch(e){job.state='Failed';job.error=e.message;await fs.rm(target,{force:true});}})();return response(res,202,{id,state:job.state}); }
      if (url.pathname === '/api/providers/huggingface/downloads' && req.method === 'GET') return response(res,200,{downloads:[...downloads.values()].map(({id,repo,file,state,received,total,error})=>({id,repo,file,state,received,total,error}))});
      if (url.pathname === '/api/minimax/test' && req.method === 'POST') { const {apiKey,region='global'}=await bodyJson(req);if(!apiKey)return response(res,400,{error:'Enter a MiniMax API key'});try{const base=region==='cn'?'https://api.minimaxi.com':'https://api.minimax.io';const r=await fetch(`${base}/v1/token_plan/remains`,{headers:{authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(12000)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.base_resp?.status_msg||data.message||`MiniMax rejected the key (${r.status})`);return response(res,200,{connected:true,region});}catch(e){return response(res,502,{connected:false,error:e.message});} }
      if (url.pathname === '/api/minimax/image' && req.method === 'POST') { const {apiKey,region='global',prompt,image,aspectRatio='16:9',assetId,projectId,sceneId,batchId,variant,variantCount}=await bodyJson(req);if(!apiKey||!prompt)return response(res,400,{error:'MiniMax API key and prompt are required'});try{const subject=await localImageData(image);const payload={model:'image-01',prompt:prompt.slice(0,1500),aspect_ratio:aspectRatio,response_format:'url',n:1,prompt_optimizer:true};if(subject)payload.subject_reference=[{type:'character',image_file:subject}];const data=await minimaxRequest('/v1/image_generation',apiKey,{region,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const imageUrl=data.data?.image_urls?.[0];if(!imageUrl)throw new Error('MiniMax returned no image');const config=await getConfig(),identity=[assetId,projectId,sceneId].filter(Boolean).map(x=>String(x).replace(/[^\w.-]+/g,'_')).join('-'),item=await saveRemoteMedia(imageUrl,config.mediaFolder,`minimax-${identity||Date.now()}.jpg`);await registerMediaAsset({assetId,projectId,sceneId,batchId,variant,variantCount,kind:'Image',file:item.name,provider:'MiniMax',model:'image-01'});return response(res,201,{...item,assetId,projectId,sceneId,batchId,variant,variantCount,provider:'MiniMax',taskId:data.id});}catch(e){return response(res,502,{error:e.message});} }
      if (url.pathname === '/api/minimax/video' && req.method === 'POST') {
        const {apiKey,region='global',prompt,image,endImage,references=[],duration=6,ratio='16:9',resolution='768P',model='MiniMax-H3',assetId,projectId,sceneId,batchId,variant,variantCount,language='English',transition='hard-cut',startSceneId,endSceneId}=await bodyJson(req);
        if(!apiKey||!prompt)return response(res,400,{error:'MiniMax API key and prompt are required'});
        try{
          const config=await getConfig();
          const content=[{type:'text',text:prompt.slice(0,7000)}];
          const addFrame=async(source,role)=>{if(!source)return;const dataUrl=await localImageData(source);if(!dataUrl)throw new Error('MiniMax '+role.replace('_',' ')+' must be a saved local image');content.push({type:'image_url',image_url:{url:dataUrl},role});};
          await addFrame(image,'first_frame');
          if(endImage&&endImage!==image)await addFrame(endImage,'last_frame');
          const seen=new Set([image,endImage].filter(Boolean));
          for(const reference of (Array.isArray(references)?references:[]).slice(0,9)){if(!reference||seen.has(reference))continue;seen.add(reference);await addFrame(reference,'reference_image');}
          const seconds=Math.max(4,Math.min(15,parseInt(duration,10)||6));
          const resolutionName=/^(1080p|2k|2048|1920)/i.test(String(resolution))?'2K':'768P';
          const payload={model,content,duration:seconds,resolution:resolutionName};
          if(!image&&!endImage)payload.ratio=ratio;
          const data=await minimaxRequest('/v2/video_generation',apiKey,{region,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
          const taskId=data.task_id||data.id;if(!taskId)throw new Error('MiniMax did not return a video task id');
          const id=randomUUID(),job={id,assetId,projectId,sceneId,batchId,variant,variantCount,providerTaskId:String(taskId),model,region,state:'Queued',type:'Video clip',provider:'MiniMax',destination:config.mediaFolder,language,transition,startSceneId,endSceneId,created:new Date().toISOString()};
          minimaxJobs.set(id,{...job,apiKey});const jobs=await readJson(path.join(DATA,'jobs.json'),[]);jobs.unshift(job);await writeJson(path.join(DATA,'jobs.json'),jobs);
          return response(res,202,{id,assetId,projectId,sceneId,batchId,variant,variantCount,taskId:String(taskId),state:'Queued',provider:'MiniMax',model});
        }catch(e){return response(res,502,{error:e.message});}
      }
      if (url.pathname.startsWith('/api/minimax/jobs/') && ['GET','POST'].includes(req.method)) { const id=url.pathname.slice('/api/minimax/jobs/'.length),input=req.method==='POST'?await bodyJson(req):{},jobs=await readJson(path.join(DATA,'jobs.json'),[]);let job=minimaxJobs.get(id)||jobs.find(row=>row.id===id&&row.provider==='MiniMax');if(!job)return response(res,404,{error:'MiniMax job not found'});if(!job.media&&job.file)job.media={name:job.file,url:`/api/media/${encodeURIComponent(job.file)}`};const apiKey=String(input.apiKey||job.apiKey||'');if(!apiKey)return response(res,401,{error:'Re-enter your MiniMax API key to resume this job.'});job={...job,apiKey};minimaxJobs.set(id,job);try{const data=await minimaxRequest(`/v2/query/video_generation/${encodeURIComponent(job.providerTaskId)}`,apiKey,{region:job.region});const task=data.task||{};job.state=task.status||job.state;if(task.status==='succeeded'&&!job.media){if(!task.content?.url)throw new Error('MiniMax job succeeded without a video URL');job.media=await saveRemoteMedia(task.content.url,job.destination,`minimax-${[job.assetId,job.projectId,job.sceneId].filter(Boolean).map(x=>String(x).replace(/[^\w.-]+/g,'_')).join('-')||Date.now()}.mp4`);const asset={assetId:job.assetId,projectId:job.projectId,sceneId:job.sceneId,batchId:job.batchId,variant:job.variant,variantCount:job.variantCount,kind:'Video',file:job.media.name,provider:'MiniMax',model:job.model};job.files=[asset];job.file=asset.file;await registerMediaAsset(asset);}if(task.status==='failed')job.error=task.error?.message||'MiniMax video generation failed';const persisted=jobs.findIndex(row=>row.id===id);if(persisted>=0)jobs[persisted]={...jobs[persisted],state:job.state,error:job.error,files:job.files||[],file:job.file,updatedAt:new Date().toISOString()};await writeJson(path.join(DATA,'jobs.json'),jobs);return response(res,200,{id,state:job.state,media:job.media,error:job.error,taskId:job.providerTaskId,model:job.model,assetId:job.assetId,projectId:job.projectId,sceneId:job.sceneId,batchId:job.batchId,variant:job.variant,variantCount:job.variantCount});}catch(e){return response(res,502,{error:e.message,state:job.state});} }
      if (url.pathname === '/api/generate' && req.method === 'POST') {
        const input=await bodyJson(req),config=await getConfig(),workflowKey=input.type==='Video clip'?'Video':'Image';
        const expectedModel=workflowKey==='Video'?'comfy-minimax-h3':'comfy-z-image',qwenBuiltin=workflowKey==='Image'&&input.modelId==='comfy-qwen-image-2-1',animagineBuiltin=workflowKey==='Image'&&input.modelId==='comfy-animagine-xl-4',wanBuiltin=workflowKey==='Video'&&input.modelId==='comfy-wan22-i2v';
        if(input.modelId&&input.modelId!==expectedModel&&!qwenBuiltin&&!animagineBuiltin&&!wanBuiltin&&!config.workflows[workflowKey])return response(res,400,{error:`The selected local ${workflowKey.toLowerCase()} model has no compatible built-in workflow. Select ${workflowKey==='Video'?'MiniMax H3 (Local)':'Z-Image-Turbo, Animagine XL 4.0, or Qwen Image 2.1'}, or configure a custom ${workflowKey.toLowerCase()} workflow in Settings.`});
        if(qwenBuiltin&&!config.workflows.Image){
          const base=(input.baseUrl||config.comfyUrl||'http://127.0.0.1:8188').replace(/\/$/,''),pathsResponse=await fetch(`${base}/internal/folder_paths`,{signal:AbortSignal.timeout(3000)}).catch(()=>null),paths=pathsResponse?.ok?await pathsResponse.json().catch(()=>({})):{};
          const hasFile=async(kind,name)=>{for(const folder of paths[kind]||[]){try{await fs.access(path.join(folder,name));return true;}catch{}}return false;};
          const ready=await Promise.all([hasFile('diffusion_models','qwen_image_2.1_int8_convrot.safetensors'),hasFile('text_encoders','qwen3vl_8b_int8_convrot.safetensors'),hasFile('vae','qwen_image_2.1_vae_bf16.safetensors')]);
          if(!ready.every(Boolean))return response(res,400,{error:'Qwen Image 2.1 needs qwen_image_2.1_int8_convrot.safetensors, qwen3vl_8b_int8_convrot.safetensors, and qwen_image_2.1_vae_bf16.safetensors installed in the matching ComfyUI model folders.'});
        }
        if(animagineBuiltin&&!config.workflows.Image){const readiness=await inspectAnimagineComfy((input.baseUrl||config.comfyUrl||'http://127.0.0.1:8188').replace(/\/$/,''));if(!readiness.ready)return response(res,400,{error:readiness.readinessNote});}
        if(wanBuiltin){try{const ready=await getWan22ComfyReadiness((input.baseUrl||config.comfyUrl||'http://127.0.0.1:8188').replace(/\/$/,''));if(!ready.ready)return response(res,400,{error:'Wan 2.2 I2V is not ready. Missing files: '+(ready.missingFiles.join(', ')||'none')+'; missing ComfyUI nodes: '+(ready.missingNodes.join(', ')||'none')+'.'});}catch(error){return response(res,503,{error:'Could not verify Wan 2.2 in ComfyUI: '+error.message});}}const scenePrefix='LocalFlow/'+[input.projectId,input.sceneId,input.assetId].filter(Boolean).map(x=>String(x).replace(/[^\w.-]+/g,'_')).join('/');
        const result=await submitComfyJob({...input,filenamePrefix:scenePrefix,baseUrl:input.baseUrl||config.comfyUrl,workflow:wanBuiltin?null:(input.workflow||config.workflows[workflowKey])});
        const jobs=await readJson(path.join(DATA,'jobs.json'),[]);jobs.unshift({id:result.promptId,assetId:input.assetId,projectId:input.projectId,sceneId:input.sceneId,batchId:input.batchId,variant:input.variant,variantCount:input.variantCount,modelId:input.modelId,model:input.modelName,provider:'ComfyUI',state:'Queued',created:new Date().toISOString(),prompt:input.prompt,type:input.type,sourceMode:input.sourceMode||'storyboard',referenceManifest:result.referenceBindings,...videoContinuityMetadata(input),project:input.project,scene:input.scene,destination:input.destination||config.mediaFolder});await writeJson(path.join(DATA,'jobs.json'),jobs);return response(res,202,{promptId:result.promptId,assetId:input.assetId,sceneId:input.sceneId,projectId:input.projectId,state:'Queued',referenceCount:result.referenceBindings.length});
      }
      if (url.pathname === '/api/assemble' && req.method === 'POST') { const input=await bodyJson(req);const config=await getConfig();try{const media=await assembleVideos({clips:input.clips,destination:input.destination||config.mediaFolder,filename:input.filename,fps:input.fps||config.defaultVideoFps,resolution:input.resolution||config.defaultVideoResolution||'340p',config});return response(res,201,{media});}catch(e){return response(res,500,{error:e.message});} }
      if (url.pathname === '/api/storyboard/export' && req.method === 'POST') {
        const input=await bodyJson(req),config=await getConfig();
        try{return response(res,201,await writeStoryboardPdf(input.project,input.filePath,{imageForScene:image=>storyboardImageForScene(image,config)}));}
        catch(error){return response(res,400,{error:error.message});}
      }
      if (url.pathname === '/api/storyboard/export/download' && req.method === 'POST') {
        const input=await bodyJson(req),config=await getConfig(),filename=exportFilename(input.filename,'LocalFlow-Storyboard.pdf');
        try{const buffer=await renderStoryboardPdf(input.project,{imageForScene:image=>storyboardImageForScene(image,config)});return downloadResponse(res,buffer,'application/pdf',filename);}
        catch(error){return response(res,400,{error:error.message});}
      }
      if (url.pathname === '/api/timeline/export' && req.method === 'POST') { const input=await bodyJson(req),target=parseExportOutputPath(input.filePath,'mp4');if(!target)return response(res,400,{error:'Choose where to save the timeline export as an MP4 file.'});const config=await getConfig();try{const media=await renderTimeline({tracks:input.tracks,...target,fps:input.fps||config.defaultVideoFps,resolution:input.resolution||config.defaultVideoResolution||'340p',config});return response(res,201,{media});}catch(e){return response(res,400,{error:e.message});} }
      if (url.pathname === '/api/timeline/export/download' && req.method === 'POST') {
        const input=await bodyJson(req),config=await getConfig(),filename=exportFilename(input.filename,'LocalFlow-Timeline-Edit.mp4'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'local-flow-timeline-download-'));
        try{const media=await renderTimeline({tracks:input.tracks,filename,destination:temp,fps:input.fps||config.defaultVideoFps,resolution:input.resolution||config.defaultVideoResolution||'340p',config});const buffer=await fs.readFile(media.path);return downloadResponse(res,buffer,'video/mp4',filename);}
        catch(error){return response(res,400,{error:error.message});}
        finally{await fs.rm(temp,{recursive:true,force:true});}
      }
      if (url.pathname.startsWith('/api/generate/') && req.method === 'GET') {
        const promptId=url.pathname.slice('/api/generate/'.length);
        const base=(await getConfig()).comfyUrl||'http://127.0.0.1:8188';
        const r=await fetch(`${base}/history/${encodeURIComponent(promptId)}`);
        const data=await r.json();
        const history=data[promptId];
        const jobs=await readJson(path.join(DATA,'jobs.json'),[]),assetIndex=await readJson(paths.assets,{}),job=jobs.find(j=>j.id===promptId);if(job&&recoverLegacyJobIds(job,assetIndex))await writeJson(path.join(DATA,'jobs.json'),jobs);
        if(!history){try{const queued=await fetch(`${base}/queue`,{signal:AbortSignal.timeout(4000)}),queueData=await queued.json(),hasId=row=>Array.isArray(row)?row[1]===promptId:row?.prompt_id===promptId||row?.promptId===promptId,running=(queueData.queue_running||[]).some(hasId),pending=(queueData.queue_pending||[]).some(hasId);if(running||pending)return response(res,200,{state:running?'Running':'Queued',referenceManifest:job?.referenceManifest||[]});}catch{}if(job&&!['Complete','Failed','Cancelled'].includes(job.state)){job.state='Failed';job.error='ComfyUI no longer has this prompt in its queue or history. The runner may have restarted; retry this generation.';await writeJson(path.join(DATA,'jobs.json'),jobs);}return response(res,200,{state:job?.state||'Queued',error:job?.error,media:job?.file,mediaFiles:job?.files||[],referenceManifest:job?.referenceManifest||[]});}
        const outputs=history.outputs||{}, files=[],seenOutputFiles=new Set(),allowedOutputExtensions=job?.type==='Video clip'?new Set(['.mp4','.mov','.webm','.mkv','.avi','.gif']):new Set(['.png','.jpg','.jpeg','.webp','.bmp']);
        for(const node of Object.values(outputs))for(const group of Object.values(node))if(Array.isArray(group))for(const file of group){if(!file?.filename||!allowedOutputExtensions.has(path.extname(file.filename).toLowerCase()))continue;const key=[file.type||'output',file.subfolder||'',file.filename].join('\u001f');if(seenOutputFiles.has(key))continue;seenOutputFiles.add(key);files.push(file);}
        if(history.status?.completed&&job){
          const config=await getConfig(),destination=job.destination||config.mediaFolder,savedRecords=Array.isArray(job.files)&&job.files.length?job.files:(job.file?[{assetId:job.assetId,projectId:job.projectId,sceneId:job.sceneId,batchId:job.batchId,variant:job.variant,variantCount:job.variantCount,kind:job.type==='Video clip'?'Video':'Image',file:job.file,provider:job.provider||'ComfyUI',model:job.model,modelId:job.modelId,referenceManifest:job.referenceManifest||[],...videoContinuityMetadata(job)}]:[]);let savedFilesExist=savedRecords.length>0;for(const record of savedRecords){try{const stat=await fs.stat(safePath(destination,record.file));if(!stat.isFile()){savedFilesExist=false;break;}}catch{savedFilesExist=false;break;}}
          if(job.saved&&savedFilesExist){job.files=savedRecords;job.file=job.file||savedRecords[0].file;job.state='Complete';delete job.error;for(const record of savedRecords)await registerMediaAsset(record);await writeJson(path.join(DATA,'jobs.json'),jobs);}
          else{await fs.mkdir(destination,{recursive:true});job.saved=false;job.files=[];for(const file of files){const view=file.type==='temp'?'temp':'output';const src=await fetch(`${base}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder||'')}&type=${view}`);if(!src.ok)continue;const ext=path.extname(file.filename);const out=`${Date.now()}-${path.basename(file.filename,ext)}${ext}`;await fs.writeFile(safePath(destination,out),Buffer.from(await src.arrayBuffer()));const index=job.files.length,variant=(Number(job.variant)||1)+index,assetId=files.length===1?job.assetId:`${job.assetId}-output-${index+1}`;const record={assetId,projectId:job.projectId,sceneId:job.sceneId,batchId:job.batchId,variant,variantCount:job.variantCount,kind:job.type==='Video clip'?'Video':'Image',file:out,provider:'ComfyUI',model:job.model,modelId:job.modelId,referenceManifest:job.referenceManifest||[],...videoContinuityMetadata(job)};job.files.push(record);await registerMediaAsset(record);job.saved=true;}if(job.files.length){job.file=job.files[0].file;job.state='Complete';delete job.error;}else{job.state='Failed';job.error=`ComfyUI completed without returning a downloadable ${job.type==='Video clip'?'video':'image'} output.`;}await writeJson(path.join(DATA,'jobs.json'),jobs);}
        }else if(history.status?.status_str==='error'&&job){job.state='Failed';job.error=history.status.messages?.map(m=>m[1]?.exception_message).find(Boolean)||'ComfyUI generation failed';await writeJson(path.join(DATA,'jobs.json'),jobs);}
        return response(res,200,{state:job?.state||(history.status?.completed?'Complete':'Running'),files,media:job?.file,mediaFiles:job?.files||[],referenceManifest:job?.referenceManifest||[],error:job?.error});
      }      if (url.pathname === '/api/jobs' && req.method === 'GET') {const jobs=await readJson(path.join(DATA,'jobs.json'),[]),assetIndex=await readJson(paths.assets,{});let changed=false;for(const job of jobs)changed=recoverLegacyJobIds(job,assetIndex)||changed;if(changed)await writeJson(path.join(DATA,'jobs.json'),jobs);return response(res,200,{jobs});}
      if (url.pathname === '/api/models/scan' && req.method === 'POST') { if(!scanPromise) { scanState={...scanState,scanning:true}; scanModels().catch(error => { scanState = { ...scanState, scanning: false, errors: [error.message] }; }); } return response(res, 202, { started: true }); }
      if (url.pathname === '/api/models/folders' && req.method === 'POST') { const { folder } = await bodyJson(req); const full = path.resolve(folder || ''); const st = await fs.stat(full); if (!st.isDirectory()) return response(res, 400, { error: 'Select a folder' }); const config = await getConfig(); config.modelFolders = [...new Set([...config.modelFolders, full])]; config.downloadFolder=full; await writeJson(paths.config, config); scanModels().catch(() => {}); return response(res, 200, { folders: config.modelFolders,downloadFolder:full }); }
      if (url.pathname === '/api/folder-picker' && req.method === 'POST') { const { title='Select a folder' } = await bodyJson(req); if(process.platform!=='win32') return response(res,501,{error:'Native folder picker is available on Windows only'}); const script=`Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='${String(title).replace(/['\\]/g,'') }'; if($d.ShowDialog() -eq 'OK'){Write-Output $d.SelectedPath}`; const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-STA','-Command',script],{windowsHide:true}); const folder=stdout.trim(); if(!folder)return response(res,204,{}); return response(res,200,{folder}); }
      if (url.pathname === '/api/save-file-picker' && req.method === 'POST') { const {title,defaultName,format='mp4'}=await bodyJson(req);if(process.platform!=='win32')return response(res,501,{error:'Native Save dialog is available on Windows only'});const extension=format==='pdf'?'pdf':'mp4',cleanName=path.basename(String(defaultName||(extension==='pdf'?'LocalFlow-Storyboard.pdf':'LocalFlow-Edit.mp4'))).replace(/['\\]/g,'');const cleanTitle=String(title||(extension==='pdf'?'Save storyboard PDF':'Save video')).replace(/['\\]/g,'');const filter=extension==='pdf'?'PDF document (*.pdf)|*.pdf':'MP4 video (*.mp4)|*.mp4';const script=`Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.SaveFileDialog; $d.Title='${cleanTitle}'; $d.Filter='${filter}'; $d.DefaultExt='${extension}'; $d.AddExtension=$true; $d.FileName='${cleanName}'; if($d.ShowDialog() -eq 'OK'){Write-Output $d.FileName}`;const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-STA','-Command',script],{windowsHide:true});const filePath=stdout.trim();if(!filePath)return response(res,204,{});if(!parseExportOutputPath(filePath,extension))return response(res,400,{error:`Choose an absolute Windows save path ending in .${extension}.`});return response(res,200,{filePath}); }
      if (url.pathname === '/api/media' && req.method === 'GET') { const config = await getConfig(); const rows=await listFiles(config.mediaFolder); const trashed=await listFiles(paths.trash,true); const cutoff=Date.now()-Number(config.trashRetentionDays||30)*86400000; const stale=trashed.filter(row=>Date.parse(row.trashedAt)<cutoff); for(const row of stale) await fs.rm(safePath(paths.trash,row.storedName),{force:true}); return response(res, 200, { media: rows, trash: trashed.filter(row=>!stale.includes(row)), folder: config.mediaFolder, retentionDays: config.trashRetentionDays }); }
      if (url.pathname === '/api/media/reveal' && req.method === 'POST') { const { name, trash=false } = await bodyJson(req); const config=await getConfig(); const result=await revealMediaInFileManager({name,mediaFolder:config.mediaFolder,trashFolder:paths.trash,trash:Boolean(trash),platform:process.platform,spawnProcess:spawn}); return response(res,200,{revealed:true,...result}); }
      if (url.pathname === '/api/media/folder' && req.method === 'POST') { const { folder } = await bodyJson(req); const full = path.resolve(folder || ''); await fs.mkdir(full, { recursive: true }); const config = await getConfig(); config.mediaFolder = full; await writeJson(paths.config, config); return response(res, 200, { folder: full }); }
      if (url.pathname === '/api/media/import' && req.method === 'POST') { const { name, data, assetId, projectId, sceneId, kind } = await bodyJson(req); const config = await getConfig(); const requestedName = path.basename(name || `media-${Date.now()}`); const safeAssetId=String(assetId||'').replace(/[^\w.-]+/g,'_'); const clean = safeAssetId ? `${safeAssetId}-${requestedName}` : requestedName; const match = /^data:(image\/[\w.+-]+|video\/[\w.+-]+|audio\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(data || ''); if (!match) return response(res, 400, { error: 'Image, video, or audio data required' });const bytes=Buffer.from(match[2],'base64');if(bytes.length>70*1024*1024)return response(res,413,{error:'Each imported asset must be 72 MB or smaller.'}); const file = safePath(config.mediaFolder, clean); await fs.mkdir(config.mediaFolder, { recursive: true }); await fs.writeFile(file, bytes);const mediaKind=kind||match[1].split('/')[0].replace(/^./,x=>x.toUpperCase());await registerMediaAsset({assetId,projectId,sceneId,kind:mediaKind,file:clean,source:'Imported'});return response(res, 201, { name: clean, url: `/api/media/${encodeURIComponent(clean)}`,assetId,projectId,sceneId,kind:mediaKind }); }
      if (url.pathname === '/api/media/metadata' && req.method === 'POST') { const { assets=[] }=await bodyJson(req);if(!Array.isArray(assets)||assets.length>1000)return response(res,400,{error:'Send up to 1,000 media metadata records.'});const config=await getConfig(),saved=[];for(const asset of assets){const mediaUrl=String(asset?.url||'');if(!mediaUrl.startsWith('/api/media/'))continue;const name=path.basename(decodeURIComponent(mediaUrl.slice('/api/media/'.length).split('?')[0]));const full=safePath(config.mediaFolder,name),stat=await fs.stat(full).catch(()=>null);if(!stat?.isFile())continue;const metadata={assetId:String(asset.assetId||''),projectId:String(asset.projectId||''),sceneId:String(asset.sceneId||''),kind:asset.kind==='Video'?'Video':'Image',file:name,source:asset.source||'Project metadata',model:asset.model||undefined,modelId:asset.modelId||undefined,provider:asset.provider||undefined,batchId:asset.batchId||undefined,variant:asset.variant??undefined,variantCount:asset.variantCount??undefined,rating:asset.rating||undefined,createdAt:asset.createdAt||undefined};await registerMediaAsset(metadata);saved.push(name);}return response(res,200,{saved:saved.length}); }
      if (url.pathname === '/api/media/trash' && req.method === 'POST') { const { name,trash } = await bodyJson(req); const cleanName=path.basename(name||'');if(!cleanName)return response(res,400,{error:'Media file name is required'});const config = await getConfig(); const fromTrash = Boolean(trash); const root = fromTrash ? paths.trash : config.mediaFolder; const source = safePath(root, cleanName); const destName = fromTrash ? cleanName : `${Date.now()}__${cleanName}`;try{await fs.rename(source, safePath(paths.trash, destName));return response(res, 200, { trashed: true });}catch(error){if(error.code==='ENOENT'){const trashed=await fs.readdir(paths.trash).catch(()=>[]);if(fromTrash||trashed.some(file=>file===cleanName||file.endsWith(`__${cleanName}`)))return response(res,200,{trashed:true,alreadyTrashed:true});return response(res,200,{trashed:false,missing:true});}throw error;} }
      if (url.pathname === '/api/media/restore' && req.method === 'POST') { const { name } = await bodyJson(req); const config = await getConfig(); const storedName=path.basename(name||''); const source = safePath(paths.trash, storedName); const split=storedName.indexOf('__'); const original=split>=0?storedName.slice(split+2):storedName; const dest = safePath(config.mediaFolder, original); await fs.mkdir(config.mediaFolder, { recursive: true }); await fs.rename(source, dest); return response(res, 200, { restored: true }); }
      if (url.pathname === '/api/media/empty-trash' && req.method === 'POST') { const items = await fs.readdir(paths.trash).catch(() => []); for (const item of items) await fs.rm(safePath(paths.trash, item), { recursive: true, force: true }); return response(res, 200, { deleted: items.length }); }
      if (url.pathname.startsWith('/api/media/') && req.method === 'GET') { const name = decodeURIComponent(url.pathname.slice('/api/media/'.length)); const trash = url.searchParams.get('trash') === '1'; const config = await getConfig(); const file = safePath(trash ? paths.trash : config.mediaFolder, name); const ext = path.extname(file).toLowerCase(); const type = ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'; return serveMediaFile(req, res, file, type, url.searchParams.has('download') ? { downloadName: name } : undefined); }
      return response(res, 404, { error: 'Unknown API route' });
    }
    if (req.method === 'GET') return serveStatic(req, res);
    return response(res, 405, { error: 'Method not allowed' });
  } catch (error) { return response(res, 500, { error: error.message }); }
});
server.listen(PORT, '127.0.0.1', async () => {
  const config = await getConfig();
  if (!config.modelFolders.length) { const comfyModels=path.join(process.env.LOCALAPPDATA||'','Comfy-Desktop','ComfyUI-Shared','models');try{await fs.access(comfyModels);config.modelFolders=[comfyModels];}catch{};if(!config.modelFolders.length)config.modelFolders=[path.join(os.homedir(),'AI','models')];await writeJson(paths.config,config); }
  await scanModels().catch(() => {});
  scheduleScan();
  startComfyIfConfigured().then(result=>console.log("ComfyUI startup: "+result.reason)).catch(error=>console.error("ComfyUI startup failed: "+error.message));
  console.log(`Local Flow server running at http://127.0.0.1:${PORT}`);
});
const stopComfy=()=>{if(comfyChild&&!comfyChild.killed)comfyChild.kill();};
process.on('SIGINT',stopComfy);process.on('SIGTERM',stopComfy);




