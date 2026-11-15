export function finalAssemblyState(shots = [], output = '') {
  const total = shots.length;
  const ready = shots.filter(scene => Boolean(scene?.clip)).length;
  return { ready, total, canAssemble: ready >= 2, complete: Boolean(output) };
}
