import fs from 'node:fs';
const ALLOW=new Set(['eventId','ts','appId','platform','type','version','title','notes']);
const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(!Array.isArray(d.events)) throw new Error('events must be an array');
if(d.events.length>200) throw new Error('too many events');
const seen=new Set(); let prev=-Infinity;
for(const e of d.events){
  for(const k of Object.keys(e)) if(!ALLOW.has(k)) throw new Error('field not allowed: '+k);
  if(typeof e.eventId!=='string'||!e.eventId) throw new Error('bad eventId');
  if(seen.has(e.eventId)) throw new Error('duplicate eventId: '+e.eventId); seen.add(e.eventId);
  if(!Number.isInteger(e.ts)||e.ts<=0) throw new Error('bad ts');
  if(e.ts<prev) throw new Error('not ascending by ts'); prev=e.ts;
}
console.log('valid events:',d.events.length);
