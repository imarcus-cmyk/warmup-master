import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const DEFAULT_PLATFORMS = ['instagram', 'twitter', 'youtube', 'tiktok', 'reddit'];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function minutesEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function platformsFromEnv() {
  const raw = process.env.WARMUP_DAILY_PLATFORMS;
  if (!raw) return DEFAULT_PLATFORMS;
  return raw
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);
}

function shuffled(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function runOrchestrator(args, label) {
  console.log(`\n[${new Date().toISOString()}] starting ${label}`);

  if (process.env.WARMUP_DAILY_DRY_RUN) {
    console.log(`[dry-run] node src/orchestrator.js ${args.join(' ')}`);
    return Promise.resolve(0);
  }

  return new Promise(resolve => {
    const child = spawn(process.execPath, ['src/orchestrator.js', ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });

    child.on('close', code => {
      console.log(`[${new Date().toISOString()}] ${label} exited with code ${code}`);
      resolve(code || 0);
    });
    child.on('error', err => {
      console.error(`[${new Date().toISOString()}] ${label} failed to start: ${err.message}`);
      resolve(1);
    });
  });
}

const runPlatform = platform => runOrchestrator([platform], platform);

await mkdir('logs', { recursive: true });

const firstDelayMin = minutesEnv('WARMUP_DAILY_FIRST_DELAY_MIN', 3);
const firstDelayMax = minutesEnv('WARMUP_DAILY_FIRST_DELAY_MAX', 15);
const gapMin = minutesEnv('WARMUP_DAILY_GAP_MIN', 8);
const gapMax = minutesEnv('WARMUP_DAILY_GAP_MAX', 15);
const order = shuffled(platformsFromEnv());

console.log(`[${new Date().toISOString()}] daily warmup scheduler launched`);
console.log(`platform order: ${order.join(' -> ')}`);
console.log(`first delay: ${firstDelayMin}-${firstDelayMax}m; between-platform gap: ${gapMin}-${gapMax}m`);

const firstDelay = rand(firstDelayMin, firstDelayMax);
console.log(`sleeping ${firstDelay}m before first platform`);
await sleep(firstDelay * 60 * 1000);

// Catch GoLogin profiles that match no platform before the cycle — they would
// otherwise be silently skipped and never warmed.
await runOrchestrator(['--check-unclassified'], 'unclassified-check');

let failures = 0;
for (let i = 0; i < order.length; i++) {
  const code = await runPlatform(order[i]);
  if (code !== 0) failures++;

  if (i < order.length - 1) {
    const gap = rand(gapMin, gapMax);
    console.log(`sleeping ${gap}m before next platform`);
    await sleep(gap * 60 * 1000);
  }
}

console.log(`[${new Date().toISOString()}] daily warmup scheduler done; failures=${failures}`);
process.exit(failures ? 1 : 0);
