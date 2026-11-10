import { sourceSignature } from './scripts/verify-apk-launcher-composition.mjs';
const pairs = process.argv.slice(2);
for (const g of pairs) {
  const s = sourceSignature(`/tmp/nx-fg-${g}.png`);
  console.log(`gap ${g}: fg bands=${s.bands} aspect=${s.aspect.toFixed(3)} shares=${s.fractions.map(x=>x.toFixed(3)).join(',')}`);
}
