const fs = require('fs');
const path = require('path');
const os = require('os');
const { dedupeKeepOrder } = require('../../shared/list');

const USER_EXCLUDE = new Set(['All Users', 'Default', 'Default User', 'Public']);

function discoverComfyInstallations() {
  const profileRoots = getProfileRoots();
  const directCandidates = getDirectCandidates(profileRoots);

  const installPaths = new Set();
  for (const candidate of directCandidates) {
    if (safeExists(candidate)) {
      const resolved = resolveComfyRoot(candidate);
      if (resolved) {
        installPaths.add(resolved);
      }
    }
  }

  for (const root of profileRoots.map((p) => p.localAppData).filter(Boolean)) {
    for (const found of findComfyByShallowScan(root)) {
      installPaths.add(found);
    }
  }

  for (const found of findComfyPerInstall(profileRoots)) {
    installPaths.add(found);
  }

  const discovered = [];
  for (const installPath of installPaths) {
    const checkpointsDir = path.join(installPath, 'models', 'checkpoints');
    const vaeDir = path.join(installPath, 'models', 'vae');
    const controlnetDir = path.join(installPath, 'models', 'controlnet');
    if (!safeExists(checkpointsDir)) {
      continue;
    }

    const checkpoints = fs
      .readdirSync(checkpointsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(safetensors|ckpt|pt)$/i.test(name))
      .sort((a, b) => a.localeCompare(b));

    const vaes = safeExists(vaeDir)
      ? fs
          .readdirSync(vaeDir, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .filter((name) => /\.(safetensors|ckpt|pt)$/i.test(name))
          .sort((a, b) => a.localeCompare(b))
      : [];

    const controlnets = safeExists(controlnetDir)
      ? fs
          .readdirSync(controlnetDir, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .filter((name) => /\.(safetensors|ckpt|pt)$/i.test(name))
          .sort((a, b) => a.localeCompare(b))
      : [];

    discovered.push({
      path: installPath,
      checkpointsDir,
      checkpoints,
      vaeDir,
      vaes,
      controlnetDir,
      controlnets
    });
  }

  return discovered.sort((a, b) => b.checkpoints.length - a.checkpoints.length || a.path.localeCompare(b.path));
}

function getProfileRoots() {
  const roots = [];
  const usersRoot = process.platform === 'win32' ? 'C:\\Users' : path.join(os.homedir(), '..');

  if (!safeExists(usersRoot)) {
    return roots;
  }

  for (const entry of fs.readdirSync(usersRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || USER_EXCLUDE.has(entry.name)) {
      continue;
    }

    const profile = path.join(usersRoot, entry.name);
    roots.push({
      profile,
      localAppData: path.join(profile, 'AppData', 'Local'),
      roamingAppData: path.join(profile, 'AppData', 'Roaming')
    });
  }

  return roots;
}

function getDirectCandidates(profileRoots) {
  const cwdRoot = path.resolve(__dirname, '..', '..', '..');

  const fromProfiles = profileRoots.flatMap((p) => [
    path.join(p.profile, 'ComfyUI'),
    path.join(p.profile, 'comfyui'),
    path.join(p.localAppData, 'ComfyUI'),
    path.join(p.localAppData, 'ComfyUI-Launcher'),
    path.join(p.localAppData, 'comfyui-desktop'),
    path.join(p.localAppData, 'Comfy-Desktop'),
    path.join(p.localAppData, 'Comfy-Desktop', 'ComfyUI-Installs', 'ComfyUI', 'ComfyUI'),
    path.join(p.localAppData, 'Programs', 'ComfyUI'),
    path.join(p.localAppData, 'Programs', 'comfyui'),
    path.join(p.localAppData, 'Programs', '@comfyorgcomfyui-electron', 'resources', 'ComfyUI'),
    path.join(p.localAppData, 'Programs', 'ComfyUI-Desktop', 'resources', 'ComfyUI'),
    path.join(p.roamingAppData, 'Comfy Desktop')
  ]);

  return dedupeKeepOrder([
    process.env.COMFYUI_PATH || '',
    path.join(cwdRoot, 'ComfyUI'),
    path.join(cwdRoot, 'ComfyUI_windows_portable', 'ComfyUI'),
    path.join(cwdRoot, 'comfyui'),
    'C:\\ComfyUI',
    ...fromProfiles
  ]).filter(Boolean);
}

function resolveComfyRoot(candidate) {
  const direct = path.join(candidate, 'models', 'checkpoints');
  if (safeExists(direct)) {
    return candidate;
  }

  const nested = path.join(candidate, 'ComfyUI');
  if (safeExists(path.join(nested, 'models', 'checkpoints'))) {
    return nested;
  }

  return null;
}

function findComfyByShallowScan(root) {
  const results = [];
  if (!safeExists(root)) {
    return results;
  }

  const queue = [{ dir: root, depth: 0 }];
  const maxDepth = 4;

  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    if (depth > maxDepth) {
      continue;
    }

    const entries = safeReadDirs(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const lower = entry.name.toLowerCase();

      if (lower.includes('comfy')) {
        const resolved = resolveComfyRoot(full);
        if (resolved) {
          results.push(resolved);
        }
      }

      if (depth < maxDepth && shouldDescend(entry.name, depth)) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }

  return dedupeKeepOrder(results);
}

function findComfyPerInstall(profileRoots) {
  const results = [];
  for (const p of profileRoots.filter((r) => r.localAppData)) {
    const installsRoot = path.join(p.localAppData, 'Comfy-Desktop', 'ComfyUI-Installs');
    if (!safeExists(installsRoot)) {
      continue;
    }
    for (const entry of safeReadDirs(installsRoot)) {
      const resolved = resolveComfyRoot(path.join(installsRoot, entry.name));
      if (resolved) {
        results.push(resolved);
      }
    }
  }
  return dedupeKeepOrder(results);
}

function shouldDescend(name, depth) {
  const lower = name.toLowerCase();
  if (lower === 'temp' || lower === 'tmp' || lower === 'node_modules' || lower === 'cache') {
    return false;
  }
  if (depth <= 1) {
    return true;
  }
  return (
    lower.includes('comfy') || lower.includes('programs') || lower.includes('resources') || lower.includes('installs')
  );
}

function safeReadDirs(targetPath) {
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return [];
  }
}

function safeExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

module.exports = {
  discoverComfyInstallations
};
