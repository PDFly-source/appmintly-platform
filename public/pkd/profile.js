/* PKD 3D profile engine — adapted from the supplied PKD design source.
 * Data layer reads window.__PKD_DATA__ (injected by the React page from the
 * live AppMintly catalog); all visual effects, the Three.js scene and the
 * showcase behaviour are preserved verbatim. Added: mount guard, listener
 * registry + teardown, dynamic app count, reduced-motion handling. */
(function(){
if(window.__PKD_ACTIVE__)return;window.__PKD_ACTIVE__=1;
var D=window.__PKD_DATA__||{apps:[],stats:{total:0,published:0,categories:0,latest:'\u2014'},updates:[]};
var APPS=D.apps;
var RM=false;try{RM=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
var L=[];function on(t,e,f,o){t.addEventListener(e,f,o);L.push([t,e,f,o])}
function pad(x){return String(x).padStart(2,'0')}
var $=function(i){return document.getElementById(i)};
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.classList.add('in')})},{threshold:.12});
document.querySelectorAll('.rv').forEach(function(el){io.observe(el)});
document.querySelectorAll('[data-n]').forEach(function(el){var n=+el.dataset.n,i=0,iv=setInterval(function(){el.textContent=++i;if(i>=n)clearInterval(iv)},200)});
document.querySelectorAll('.card').forEach(function(c){on(c,'pointermove',function(e){var b=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-b.left)+'px');c.style.setProperty('--my',(e.clientY-b.top)+'px')})});
var id=$('id');on(id.parentNode,'pointermove',function(e){var b=id.parentNode.getBoundingClientRect(),x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;id.style.transform='rotateY('+x*18+'deg) rotateX('+-y*14+'deg)';id.style.setProperty('--sx',(x+.5)*100+'%');id.style.setProperty('--sy',(y+.5)*100+'%')});
var pf=$('pf');on(pf.parentNode,'pointermove',function(e){var b=pf.parentNode.getBoundingClientRect(),x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;pf.style.transform='rotateY('+x*14+'deg) rotateX('+-y*10+'deg)';pf.style.setProperty('--sx',(x+.5)*100+'%');pf.style.setProperty('--sy',(y+.5)*100+'%')});
on(pf.parentNode,'pointerleave',function(){pf.style.transform=''});
on(id.parentNode,'pointerleave',function(){id.style.transform=''});
var cur=-1,sec=$('apps');
APPS.forEach(function(a,i){var b=document.createElement('button');b.className='tab';b.textContent=a.n;b.onclick=function(){var h=sec.offsetHeight-innerHeight;scrollTo({top:sec.offsetTop+h*(i+.5)/APPS.length})};$('tabs').appendChild(b)});
function show(i){if(i==cur)return;if(!APPS.length||i<0||i>=APPS.length)return;cur=i;var a=APPS[i],s=$('sw');s.classList.add('o');
 setTimeout(function(){$('nm').textContent=a.n;$('ai').src=a.i;$('ad').textContent=a.d;$('vs').textContent=a.v;$('ct').textContent=a.t;$('ty').textContent=a.ty;$('gb').href=a.u;$('an').textContent=pad(i+1)+' / '+pad(APPS.length);var nw=$('nw');if(nw)nw.style.display=a.nw?'':'none';s.classList.remove('o')},220);
 [].forEach.call($('tabs').children,function(t,k){t.className='tab'+(k==i?' on':'')})}
