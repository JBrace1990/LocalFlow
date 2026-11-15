import test from 'node:test';
import assert from 'node:assert/strict';

const comfyRuntimeArgs = await import('../comfy-runtime-args.js').catch(() => ({}));

test('routes a managed ComfyUI process through Local Flow input, media, and temp folders', () => {
  assert.equal(typeof comfyRuntimeArgs.buildManagedComfyArgs, 'function');

  const configured = [
    'main.py', '--listen', '127.0.0.1', '--port', '8188',
    '--output-directory', 'C:\\Comfy\\output', '--disable-pinned-memory',
  ];
  const result = comfyRuntimeArgs.buildManagedComfyArgs(configured, {
    inputDirectory: 'C:\\LocalFlow\\comfy-input',
    outputDirectory: 'C:\\LocalFlow\\comfy-output',
    tempDirectory: 'C:\\LocalFlow\\comfy-temp',
  });

  assert.deepEqual(result, [
    'main.py', '--listen', '127.0.0.1', '--port', '8188',
    '--output-directory', 'C:\\LocalFlow\\comfy-output', '--disable-pinned-memory',
    '--input-directory', 'C:\\LocalFlow\\comfy-input',
    '--temp-directory', 'C:\\LocalFlow\\comfy-temp',
  ]);
  assert.deepEqual(configured, [
    'main.py', '--listen', '127.0.0.1', '--port', '8188',
    '--output-directory', 'C:\\Comfy\\output', '--disable-pinned-memory',
  ]);
});

test('replaces equals-form directory flags and repairs flags missing their value', () => {
  const result = comfyRuntimeArgs.buildManagedComfyArgs([
    'main.py', '--input-directory=old-input', '--output-directory', '--disable-pinned-memory',
  ], {
    inputDirectory: 'C:\\LocalFlow\\input',
    outputDirectory: 'C:\\LocalFlow\\media',
    tempDirectory: 'C:\\LocalFlow\\temp',
  });

  assert.deepEqual(result, [
    'main.py', '--input-directory=C:\\LocalFlow\\input',
    '--output-directory', 'C:\\LocalFlow\\media', '--disable-pinned-memory',
    '--temp-directory', 'C:\\LocalFlow\\temp',
  ]);
});
