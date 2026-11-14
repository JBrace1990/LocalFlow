import { allocateSceneDurations } from './project-setup.js';

const REVISION_FIELDS = ['description', 'prompt', 'assetNames'];

export function resolveStoryboardRevisionSceneIndex(instruction, sceneCount) {
  const text = String(instruction || '');
  const planWide = /\b(?:full[- ]plan|whole[- ]plan|entire storyboard|whole storyboard|all scenes|every scene)\b/i.test(text) ||
    /\b(?:runtime|timing|duration)\b.{0,100}\b(?:across|for)\s+(?:all|every|the entire)\b/i.test(text) ||
    /\b(?:across|among)\s+(?:all|every)\s+(?:existing\s+)?(?:\d+\s+)?(?:scenes|shots)\b/i.test(text);
  if (planWide) return null;

  const match = text.match(/\b(?:scene|shot)\s*#?\s*(\d+)\b/i);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index < Number(sceneCount) ? index : null;
}

export function allocateStoryboardRevisionDurations(scenes, targetDurationSeconds) {
  if (!Array.isArray(scenes) || !scenes.length) return scenes;
  const durations = allocateSceneDurations(targetDurationSeconds, scenes.length);
  if (durations.length !== scenes.length) return scenes;
  return scenes.map((scene, index) => ({ ...scene, duration: durations[index] }));
}

export function mergeStoryboardSceneRevision(scenes, sceneIndex, revision) {
  if (!Array.isArray(scenes) || !Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= scenes.length) {
    throw new Error('The requested scene revision does not match the current storyboard.');
  }
  if (!revision || typeof revision !== 'object' || Array.isArray(revision)) {
    throw new Error('The model did not return a revised scene.');
  }

  const updatedScene = { ...scenes[sceneIndex] };
  for (const field of REVISION_FIELDS) {
    if (Object.hasOwn(revision, field)) updatedScene[field] = revision[field];
  }
  return scenes.map((scene, index) => index === sceneIndex ? updatedScene : scene);
}
