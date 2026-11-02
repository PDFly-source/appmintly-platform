import fs from 'node:fs';
const [,,src,dest]=process.argv;
const next=JSON.parse(fs.readFileSync(src,'utf8'));
let prev=null;
try{ prev=JSON.parse(fs.readFileSync(dest,'utf8')); }catch{}
if(prev&&typeof prev.serverTime==='number'&&typeof next.serverTime==='number'&&next.serverTime<prev.serverTime){
  console.log('refusing to overwrite newer feed'); process.exit(0);
}
if(prev&&prev.events?.length>0&&next.events.length===0){
  console.log('refusing to overwrite non-empty feed with empty set'); process.exit(0);
}
const out={...next,meta:{serverTime:next.serverTime,source:'do',generatedAt:new Date().toISOString()}};
fs.writeFileSync(dest+'.tmp',JSON.stringify(out,null,2)); fs.renameSync(dest+'.tmp',dest);
console.log('wrote',dest,'events:',next.events.length);
