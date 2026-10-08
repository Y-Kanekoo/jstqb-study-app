import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const expoRoot = dirname(require.resolve('expo/package.json'));
const out = resolve(process.argv[2]);
mkdirSync(dirname(out), { recursive: true });
// Use Expo's Metro bootstrap, as the application export does, including its resolver setup.
execFileSync(process.execPath, [resolve(expoRoot, 'bin/cli'), 'export:embed',
  '--entry-file', 'scripts/fixtures/uri-query-metro-entry.js', '--platform', 'web',
  '--bundle-output', out, '--dev', 'false', '--max-workers', '2'], { stdio: 'inherit' });