show(0);
(function(){var cg=$('cg');if(!RM)on(window,'pointermove',function(e){cg.style.transform='translate('+(e.clientX-250)+'px,'+(e.clientY-250)+'px)'});
if(!RM)document.querySelectorAll('.btn').forEach(function(b){on(b,'pointermove',function(e){var r=b.getBoundingClientRect();b.style.transform='translate('+((e.clientX-r.left)/r.width-.5)*10+'px,'+((e.clientY-r.top)/r.height-.5)*8+'px)'});on(b,'pointerleave',function(){b.style.transform=''})});
var ids=['about','me','apps','updates','trust'],dt=$('dots');ids.forEach(function(k){var a=document.createElement('a');a.href='#'+k;dt.appendChild(a)});
on(window,'scroll',function(){var y=scrollY+innerHeight*.4,c=-1;ids.forEach(function(k,i){if($(k).offsetTop<=y)c=i});[].forEach.call(dt.children,function(a,i){a.className=i==c?'on':''})},{passive:true})})();
window.__PKD_TEARDOWN__=function(){try{io.disconnect()}catch(e){}L.forEach(function(x){try{x[0].removeEventListener(x[1],x[2],x[3])}catch(e){}});L.length=0;window.__PKD_ACTIVE__=0;delete window.__PKD_TEARDOWN__};
if(!window.THREE)return;
var M=innerWidth<860;
var R=new THREE.WebGLRenderer({canvas:$('gl'),antialias:true,alpha:true});R.setPixelRatio(Math.min(devicePixelRatio,2));R.outputEncoding=THREE.sRGBEncoding;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.1;
var S=new THREE.Scene();S.fog=new THREE.FogExp2(0x07090E,.035);
var C=new THREE.PerspectiveCamera(42,1,.1,100);C.position.z=11;
function rs(){R.setSize(innerWidth,innerHeight);C.aspect=innerWidth/innerHeight;C.updateProjectionMatrix()}rs();on(window,'resize',rs);
// studio environment for glossy reflections
var env=new THREE.Scene();[[0xffffff,0,8,0,10,.3,10],[0x4C8DFF,-8,0,0,.3,8,8],[0xF5B50A,8,1,2,.3,6,6],[0x7DD3FC,0,-6,4,9,.3,6],[0xffffff,0,2,-9,12,8,.3]].forEach(function(p){var m=new THREE.Mesh(new THREE.BoxGeometry(p[4],p[5],p[6]),new THREE.MeshBasicMaterial({color:p[0]}));m.position.set(p[1],p[2],p[3]);env.add(m)});
var pm=new THREE.PMREMGenerator(R);S.environment=pm.fromScene(env,.03).texture;
var L1=new THREE.PointLight(0x4C8DFF,2.5,30),L2=new THREE.PointLight(0xF5B50A,1.6,30);S.add(L1,L2);
var glowT=(function(){var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})();
function itex(src){var c=document.createElement('canvas');c.width=c.height=256;var x=c.getContext('2d'),t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;
 function neutral(){x.clearRect(0,0,256,256);x.fillStyle='#1d2538';x.fillRect(0,0,256,256);x.fillStyle='#EEF2FA';x.font='700 120px Inter,Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('A',128,136);t.needsUpdate=true}
 function clipDraw(im){x.clearRect(0,0,256,256);x.save();x.beginPath();x.moveTo(60,0);x.arcTo(256,0,256,256,56);x.arcTo(256,256,0,256,56);x.arcTo(0,256,0,0,56);x.arcTo(0,0,256,0,56);x.clip();x.drawImage(im,0,0,256,256);x.restore();try{x.getImageData(0,0,1,1)}catch(e){neutral()}t.needsUpdate=true}
 var im=new Image();im.crossOrigin='anonymous';im.onload=function(){clipDraw(im)};im.onerror=function(){neutral()};im.src=src;return t}
var G=new THREE.Group(),ring=new THREE.Group(),tiles=[];G.add(ring);S.add(G);
var NA=APPS.length; /* named NA: the dust field below declares var N=1100 */APPS.forEach(function(a,i){var an=i/Math.max(NA,1)*Math.PI*2,g=new THREE.Group();
 g.add(new THREE.Mesh(new THREE.BoxGeometry(2.1,2.1,.24),new THREE.MeshPhysicalMaterial({color:0x1d2538,metalness:1,roughness:.16,clearcoat:1,clearcoatRoughness:.1,envMapIntensity:1.3})));
 var p=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.8),new THREE.MeshBasicMaterial({map:itex(a.i),transparent:true}));p.position.z=.13;g.add(p);
 var s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowT,color:a.g,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false}));s.scale.set(5.5,5.5,1);s.position.z=-.6;g.add(s);
 g.position.set(Math.sin(an)*3.8,0,Math.cos(an)*3.8);g.rotation.y=an;ring.add(g);tiles.push(g)});
