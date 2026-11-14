export function projectScopedImageMedia(media = [], projectId = '') {
  const selectedProjectId = String(projectId || '');
  if (!selectedProjectId) return [];
  return (Array.isArray(media) ? media : []).filter(item => {
    if (item?.kind !== 'Image' || !item.url) return false;
    if (String(item.projectId || '') === selectedProjectId) return true;
    return Array.isArray(item.associations)
      && item.associations.some(association => String(association?.projectId || '') === selectedProjectId);
  });
}
