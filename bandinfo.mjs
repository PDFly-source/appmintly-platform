import { readPng, bands } from './scripts/lib/png-bands.mjs';
for (const f of process.argv.slice(2)) {
  const img = readPng(f);
  const b = bands(img, { threshold: 0.0015, gapFraction: 0.002 });
  console.log(f.split('/').pop(), 'size', img.width+'x'+img.height);
  b.forEach((x,i)=>console.log(`  band${i} y ${x.y0}-${x.y1} h=${x.y1-x.y0} x ${x.x0}-${x.x1} w=${x.x1-x.x0}`));
  for (let i=1;i<b.length;i++) console.log(`  gap${i} = ${b[i].y0-b[i-1].y1}px`);
}
