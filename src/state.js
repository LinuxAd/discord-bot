import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const empty = () => ({ seeded: false, seenNews: [], remindedFixtures: [] });

export async function loadState(file) {
  try {
    return { ...empty(), ...JSON.parse(await readFile(file, 'utf8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return empty();
    throw new Error(`Cannot read state file ${file}: ${err.message}`);
  }
}

export async function saveState(file, state) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, file);
}
