import React, { useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, FolderOpen } from 'lucide-react';

export function ProjectArchiveActions({ project, timeline, onImport, toast }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const exportProject = async () => {
    setBusy(true);
    try {
      const zip = new JSZip();
      const map = new Map();
      let count = 0;
      const capture = async value => {
        if (typeof value !== 'string' || !value.startsWith('/api/media/')) return value;
        if (map.has(value)) return map.get(value);
        const name = decodeURIComponent(value.slice('/api/media/'.length).split('?')[0]);
        const response = await fetch(value);
        if (!response.ok) return value;
        const blob = await response.blob();
        const asset = `assets/${String(++count).padStart(3, '0')}_${name.replace(/[\\/]/g, '_')}`;
        zip.file(asset, blob);
        map.set(value, asset);
        return asset;
      };
      const rewrite = async value => {
        if (Array.isArray(value)) return Promise.all(value.map(rewrite));
        if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k,v])=>[k,await rewrite(v)])));
        return capture(value);
      };
      const content = { format:'local-flow-project', version:1, exportedAt:new Date().toISOString(), project:await rewrite(project), timeline:await rewrite(timeline) };
      zip.file('project.json', JSON.stringify(content, null, 2));
      const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
      const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${(project.name||'Local-Flow-project').replace(/[^\w.-]+/g,'_')}.localflow.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000);
      toast(`Project archive saved with ${count} local media files`);
    } catch(e) { toast(`Could not create archive: ${e.message}`); }
    finally { setBusy(false); }
  };
  const importProject = async event => {
    const file=event.target.files?.[0];if(!file)return;setBusy(true);
    try {
      const zip=await JSZip.loadAsync(file),manifest=zip.file('project.json');if(!manifest)throw new Error('This ZIP does not contain a Local Flow project.');
      const data=JSON.parse(await manifest.async('string'));if(data.format!=='local-flow-project'||!data.project)throw new Error('This archive format is not supported.');
      const restored=new Map(),importRun=crypto.randomUUID();
      for(const [name,entry] of Object.entries(zip.files)){if(entry.dir||!name.startsWith('assets/'))continue;const entryName=name.split('/').at(-1),sequence=entryName.match(/^(\d+)_/)?.[1]||'000',base=entryName.replace(/^\d+_/,''),ext=base.split('.').at(-1)?.toLowerCase(),mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',flac:'audio/flac'})[ext];if(!mime)continue;const b64=await entry.async('base64');const response=await fetch('/api/media/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:`LocalFlow_${importRun}_${sequence}_${base}`,data:`data:${mime};base64,${b64}`})});const result=await response.json();if(!response.ok)throw new Error(result.error||`Could not restore ${base}`);restored.set(name,result.url);}
      const rewrite=value=>{if(Array.isArray(value))return value.map(rewrite);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));return typeof value==='string'&&restored.has(value)?restored.get(value):value;};
      onImport({project:rewrite(data.project),timeline:rewrite(data.timeline||[])});toast(`Imported project and ${restored.size} media files`);
    } catch(e) { toast(`Could not import archive: ${e.message}`); }
    finally { setBusy(false);event.target.value=''; }
  };
  return <><button disabled={busy} onClick={exportProject}><Download size={19}/><span><b>{busy?'Preparing archive…':'Project archive'}</b><small>Save this storyboard, timeline, and local media into one portable ZIP.</small></span></button><button disabled={busy} onClick={()=>input.current?.click()}><FolderOpen size={19}/><span><b>Open project archive</b><small>Restore a Local Flow ZIP and its saved assets.</small></span></button><input ref={input} type="file" accept=".zip,.localflow.zip,application/zip" hidden onChange={importProject}/></>;
}
