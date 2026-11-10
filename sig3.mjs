import { sourceSignature } from './scripts/verify-apk-launcher-composition.mjs';
for (const f of process.argv.slice(2)) {
  const s = sourceSignature(f);
  console.log(`${f.split('/').pop().padEnd(30)} bands=${s.bands} aspect=${s.aspect.toFixed(3)} shares=${s.fractions.map(x=>x.toFixed(3)).join(',')}`);
}
