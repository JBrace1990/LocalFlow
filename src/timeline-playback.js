export function timelineVideoSourceTime(track, playhead) {
  if (!track || track.kind !== 'Video') return null;
  const start = Number(track.start) || 0;
  const trimIn = Number(track.trimIn) || 0;
  const duration = Number(track.duration) || 0;
  const clipOffset = Number(playhead) - start;
  if (!Number.isFinite(clipOffset) || clipOffset < -1e-6 || clipOffset > duration + 1e-6) return null;
  return trimIn + Math.min(duration, Math.max(0, clipOffset));
}

export function timelinePlayheadFromMediaTime(track, mediaTime) {
  return (Number(track?.start) || 0) + Number(mediaTime) - (Number(track?.trimIn) || 0);
}

export function timelineVisualAtPlayhead(tracks, playhead) {
  const time = Number(playhead) || 0;
  return (tracks || [])
    .filter(track => (track?.kind === 'Video' || track?.kind === 'Image')
      && Number.isFinite(Number(track.start))
      && Number.isFinite(Number(track.duration))
      && time >= Number(track.start)
      && time < Number(track.start) + Number(track.duration))
    .sort((a, b) => Number(b.start) - Number(a.start))[0] || null;
}

export function timelineAudioSourceTime(track, playhead) {
  if (!track || track.kind !== 'Audio') return null;
  const start = Math.max(0, Number(track.start) || 0);
  const duration = Math.max(0, Number(track.duration) || 0);
  const time = Number(playhead) || 0;
  if (!duration || time < start || time >= start + duration) return null;
  return Math.max(0, Number(track.trimIn) || 0) + (time - start);
}

export function timelineAudioTracksAtPlayhead(tracks, playhead) {
  return (tracks || []).filter(track => timelineAudioSourceTime(track, playhead) !== null);
}

export function nextTimelinePlayhead(playhead, elapsedSeconds, duration) {
  return Math.min(Math.max(0, Number(duration) || 0), Math.max(0, Number(playhead) || 0) + Math.max(0, Number(elapsedSeconds) || 0));
}

export function seekVideoToTimelinePlayhead(video, track, playhead) {
  if (!video || video.readyState < 1) return false;
  const sourceTime = timelineVideoSourceTime(track, playhead);
  if (sourceTime === null || Math.abs(video.currentTime - sourceTime) < 0.001) return false;
  try {
    video.currentTime = sourceTime;
    return true;
  } catch {
    return false;
  }
}
