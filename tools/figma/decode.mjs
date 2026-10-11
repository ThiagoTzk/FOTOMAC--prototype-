// Decodes the downloaded Figma file (.fig) into .cache/nodes.json, readable by dump.py.
//
//   node decode.mjs "../../FOTOMAC (Copy) (Copy).fig"
//
// A .fig is a zip whose canvas.fig holds: "fig-kiwi" + version + [schema chunk (deflate)]
// + [data chunk (zstd)]. The schema describes the binary format, so the data is decoded
// with Evan Wallace's kiwi library (the format's author) — no reverse engineering by hand.
// Needs the `unzip` and `zstd` command-line tools (brew install zstd).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { compileSchema, decodeBinarySchema } from 'kiwi-schema';

const figPath = process.argv[2] ?? '../../FOTOMAC (Copy) (Copy).fig';
mkdirSync('.cache', { recursive: true });
const canvas = execFileSync('unzip', ['-p', figPath, 'canvas.fig'], { maxBuffer: 1 << 30 });
if (canvas.subarray(0, 8).toString() !== 'fig-kiwi') throw new Error('not a fig-kiwi file');

const chunks = [];
for (let off = 12; off < canvas.length;) {
  const n = canvas.readUInt32LE(off);
  chunks.push(canvas.subarray(off + 4, off + 4 + n));
  off += 4 + n;
}
const schema = compileSchema(decodeBinarySchema(inflateRawSync(chunks[0])));
writeFileSync('.cache/data.zst', chunks[1]);
const data = execFileSync('zstd', ['-d', '-c', '-q', '.cache/data.zst'], { maxBuffer: 1 << 30 });
const message = schema.decodeMessage(data);

// Image hashes (20 bytes) become hex: they are the file names inside the .fig's images/ folder.
const replacer = (_, v) => {
  if (v instanceof Uint8Array) return v.length === 20 ? Buffer.from(v).toString('hex') : `<${v.length} bytes>`;
  return typeof v === 'bigint' ? v.toString() : v;
};
writeFileSync('.cache/nodes.json', JSON.stringify(message.nodeChanges, replacer));
console.log(`${message.nodeChanges.length} camadas decodificadas em tools/figma/.cache/nodes.json`);
