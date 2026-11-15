export function modelReferenceGuidance(model) {
  const maxReferences = model?.maxReferences === 0
    ? 0
    : Math.max(1, Number(model?.maxReferences) || 1);

  if (maxReferences === 0) return 'This model does not support visual references.';
  if (model?.referenceSupport) return model.referenceSupport;
  if (maxReferences > 1) return `This model supports up to ${maxReferences} selected visual references.`;
  return 'The local workflow uses one reference frame.';
}
