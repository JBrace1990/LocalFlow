import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Check, CircleHelp, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { SUGGESTED_MODELS } from './suggested-models.js';
import { comfyCategoryFromFile } from './comfy-model-install.js';
import './suggested-model-pool.css';

const formatSize = bytes => bytes > 0 ? `${(bytes / 1024 ** 3).toFixed(bytes > 10 * 1024 ** 3 ? 0 : 1)} GB` : 'Size unavailable';

export function SuggestedModelPool() {
  const [modelId, setModelId] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState({});
  const [started, setStarted] = useState(new Set());
  const selectedModel = SUGGESTED_MODELS.find(model => model.id === modelId);
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + (file.size || 0), 0), [files]);

  useEffect(() => {
    if (!modelId) return undefined;
    let active = true;
    setLoading(true); setError(''); setFiles([]); setJobs({}); setStarted(new Set());
    fetch(`/api/providers/huggingface/files?repo=${encodeURIComponent(selectedModel.repo)}`)
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not list model files'); return data.files || []; })
      .then(data => { if (active) setFiles(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [modelId]);

  useEffect(() => {
    if (!started.size) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/providers/huggingface/downloads');
        const data = await response.json();
        const activeJobs = {};
        for (const job of data.downloads || []) if (started.has(job.id)) activeJobs[job.id] = job;
        setJobs(activeJobs);
        const finished = [...started].every(id => ['Complete', 'Failed'].includes(activeJobs[id]?.state));
        if (finished) {
          clearInterval(timer);
          await fetch('/api/models/scan', { method: 'POST' }).catch(() => {});
        }
      } catch { /* keep polling; transient API errors do not cancel a download */ }
    }, 1000);
    return () => clearInterval(timer);
  }, [started]);

  const installFile = async file => {
    try {
      const comfyCategory = comfyCategoryFromFile(file.name, selectedModel.fileTargets || []);
      const response = await fetch('/api/providers/huggingface/download', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repo: selectedModel.repo, file: file.name, comfyCategory })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start model download');
      if (data.alreadyInstalled) {
        setJobs(current => ({ ...current, [`installed:${file.name}`]: { file: file.name, state: 'Complete' } }));
        return;
      }
      setStarted(current => new Set([...current, data.id]));
    } catch (e) { setError(e.message); }
  };

  const close = () => setModelId('');

  return <section className="suggested-model-pool">
    <div className="suggested-pool-heading"><div><span className="eyebrow">CURATED OPTIONS</span><h2>Suggested models</h2><p>Request weights for models with useful local workflows. They remain unavailable in generation menus until LocalFlow has a compatible workflow configured.</p></div></div>
    <div className="suggested-model-grid">
      {SUGGESTED_MODELS.map(model => <article className="suggested-model-card" key={model.id}>
        <div className="suggested-model-top"><div><span className="suggested-category">{model.category}{model.recommended ? ' · Recommended' : ''}</span><h3>{model.name}</h3></div><button className="suggested-info" type="button" title="Model details" onClick={() => setModelId(model.id)}><CircleHelp size={15}/></button></div>
        <p>{model.bestFor}</p>
        <dl><div><dt>References</dt><dd>{model.maxReferences === null ? 'Multiple; graph dependent' : model.maxReferences === 0 ? 'Text only' : `${model.maxReferences} starting frame`}</dd></div><div><dt>License</dt><dd>{model.license}</dd></div></dl>
        <small className="suggested-compatibility">{model.compatibility}</small>
        <div className="suggested-model-actions"><button className="secondary-button" type="button" onClick={() => setModelId(model.id)}><ArrowDownToLine size={14}/>Review & download</button>{model.comfyUrl && <a href={model.comfyUrl} target="_blank" rel="noreferrer" title="Open official ComfyUI workflow"><ExternalLink size={14}/><span>Workflow</span></a>}</div>
      </article>)}
    </div>
    {selectedModel && <div className="suggested-model-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="suggested-model-dialog" role="dialog" aria-modal="true" aria-labelledby="suggested-model-title">
        <header><div><span className="eyebrow">MODEL INSTALL</span><h2 id="suggested-model-title">{selectedModel.name}</h2></div><button className="icon-button" type="button" onClick={close} aria-label="Close"><X size={16}/></button></header>
        <p>{selectedModel.bestFor}</p><p className="suggested-workflow-note">{selectedModel.compatibility}</p>
        <div className="suggested-download-meta"><span>Repository: <b>{selectedModel.repo}</b></span><span>License: <b>{selectedModel.license}</b></span>{!loading && <span>Listed weights: <b>{formatSize(totalBytes)}</b></span>}</div>
        <div className="suggested-file-list">
          {loading && <div className="suggested-empty"><LoaderCircle className="spin" size={16}/>Loading model files…</div>}
          {error && <div className="suggested-error">{error}</div>}
          {!loading && !error && files.map(file => {
            const category = comfyCategoryFromFile(file.name, selectedModel.fileTargets || []);
            const job = Object.values(jobs).find(row => row.file === file.name);
            const progress = job?.total ? Math.min(100, Math.round(job.received / job.total * 100)) : 0;
            return <div className="suggested-file" key={file.name}>
              <div className="suggested-file-info"><b title={file.name}>{file.name}</b><span>{formatSize(file.size)}{category ? ` · ComfyUI ${category}` : ' · no install category detected'}</span></div>
              {job?.state === 'Complete' ? <span className="suggested-installed"><Check size={13}/>Installed</span> : job?.state === 'Failed' ? <div className="suggested-file-failure"><span className="suggested-error" title={job.error}>{job.error || 'Failed'}</span><button className="secondary-button" type="button" onClick={() => installFile(file)}>Retry</button></div> : job?.state === 'Downloading' ? <div className="suggested-progress"><progress max="100" value={progress}/><span>{progress ? `${progress}%` : 'Downloading…'}</span></div> : <button className="secondary-button" type="button" onClick={() => installFile(file)}><ArrowDownToLine size={13}/>Download</button>}
            </div>;
          })}
          {!loading && !error && !files.length && <div className="suggested-empty">No supported weight files found in this repository.</div>}
        </div>
        <footer>Weights download to the matching ComfyUI model category when available, or to your configured model folder. LocalFlow generation still requires a compatible workflow.</footer>
      </section>
    </div>}
  </section>;
}
