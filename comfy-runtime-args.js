const DIRECTORY_FLAGS = [
  ['--input-directory', 'inputDirectory'],
  ['--output-directory', 'outputDirectory'],
  ['--temp-directory', 'tempDirectory'],
];

/** Clone ComfyUI CLI args and route writable runtime folders to Local Flow. */
export function buildManagedComfyArgs(args, directories) {
  const result = [...(Array.isArray(args) ? args : [])].map(String);

  for (const [flag, key] of DIRECTORY_FLAGS) {
    const directory = directories?.[key];
    if (!directory) continue;

    const equalsIndex = result.findIndex(value => value.startsWith(`${flag}=`));
    if (equalsIndex >= 0) {
      result[equalsIndex] = `${flag}=${directory}`;
      continue;
    }

    const index = result.indexOf(flag);
    if (index >= 0) {
      if (index + 1 < result.length && !result[index + 1].startsWith('--')) result[index + 1] = String(directory);
      else result.splice(index + 1, 0, String(directory));
    } else {
      result.push(flag, String(directory));
    }
  }

  return result;
}
