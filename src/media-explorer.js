import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export async function revealMediaInFileManager({
  name,
  mediaFolder,
  trashFolder,
  trash = false,
  platform = process.platform,
  spawnProcess = spawn,
  fsApi = fs,
} = {}) {
  const filename = String(name || '');
  if (!filename || filename === '.' || filename === '..' || /[\\/]/.test(filename) || path.basename(filename) !== filename) {
    throw new Error('A media file name is required.');
  }
  const configuredRoot = trash ? trashFolder : mediaFolder;
  if (!configuredRoot) throw new Error('The media folder is not configured.');
  const root = path.resolve(configuredRoot);
  const filePath = path.resolve(root, filename);
  if (path.dirname(filePath) !== root) throw new Error('The media file name is invalid.');
  const stat = await fsApi.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error('The media file was not found. Refresh the library and try again.');

  let command;
  let args;
  if (platform === 'win32') {
    command = 'explorer.exe';
    args = [`/select,${filePath}`];
  } else if (platform === 'darwin') {
    command = 'open';
    args = ['-R', filePath];
  } else {
    command = 'xdg-open';
    args = [root];
  }
  const child = spawnProcess(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', resolve);
  });
  child.unref?.();
  return { path: filePath };
}
