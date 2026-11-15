import React from 'react';
import { AudioLines, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import './comfy-audio.css';

export function ComfyAudioSettings() {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch('/api/comfy/audio');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not read ComfyUI audio status.');
      setStatus(data);
      if (data.download?.state === 'Downloading' || data.download?.state === 'Preparing') setBusy(true);
      else setBusy(false);
      setError(!data.ready && data.download?.state === 'Failed' ? data.download.error || data.download.message : '');
    } catch (cause) {
      setError(cause.message);
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const startDownload = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/comfy/audio/download', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start the ComfyUI model download.');
      await refresh();
    } catch (cause) {
      setError(cause.message);
      setBusy(false);
    }
  };

  const download = status?.download;
  const downloading = ['Downloading', 'Preparing'].includes(download?.state);
  const ready = Boolean(status?.ready);
  const modelFiles = status?.modelFiles || [];
  const progress = Math.max(0, Math.min(100, Number(download?.progress) || 0));
  const downloadedBytes = Number(download?.received) || 0;
  const fileTotal = Number(download?.total) || 0;
  const downloadedText = fileTotal
    ? `${(downloadedBytes / 1024 ** 3).toFixed(2)} / ${(fileTotal / 1024 ** 3).toFixed(2)} GB`
    : downloadedBytes ? `${(downloadedBytes / 1024 ** 3).toFixed(2)} GB downloaded` : '';

  return <section className="settings-section comfy-audio-settings" data-settings-group="Audio & Sound">
    <div className="settings-section-title">
      <div className="settings-section-icon"><AudioLines size={15}/></div>
      <div><b>Local sound effects</b><small>Generate ambience, creature, and action sounds through ComfyUI.</small></div>
      <button className="secondary-button" type="button" onClick={refresh} aria-label="Refresh ComfyUI audio status"><RefreshCw size={13}/>Refresh</button>
    </div>
    <div className="comfy-audio-model-card">
      <div className={`dependency-indicator ${ready ? 'ready' : ''}`}/>
      <div className="comfy-audio-model-copy">
        <b>Stable Audio Open 1.0</b>
        <small>{ready ? 'Ready in the configured ComfyUI model folders' : status?.connected ? 'Local text-to-audio model · model files are separate from Local Flow' : status?.reason || 'Checking ComfyUI…'}</small>
      </div>
      <strong>{ready ? 'Ready' : status?.connected ? 'Not downloaded' : 'Unavailable'}</strong>
    </div>
    {!ready && status?.connected && <>
      <div className="comfy-audio-file-list">{modelFiles.map(file => <div key={file.key}><span className={`dependency-indicator ${file.ready ? 'ready' : ''}`}/><span>{file.label}</span><small>{file.ready ? 'Downloaded' : file.filename}</small></div>)}</div>
      <button className="secondary-button comfy-audio-download-button" type="button" onClick={startDownload} disabled={busy || modelFiles.every(file => file.ready)}>
        {downloading ? <LoaderCircle size={14} className="spin"/> : <Download size={14}/>}
        {downloading ? `Downloading model files · ${progress}%` : download?.state === 'Failed' ? 'Retry model download' : 'Download Stable Audio Open · about 5.4 GB'}
      </button>
      {downloading && <div className="comfy-audio-download-progress" role="status" aria-live="polite">
        <div className="comfy-audio-progress-track"><span style={{ width: `${progress}%` }}/></div>
        <div><b>{download?.currentFile || download?.message || 'Preparing model download'}</b><small>{downloadedText}{download?.fileIndex ? ` · file ${download.fileIndex} of 2` : ''}</small></div>
      </div>}
    </>}
    {status?.reason && <p className="connection-help">{status.reason}</p>}
    {error && <p className="dependency-message error" role="alert">{error}</p>}
    <p className="connection-help">Stable Audio Open is an optional external model, not included in the installer. Its weights are provided under the Stability AI Community License; check the <a href="https://huggingface.co/Comfy-Org/stable-audio-open-1.0" target="_blank" rel="noreferrer">model license</a> before commercial use.</p>
  </section>;
}