var orb=new THREE.Mesh(new THREE.TorusGeometry(3.8,.014,8,200),new THREE.MeshBasicMaterial({color:0x7DD3FC,transparent:true,opacity:.5}));orb.rotation.x=Math.PI/2;orb.position.y=-1.7;ring.add(orb);
var cr=new THREE.Group(),gm=new THREE.Mesh(new THREE.OctahedronGeometry(1,0),new THREE.MeshPhysicalMaterial({color:0x4C8DFF,metalness:.95,roughness:.06,flatShading:true,clearcoat:1,envMapIntensity:1.8}));gm.scale.y=1.45;
var wf=new THREE.Mesh(new THREE.OctahedronGeometry(1.4,1),new THREE.MeshBasicMaterial({color:0x7DD3FC,wireframe:true,transparent:true,opacity:.28}));wf.scale.y=1.45;
var gs=new THREE.Sprite(new THREE.SpriteMaterial({map:glowT,color:0x4C8DFF,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));gs.scale.set(6,6,1);
cr.add(gm,wf,gs);G.add(cr);
var N=1100,pa=new Float32Array(N*3);for(var i=0;i<N*3;i++)pa[i]=(Math.random()-.5)*(i%3==2?50:40);
var pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pa,3));
var dust=new THREE.Points(pg,new THREE.PointsMaterial({color:0x9CC2FF,size:.05,transparent:true,opacity:.6,depthWrite:false,blending:THREE.AdditiveBlending}));S.add(dust);
var tp=0,sp=0,mx=0,my=0,rot=0,gz=0,gy=0,gsc=1,clk=new THREE.Clock(),ST=NA>0?Math.PI*2/NA:0,raf=0;
on(window,'scroll',function(){var h=document.documentElement.scrollHeight-innerHeight;tp=h>0?scrollY/h:0;var pgE=$('pg');if(pgE)pgE.style.transform='scaleX('+tp+')'},{passive:true});
if(!RM)on(window,'pointermove',function(e){mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5});
function loop(){raf=requestAnimationFrame(RM?function(){setTimeout(loop,150)}:loop);var t=RM?0:clk.getElapsedTime();sp+=(tp-sp)*.06;
 var top=sec.offsetTop,h=sec.offsetHeight-innerHeight,pr=(scrollY-top)/h,inA=pr>0&&pr<1,idx=Math.max(0,Math.min(NA-1,Math.floor(pr*Math.max(NA,1))));
 if(pr>-.15&&pr<1.1)show(idx);
 if(inA){var tg=-idx*ST;tg+=Math.round((rot-tg)/(Math.PI*2))*Math.PI*2;rot+=(tg-rot)*.07}else rot-=.0032;
 ring.rotation.y=rot;G.rotation.x=my*.14;G.rotation.z=-mx*.06;var pbE=$('pbu');if(pbE)pbE.style.width=(inA?pr*100:0)+'%';
 var near=inA||scrollY<innerHeight*.55;gz+=((near?0:-10)-gz)*.05;gsc+=((near?1:0)-gsc)*.08;G.visible=gsc>.02;
 var gx=M?0:2.7,ty=M?(inA?2.4:2.9):0;gy+=(ty-gy)*.06;
 G.position.x+=(gx-G.position.x)*.06;G.position.y=gy;G.position.z=gz;G.scale.setScalar((M?.6:1)*Math.max(gsc,.001));
 tiles.forEach(function(g,i){g.position.y=Math.sin(t*1.2+i*1.3)*.12});
 cr.rotation.y=t*.5;cr.position.y=Math.sin(t)*.15;
 L1.position.set(Math.cos(t*.5)*6,3,5);L2.position.set(-Math.cos(t*.4)*6,-2,4);
 dust.rotation.y=t*.01;dust.position.y=sp*8;
 C.position.x+=(mx*1.6-C.position.x)*.04;C.position.y+=(-my*1-C.position.y)*.04;C.lookAt(M?0:1.2,0,0);
 R.render(S,C)}
if(RM){setTimeout(loop,150)}else{loop()}
var prevTD=window.__PKD_TEARDOWN__;
window.__PKD_TEARDOWN__=function(){try{prevTD&&prevTD()}catch(e){}try{cancelAnimationFrame(raf)}catch(e){}try{R.dispose()}catch(e){}try{pm.dispose()}catch(e){}try{S.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(function(mm){if(mm.map)mm.map.dispose();mm.dispose()})}})}catch(e){}};
})();

