export function canMigrateLegacyStoryChat({ initial, legacyProjectId, activeProjectId } = {}) {
  return Boolean(initial && legacyProjectId && activeProjectId && String(legacyProjectId) === String(activeProjectId));
}
