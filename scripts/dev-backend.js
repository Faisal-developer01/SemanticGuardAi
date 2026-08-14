#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const projectRoot = process.cwd();
const backendCwd = join(projectRoot, 'backend');
const isWin = process.platform === 'win32';

const venvCandidates = [
  join(projectRoot, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python'),
  join(projectRoot, 'venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python'),
];

const globalCandidates = isWin ? ['python', 'py'] : ['python3', 'python'];

function testCandidate(cmd) {
  try {
    const r = spawnSync(cmd, ['--version'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return r.status === 0;
  } catch (e) {
    return false;
  }
}

let pythonCmd = null;

for (const p of venvCandidates) {
  if (existsSync(p)) {
    pythonCmd = p;
    break;
  }
}

if (!pythonCmd) {
  for (const c of globalCandidates) {
    if (testCandidate(c)) {
      pythonCmd = c;
      break;
    }
  }
}

if (!pythonCmd) {
  console.error('No Python interpreter found. Tried venv and global python candidates.');
  console.error('Create a virtualenv (.venv) or ensure python/python3/py is on PATH.');
  process.exit(1);
}

console.log(`Starting backend with Python: ${pythonCmd}`);

const child = spawn(pythonCmd, ['wsgi.py'], { cwd: backendCwd, stdio: 'inherit', shell: false });

child.on('exit', (code) => process.exit(code));
child.on('error', (err) => {
  console.error('Failed to start backend:', err);
  process.exit(1);
});
