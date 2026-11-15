export function assetViewGuidance(category, description = '') {
  if (/character/i.test(category || '')) {
    const characterBrief = String(description || '');
    const nonhumanAnimal = /\b(?:fox|wolf|dog|cat|animal|quadruped)\b/i.test(characterBrief) && !/\b(?:anthropomorphic|humanoid|human form|two-legged|bipedal)\b/i.test(characterBrief);
    if (nonhumanAnimal) {
      return 'Create one canonical full-body animal character design reference. Preserve natural four-legged animal anatomy and proportions; show the animal on all four paws on the ground in a relaxed natural fox-like pose, with the entire body and tail visible. Center it against a plain warm-white background. This is a clean animal design portrait, not a scene illustration. Do not make it anthropomorphic or upright; no human torso, hands, clothing, or standing on hind legs unless the creator explicitly requests those traits. Preserve the specified markings and identity while applying the project art style. No scenery, extra animals, duplicate bodies, inset portraits, multiple views, panels, labels, captions, logos, or readable text.';
    }
    return 'Create one canonical full-body character design reference: show exactly one character, matching the creator-specified age and appearance. If age is not specified, do not impose a specific age; use a role-appropriate neutral presentation. Show the character head-to-toe in a relaxed neutral standing pose, centered against a plain warm-white background. Show one face and one body only. This is a clean asset portrait for continuity, not a scene illustration or a multi-view turnaround. Preserve the character identity and design details while applying the project art style. No cockpit, scenery, extra people, duplicate bodies, inset portraits, multiple views, panels, labels, captions, logos, or readable text.';
  }
  if (/vehicle|ship/i.test(category || '')) {
    return 'Create one polished anime vehicle design image showing the complete craft in a clear three-quarter view. Preserve the exact silhouette, proportions, markings, engine layout, and color placement. Use a clean neutral background; no inset panels, multiple views, labels, captions, logos, or extra vehicles.';
  }
  if (/location/i.test(category || '')) {
    const creatorRequestedSubject = String(description || '').trim();
    const hasPositiveSubjectRequest = /\b(?:include|show|depict|feature|with)\b.{0,70}\b(?:people|persons?|characters?|animals?|fox(?:es)?|men|women|humans?|vehicles?|ships?|weapons?|props?)\b/i.test(creatorRequestedSubject);
    const explicitlyExcludesSubjects = /\b(?:no|without|exclude|omit|avoid|does not contain|doesn't contain|should not contain|shouldn't contain|do not include|don't include)\b[^.!?;]{0,100}\b(?:people|persons?|characters?|animals?|fox(?:es)?|men|women|humans?|vehicles?|ships?|weapons?|props?)\b/i.test(creatorRequestedSubject);
    const subjectRule = hasPositiveSubjectRequest && !explicitlyExcludesSubjects
      ? 'Include only the people, animals, vehicles, or props directly requested in the location brief. Do not add incidental subjects.'
      : 'No people, characters, animals, vehicles, weapons, or foreground props.';
    return `Create one anime environment-only design reference for the place itself: a clear establishing view with coherent geography, distinctive landmarks, architecture or natural features, background depth, palette, weather, and lighting. ${subjectRule} No collage, labels, captions, logos, or readable text.`;
  }
  if (/wardrobe|uniform|costume/i.test(category || '')) {
    return 'Create a clothing-only flat-lay design image. Show exactly ONE outfit, with each garment shown once: one top, one pair of trousers, and one pair of shoes; add a jacket only if the description specifies one. Lay the separate garments neatly side by side on a plain warm-neutral background so their cut, layers, seams, materials, and color placement are easy to inspect. This image defines clothing only; the character identity is designed separately. Absolutely no person, wearer, face, head, body, mannequin, human silhouette, duplicate garment, second outfit, alternate view, room, prop, collage, label, caption, logo, or story scene.';
  }
  if (/style|art direction|palette/i.test(category || '')) {
    return 'Create one clean, landscape-format modern Japanese anime art-direction reference board, not a story illustration. Show exactly six large, separate, unlabeled color swatches in a simple row, using the palette specified in the art brief. Below them, show only two small abstract rendering samples: hand-inked foliage texture and a cel-shaded warm-to-cool lighting gradient. These are visual material samples, not places or story moments. No people, faces, animals, characters, clothing, vehicles, buildings, props, recognizable landscape, story action, collage, labels, lettering, logos, or readable text.';
  }
  if (/prop/i.test(category || '')) {
    return 'Create one canonical anime prop-design reference, isolated and fully visible against a clean neutral background. Make its silhouette, scale, materials, colors, and distinguishing construction details easy to inspect. Show one object only; no person holding it, duplicates, scene background, collage, labels, captions, logos, or readable text.';
  }
  return 'Create a polished anime production design reference that clearly establishes the exact shape, materials, palette, and distinguishing details. No labels, captions, logos, or unrelated subjects.';
}
