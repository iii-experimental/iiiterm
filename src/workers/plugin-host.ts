import { readdir, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { iiitermHost } from '../host.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { expand } from '../paths.js';
import type { PluginContext, PluginModule } from '../plugins/contract.js';
import { writeSession } from '../state.js';

const PLUGINS_DIR = expand(process.env.IIITERM_PLUGINS_DIR ?? '~/.config/iiiterm/plugins');

async function loadPlugins(ctx: PluginContext): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(PLUGINS_DIR);
  } catch {
    return [];
  }
  const loaded: string[] = [];
  for (const name of entries) {
    const full = join(PLUGINS_DIR, name);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    const target = s.isDirectory() ? join(full, 'index.js') : full;
    if (!target.endsWith('.js') && !target.endsWith('.mjs')) continue;
    try {
      const mod = (await import(pathToFileURL(target).href)) as PluginModule;
      if (typeof mod.default !== 'function') continue;
      await mod.default(ctx);
      loaded.push(mod.name ?? name);
    } catch (err) {
      process.stderr.write(`[iiiterm/plugin-host] ${name} failed: ${String(err)}\n`);
    }
  }
  return loaded;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-plugin-host' });
  attachSdkShutdown(iii);

  const ctx: PluginContext = {
    iii,
    stateScope: cfg.stateScope,
    engineUrl: cfg.engineUrl,
    host: iiitermHost(),
    writeSession: (s) => writeSession(iii, cfg.stateScope, s),
    log: (c, info) => process.stderr.write(`[iiiterm/plugin] ${c}${info ? ' ' + String(info) : ''}\n`),
  };
  const loaded = await loadPlugins(ctx);
  process.stdout.write(
    `[iiiterm] plugin-host up · dir ${PLUGINS_DIR} · loaded [${loaded.join(', ') || 'none'}]\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] plugin-host failed: ${String(err)}\n`);
  process.exit(1);
});
