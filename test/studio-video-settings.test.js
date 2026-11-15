import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('Video settings opens Studio video controls and generation uses selected scene settings', async () => {
  const source = await fs.readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(source, /<button className="primary-button" onClick=\{\(\)=>setStudioTab\('Video'\)\}><Film size=\{15\}\/>(?:<[^>]+>)*Video settings/);
  assert.match(source, /studioTab==='Video'&&<><div className="form-field"><label>Video workflow/);
  assert.match(source, /<VideoDurationField duration=\{shot\?\.duration\|\|'4s'\}[^>]*onChange=\{value=>updateShot\('duration',value\)\}/);
  assert.match(source, /<div className="form-field"><label>Aspect ratio<\/label><select value=\{shot\?\.aspectRatio\|\|'16:9'\} onChange=\{e=>updateShot\('aspectRatio',e\.target\.value\)\}/);
  assert.match(source, /<div className="form-field"><label>Resolution<\/label><select value=\{shot\?\.resolution\|\|studioSettings\.defaultVideoResolution\|\|'340p'\} onChange=\{e=>updateShot\('resolution',e\.target\.value\)\}/);
  assert.match(source, /generateBatch\(isVideo\?'Video clip':'Keyframe',[\s\S]*?\{count:outputsPerRun,shot,project,videoMode:isVideo\?videoWorkflowMode:'text',stayInStudio:true\}\)/);
});
