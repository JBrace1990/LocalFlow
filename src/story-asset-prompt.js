import { assetViewGuidance } from './asset-view-guidance.js';

export function buildVisualAssetPrompt({
  name = 'Project asset',
  category = 'Other',
  description = '',
  designExpansion = '',
  linkedDesignNotes = '',
  assetStyleNotes = '',
  projectArtDirection = '',
  animeStyleLock = '',
  roleInstructions = '',
} = {}) {
  const viewGuidance = assetViewGuidance(category, description);
  const environmentOnly = /location/i.test(category || '');
  const isolatedCharacterSheet = /character/i.test(category || '');
  const fixedDetails = [
    description,
    !environmentOnly && designExpansion ? `AI-proposed visual choices for this image (art direction, not story canon): ${designExpansion}` : '',
    !environmentOnly && !isolatedCharacterSheet && linkedDesignNotes ? `Linked design assets that must match exactly: ${linkedDesignNotes}.` : '',
    assetStyleNotes ? `Asset-specific rendering and palette guidance: ${assetStyleNotes}.` : '',
    projectArtDirection ? `Project art direction: ${projectArtDirection}.` : '',
  ].filter(Boolean).join(' ');
  const prompt = `Create one original production design image for project asset “${name}”. Asset type: ${category}. ${viewGuidance} Creator canon and completed design brief (preserve stated traits; AI additions are visual proposals only): ${fixedDetails || name}. ${environmentOnly ? 'This is a location background plate. Show the place only; absolutely no people, characters, animals, silhouettes, vehicles, or character turnarounds.' : ''} PROJECT STYLE ANCHORS (highest priority): ${projectArtDirection}. ASSET RENDERING STYLE (apply to the entire output): ${assetStyleNotes || 'Use the same anime rendering language established by the selected style and palette guides.'}. ${animeStyleLock} Treat these as binding generation instructions, not optional notes. Preserve character identity, but render it using the series-wide linework, cel shading, color relationships, material treatment, and lighting specified here. ${roleInstructions} Reference roles are strict: Character identity controls face, hair, age, and build; Uniform / costume controls garment cut, panels, insignia, and equipment; Series art style & palette controls shared linework, cel shading, and palette but never the depicted person or its clothing, insignia, and equipment; Anime style controls linework and rendering; Color palette controls color relationships. Preserve only traits appropriate to each assigned role while creating a newly composed design. Never paste, trace, or copy a reference image layout, pose, labels, background, or unrelated content. Avoid accidental style changes, extra characters, collage panels, and text.`;
  return { fixedDetails, prompt };
}

export function buildArtDirectionAssetPrompt({
  name = 'Series art direction',
  description = '',
  visualStyle = '',
  projectArtDirection = '',
} = {}) {
  const brief = String(description || '').trim();
  const style = String(visualStyle || '').trim();
  const projectStyle = String(projectArtDirection || '').trim();
  const palette = brief.match(/(?:fixed\s+)?palette\s*:\s*([^\.\n]+)/i)?.[1]?.trim();
  const safeProjectStyle = projectStyle
    .split(/[\n.]+/)
    .filter(sentence => !/\b(?:character|people|acting|storytelling|protagonist|cast)\b/i.test(sentence))
    .join('. ')
    .trim();

  return [
    `Create one standalone art-direction sample for project asset “${name}”.`,
    assetViewGuidance('Style', brief),
    palette ? `Creator's fixed palette: ${palette}.` : '',
    style ? `Rendering medium and technique: ${style}.` : '',
    safeProjectStyle ? `Project-wide art direction: ${safeProjectStyle}.` : '',
    'Show only the environment, light, rendering, and color relationships needed to communicate the style. No people, characters, animals, clothing, vehicles, or props. Do not include linked asset identities, character-framing instructions, character sheets, turnarounds, or storyboard action.',
  ].filter(Boolean).join(' ');
}
