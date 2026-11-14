export function uniqueComfyReferenceSlots(slots = []) {
  const seen = new Set();
  const unique = [];
  for (const slot of slots) {
    const comfyInputName = String(slot?.comfyInputName || '').trim();
    if (!comfyInputName) continue;
    const assignment = slot.assignment || {};
    const role = String(assignment.roleName || assignment.role || 'visual guide').trim().toLocaleLowerCase();
    const key = `${comfyInputName.toLocaleLowerCase()}\u0000${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...slot,
      assignment: { ...assignment, slot: unique.length + 1 },
    });
  }
  return unique;
}
