/**
 * PKD 3D profile page styles — verbatim from the supplied PKD design source
 * (scoped: body/nav/main/footer rules carry .pkd-* prefixes so they cannot
 * leak into the AppMintly chrome; reduced-motion + host padding fixes appended).
 */
export const PKD_CSS = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap');

:root{--bg:#07090E;--card:rgba(22,27,40,.55);--fg:#EEF2FA;--mute:#8B95A9;--blue:#4C8DFF;--cy:#7DD3FC;--green:#1FA56B;--gold:#F5B50A;--line:rgba(255,255,255,.09);
box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
html{scroll-padding-top:env(safe-area-inset-top,0px);scroll-behavior:smooth}
*{box-sizing:border-box;margin:0}
body.pkd-page{background:var(--bg);color:var(--fg);font-family:Inter,system-ui,sans-serif;line-height:1.6;overflow-x:hidden}
h1,h2,h3,.logo{font-family:'Space Grotesk',Inter,system-ui,sans-serif;letter-spacing:-.035em}
#gl{position:fixed;inset:0;width:100%;height:100%;z-index:0}
.bgf{position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(800px 600px at 85% 15%,rgba(76,141,255,.18),transparent 70%),radial-gradient(600px 500px at 5% 85%,rgba(245,181,10,.08),transparent 70%),linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px) 0 0/80px 80px,linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px) 0 0/80px 80px;-webkit-mask:radial-gradient(ellipse at 50% 40%,#000 30%,transparent 85%);mask:radial-gradient(ellipse at 50% 40%,#000 30%,transparent 85%)}
body.pkd-page::after{content:"";position:fixed;inset:0;z-index:6;pointer-events:none;opacity:.06;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
#pg{position:fixed;top:0;left:0;right:0;height:2px;z-index:30;background:linear-gradient(90deg,var(--blue),var(--gold));transform-origin:0 50%;transform:scaleX(0)}
.pkd-nav{position:fixed;top:env(safe-area-inset-top,0px);left:0;right:0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:14px 5vw;backdrop-filter:blur(18px);background:rgba(7,9,14,.55);border-bottom:1px solid var(--line)}
.logo{font-weight:700;font-size:1.25rem;display:flex;align-items:center;gap:8px}
.lk{display:flex;gap:30px}.lk a{color:var(--mute);text-decoration:none;font-size:.9rem;transition:.3s}.lk a:hover{color:var(--fg)}
.vb{width:1em;height:1em;vertical-align:-.12em;display:inline-block;color:var(--blue);filter:drop-shadow(0 0 8px rgba(76,141,255,.7))}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:999px;font-weight:500;font-size:.92rem;text-decoration:none;transition:.3s;border:0;cursor:pointer;font-family:inherit;position:relative;overflow:hidden}
.btn.p{background:linear-gradient(135deg,#27C07F,#14804F);color:#fff;box-shadow:0 8px 34px rgba(31,165,107,.35),inset 0 1px 0 rgba(255,255,255,.3)}
.btn.p::after{content:"";position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent);transform:skewX(-20deg);animation:sh 4.5s infinite}
@keyframes sh{0%,60%{left:-80%}100%{left:140%}}
.btn.p:hover{transform:translateY(-3px);box-shadow:0 14px 50px rgba(31,165,107,.6)}
.btn.g{border:1px solid var(--line);color:var(--fg);background:rgba(255,255,255,.05);backdrop-filter:blur(10px)}.btn.g:hover{border-color:var(--blue)}
.pkd-main{position:relative;z-index:5}
section{padding:120px 6vw 90px;max-width:1240px;margin:auto}
.hero{min-height:100vh;display:flex;flex-direction:column;justify-content:center}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;font-size:.76rem;letter-spacing:.12em;text-transform:uppercase;font-weight:500;border:1px solid var(--line);background:rgba(255,255,255,.05);backdrop-filter:blur(10px)}
.chip.g{border-color:rgba(245,181,10,.45);background:rgba(245,181,10,.1);color:var(--gold)}.chip.b{border-color:rgba(76,141,255,.45);background:rgba(76,141,255,.1);color:var(--cy)}
h1{font-size:clamp(5rem,17vw,11rem);line-height:.92;font-weight:700;display:flex;align-items:flex-start;gap:.06em;background:linear-gradient(180deg,#fff 20%,#9DB7E6 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
h1 .vb{width:.2em;height:.2em;margin-top:.1em;-webkit-text-fill-color:initial}
.sub{font-family:'Space Grotesk',sans-serif;font-size:clamp(1.15rem,2.6vw,1.8rem);margin-top:14px}.sub b{background:linear-gradient(90deg,var(--blue),var(--cy));-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:500}
.lead{color:var(--mute);font-size:clamp(1rem,1.8vw,1.15rem);max-width:28em;margin:20px 0 34px}
.row{display:flex;gap:14px;flex-wrap:wrap}
.stats{display:flex;flex-wrap:wrap;margin-top:50px;max-width:640px;background:var(--card);border:1px solid var(--line);border-radius:22px;backdrop-filter:blur(20px);overflow:hidden}
.stat{flex:1;min-width:110px;padding:18px 22px;border-right:1px solid var(--line)}.stat:last-child{border:0}
.stat b{display:block;font-family:'Space Grotesk',sans-serif;font-size:1.9rem;line-height:1.1}.stat span{color:var(--mute);font-size:.68rem;letter-spacing:.14em;text-transform:uppercase}
.mq{position:relative;z-index:5;overflow:hidden;border-block:1px solid var(--line);background:rgba(255,255,255,.02);padding:18px 0;-webkit-mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.mq div{display:flex;gap:50px;width:max-content;animation:mq 28s linear infinite;color:var(--mute);font:500 .85rem 'Space Grotesk',sans-serif;letter-spacing:.2em;text-transform:uppercase}
.mq span::before{content:"◆";color:var(--blue);margin-right:50px}@keyframes mq{to{transform:translateX(-50%)}}
.ey{color:var(--blue);font-size:.74rem;letter-spacing:.3em;text-transform:uppercase;margin-bottom:16px;display:flex;align-items:center;gap:12px}.ey::before{content:"";width:34px;height:1px;background:var(--blue)}
h2{font-size:clamp(2.2rem,5.5vw,4rem);line-height:1.04;margin-bottom:38px;max-width:13em}
h2 em{font-style:normal;background:linear-gradient(120deg,var(--blue),var(--cy));-webkit-background-clip:text;background-clip:text;color:transparent}
.ab{display:grid;grid-template-columns:1.05fr 1fr;gap:30px;align-items:center}
.idw{perspective:1100px}
.id{position:relative;border-radius:30px;padding:30px;aspect-ratio:1.58;min-height:260px;background:linear-gradient(135deg,rgba(76,141,255,.4),rgba(18,22,34,.92) 48%,rgba(245,181,10,.3));border:1px solid rgba(255,255,255,.22);box-shadow:0 40px 90px rgba(0,0,0,.6),0 0 80px rgba(76,141,255,.2),inset 0 1px 0 rgba(255,255,255,.3);overflow:hidden;transition:transform .15s;display:flex;flex-direction:column;justify-content:space-between}
.id::before{content:"";position:absolute;inset:0;background:radial-gradient(400px circle at var(--sx,30%) var(--sy,0%),rgba(255,255,255,.22),transparent 55%);pointer-events:none}
.id .t{color:var(--gold);font-size:.7rem;letter-spacing:.25em;font-weight:500}
.id .mid{display:flex;align-items:center;gap:18px}
.av{width:76px;height:76px;border-radius:20px;background:#232a3a;display:grid;place-items:center;font:700 1.9rem 'Space Grotesk',sans-serif;border:1px solid var(--line)}
.id h3{font-size:2.2rem;line-height:1}.id p{color:#b6c0d4;font-size:.85rem;margin-top:6px}
.id .b{display:flex;justify-content:space-between;font-size:.72rem;color:#b6c0d4;letter-spacing:.1em}
.rl{display:grid;gap:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:26px;padding:28px;backdrop-filter:blur(20px);position:relative;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);transition:.4s}
.card:hover{border-color:rgba(76,141,255,.55);transform:translateY(-5px)}
.card::before{content:"";position:absolute;inset:0;background:radial-gradient(320px circle at var(--mx,50%) var(--my,0),rgba(76,141,255,.17),transparent 60%);opacity:0;transition:.3s;pointer-events:none}.card:hover::before{opacity:1}
.card h3{font-size:1.5rem;margin:12px 0 6px;position:relative}.card p,.card li{color:var(--mute);font-size:.94rem;position:relative}
.card ul{list-style:none;padding:0;margin-top:12px;display:grid;gap:6px}.card li::before{content:"✓";color:var(--green);margin-right:10px}
.ico{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:rgba(76,141,255,.15);color:var(--blue);font-size:1.3rem;position:relative}
.three{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
#apps{height:520vh;max-width:none;padding:0;position:relative}
.stk{position:sticky;top:0;height:100vh;display:flex;align-items:center;padding:90px 6vw 40px;max-width:1240px;margin:auto}
.pn{width:min(490px,100%);background:var(--card);border:1px solid var(--line);border-radius:32px;padding:30px;backdrop-filter:blur(26px);box-shadow:0 30px 90px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.12)}
.pn .n{font-family:'Space Grotesk',sans-serif;color:var(--mute);font-size:.78rem;letter-spacing:.22em;display:flex;justify-content:space-between}
.hd{display:flex;align-items:center;gap:16px;margin:14px 0 4px}
.hd img{width:68px;height:68px;border-radius:18px;border:1px solid var(--line);box-shadow:0 8px 30px rgba(0,0,0,.5)}
.pn h3{font-size:clamp(2rem,4.6vw,3rem);line-height:1.05}
.by{color:var(--mute);display:flex;align-items:center;gap:6px;font-size:.92rem}
.tags{display:flex;gap:8px;margin:16px 0}.tg{padding:5px 12px;border-radius:9px;font-size:.7rem;letter-spacing:.1em;font-weight:500;text-transform:uppercase}
.tg.b{background:rgba(76,141,255,.15);color:var(--blue);border:1px solid rgba(76,141,255,.35)}.tg.n{background:rgba(31,165,107,.15);color:#3FD797;border:1px solid rgba(31,165,107,.4)}
#ad{color:var(--mute);min-height:4.8em;margin-bottom:16px}
.ft{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:16px;border-top:1px solid var(--line)}.ft b{display:block;font-size:.96rem}.ft small{color:var(--mute);font-size:.8rem}
.tabs{display:flex;gap:6px;margin-top:18px}
.tab{flex:1;min-width:0;padding:9px 4px;border-radius:11px;border:1px solid var(--line);background:transparent;color:var(--mute);font:500 .68rem Inter,sans-serif;cursor:pointer;transition:.3s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tab.on{background:rgba(76,141,255,.2);border-color:var(--blue);color:var(--fg)}
.sw{transition:opacity .3s,transform .3s}.sw.o{opacity:0;transform:translateY(10px)}
.tl{border-left:1px solid var(--line);margin-left:8px;display:grid;gap:16px;max-width:740px}
.ti{display:flex;align-items:center;gap:16px;padding:16px 22px;margin-left:26px;position:relative;background:var(--card);border:1px solid var(--line);border-radius:20px;backdrop-filter:blur(16px)}
.ti::before{content:"";position:absolute;left:-34px;top:50%;width:13px;height:13px;border-radius:50%;background:var(--blue);box-shadow:0 0 18px var(--blue);transform:translateY(-50%)}
.ti img{width:46px;height:46px;border-radius:13px}.ti .a{flex:1}.ti b{font-family:'Space Grotesk',sans-serif;font-size:1.1rem;display:block}.ti small{color:var(--mute)}.ti .r{text-align:right}
.cta{text-align:center;min-height:85vh;display:flex;flex-direction:column;align-items:center;justify-content:center}.cta h2{max-width:11em;font-size:clamp(2.6rem,7vw,5.2rem)}
.pkd-footer{position:relative;z-index:5;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:28px 6vw 48px;border-top:1px solid var(--line);color:var(--mute);font-size:.82rem;background:var(--bg)}
.pkd-footer a{color:var(--mute);margin-left:16px;text-decoration:none}.pkd-footer a:hover{color:var(--fg)}
.rv{opacity:0;transform:translateY(46px);filter:blur(6px);transition:opacity 1s,transform 1s cubic-bezier(.2,.8,.2,1),filter 1s}.rv.in{opacity:1;transform:none;filter:none}
@media(max-width:860px){.lk{display:none}.ab{grid-template-columns:1fr}.stk{align-items:flex-end;padding:80px 4vw 22px}.pn{padding:20px;border-radius:26px}.hd img{width:54px;height:54px}.pn h3{font-size:1.9rem}#ad{min-height:4.4em;font-size:.9rem}.stat{padding:14px}}

.who{display:flex;align-items:center;gap:16px;margin-top:16px}.who .sub{margin:0}
.who .ph{width:62px;height:62px;border-radius:50%;object-fit:cover;object-position:50% 14%;border:2px solid transparent;background:linear-gradient(#07090E,#07090E) padding-box,linear-gradient(135deg,var(--blue),var(--gold)) border-box;box-shadow:0 0 34px rgba(76,141,255,.55);flex:none}
.av{overflow:hidden;padding:0}.av img{width:100%;height:100%;object-fit:cover;object-position:50% 14%}
.me{display:grid;grid-template-columns:.9fr 1.1fr;gap:60px;align-items:center}
.pw{perspective:1200px;position:relative;max-width:440px;width:100%;margin:auto}
.pw::before{content:"";position:absolute;inset:-14% -18%;background:radial-gradient(closest-side,rgba(76,141,255,.4),transparent);filter:blur(36px);animation:gl 6s ease-in-out infinite}
.pw::after{content:"";position:absolute;inset:-6%;border-radius:50%;border:1px dashed rgba(125,211,252,.3);animation:sp 40s linear infinite;pointer-events:none}
@keyframes gl{50%{opacity:.55;transform:scale(1.07)}}@keyframes sp{to{transform:rotate(360deg)}}
.pf{position:relative;border-radius:34px;padding:10px;background:#0b0f19;box-shadow:0 50px 100px rgba(0,0,0,.65),0 0 90px rgba(76,141,255,.25);transition:transform .15s;transform-style:preserve-3d;z-index:1}
.pf .im{position:relative;border-radius:26px;overflow:hidden;aspect-ratio:2/3}
.pf img{width:100%;height:100%;object-fit:cover;display:block}
.pf .im::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(7,9,14,.85)),radial-gradient(400px circle at var(--sx,30%) var(--sy,0%),rgba(255,255,255,.18),transparent 55%)}
.pf .cap{position:absolute;left:22px;right:22px;bottom:20px;z-index:2;transform:translateZ(40px)}
.pf .cap h3{font-size:2rem;line-height:1;display:flex;align-items:center;gap:8px}.pf .cap p{color:#c3cde0;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;margin-top:6px}
.fc{position:absolute;z-index:3;display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:16px;background:rgba(14,18,28,.72);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.16);font-size:.78rem;font-weight:500;box-shadow:0 14px 40px rgba(0,0,0,.5);animation:fl 5s ease-in-out infinite;transform:translateZ(70px)}
.fc.a{top:8%;right:-6%}.fc.b{top:46%;left:-9%;animation-delay:-2s}.fc.c{bottom:20%;right:-7%;animation-delay:-3.5s}
@keyframes fl{50%{translate:0 -10px}}
.me p.t{color:var(--mute);font-size:1.05rem;margin-bottom:16px;max-width:32em}
.fx{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:26px 0 30px;max-width:520px}
.fx div{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 16px;backdrop-filter:blur(16px)}.fx b{display:block;font:700 1.5rem 'Space Grotesk',sans-serif}.fx span{color:var(--mute);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase}
@media(max-width:860px){.me{grid-template-columns:1fr;gap:40px}.pw{max-width:340px}.fc.a{right:-3%}.fc.b{left:-3%}.fc.c{right:-3%}}

.ey{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.72rem}
.ti .r b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--cy);font-size:1rem}.ti .r small{font-family:ui-monospace,Menlo,monospace;font-size:.72rem}
.cmd{margin-top:26px;font:500 .85rem ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mute)}.cmd span:first-child{color:var(--green);margin-right:8px}
.cur{display:inline-block;width:8px;height:1em;background:var(--cy);margin-left:4px;vertical-align:-.15em;animation:bk 1s steps(2) infinite}@keyframes bk{50%{opacity:0}}
.br{position:absolute;width:26px;height:26px;border:2px solid var(--cy);opacity:.7;z-index:4;pointer-events:none}
.br.t1{top:-14px;left:-14px;border-right:0;border-bottom:0;border-radius:10px 0 0 0}.br.t2{top:-14px;right:-14px;border-left:0;border-bottom:0;border-radius:0 10px 0 0}
.br.b1{bottom:-14px;left:-14px;border-right:0;border-top:0;border-radius:0 0 0 10px}.br.b2{bottom:-14px;right:-14px;border-left:0;border-top:0;border-radius:0 0 10px 0}
.sc{position:absolute;left:0;right:0;top:6%;height:2px;background:linear-gradient(90deg,transparent,var(--cy),transparent);box-shadow:0 0 22px var(--cy);animation:scan 5s ease-in-out infinite;z-index:2}
@keyframes scan{0%,100%{top:6%;opacity:0}10%,90%{opacity:.9}50%{top:93%}}
.pf .tag{position:absolute;top:24px;left:24px;z-index:3;font:500 .72rem ui-monospace,Menlo,monospace;color:var(--cy);padding:6px 12px;border-radius:10px;background:rgba(7,9,14,.6);backdrop-filter:blur(10px);border:1px solid rgba(125,211,252,.3);transform:translateZ(50px)}
.term{border-radius:20px;overflow:hidden;background:rgba(10,13,22,.78);border:1px solid var(--line);backdrop-filter:blur(20px);box-shadow:0 30px 70px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);margin-bottom:22px;max-width:560px}
.th{display:flex;align-items:center;gap:7px;padding:12px 16px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.03);font:500 .74rem ui-monospace,Menlo,monospace;color:var(--mute)}
.th i{width:10px;height:10px;border-radius:50%;background:#ff5f57}.th i:nth-child(2){background:#febc2e}.th i:nth-child(3){background:#28c840}.th span{margin-left:10px;flex:1}.th b{color:#3FD797;font-weight:500}
.code{padding:18px 20px;font:.84rem/1.75 ui-monospace,SFMono-Regular,Menlo,monospace;color:#d5def0;overflow-x:auto}
.code .l{display:block;white-space:pre;opacity:0;transform:translateX(-10px)}
.rv.in .code .l{animation:ln .5s forwards;animation-delay:calc(var(--i)*.14s + .3s)}@keyframes ln{to{opacity:1;transform:none}}
.k{color:#C792EA}.sg{color:#A5E075}.pp{color:#7DD3FC}.nb{color:#F5B50A}
.me p.t{margin-bottom:18px}
.tech{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px;max-width:560px}.tech span{padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.04);font:500 .72rem ui-monospace,Menlo,monospace;color:var(--cy)}
.wf{display:flex;align-items:center;flex-wrap:wrap;gap:8px;max-width:560px;padding:14px 18px;border-radius:18px;background:var(--card);border:1px solid var(--line);backdrop-filter:blur(16px);font:500 .78rem ui-monospace,Menlo,monospace}
.wf span::after{content:" ✓";color:#3FD797}.wf i{font-style:normal;color:var(--mute)}
@media(max-width:860px){.code{font-size:.72rem;padding:14px}.br{display:none}}

@property --a{syntax:'<angle>';initial-value:0deg;inherits:false}
@keyframes rt{to{--a:360deg}}
.pf::before{content:"";position:absolute;inset:-2px;border-radius:36px;background:conic-gradient(from var(--a),transparent 0 62%,var(--cy) 78%,var(--gold) 90%,transparent);animation:rt 6s linear infinite;z-index:-1}
#ld{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;gap:14px;font:700 clamp(3rem,12vw,6rem) 'Space Grotesk',sans-serif;pointer-events:none;animation:ldo .9s 1.7s forwards}
@keyframes ldo{to{opacity:0;visibility:hidden}}
#ld span{animation:lds 1.2s cubic-bezier(.2,.8,.2,1) both}#ld .vb{width:.5em;height:.5em;animation:ldv .8s .7s both}
@keyframes lds{from{opacity:0;letter-spacing:.4em;filter:blur(12px)}}@keyframes ldv{from{opacity:0;transform:scale(0) rotate(-90deg)}}
#cg{position:fixed;left:0;top:0;width:500px;height:500px;border-radius:50%;background:radial-gradient(closest-side,rgba(76,141,255,.13),transparent);pointer-events:none;z-index:2;will-change:transform}
#dots{position:fixed;right:1.8vw;top:50%;transform:translateY(-50%);z-index:15;display:grid;gap:14px}
#dots a{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.2);transition:.4s;display:block}
#dots a.on{background:var(--blue);transform:scale(1.6);box-shadow:0 0 14px var(--blue)}
.stat b{background:linear-gradient(180deg,#fff,#9DB7E6);-webkit-background-clip:text;background-clip:text;color:transparent}
.pb{height:3px;background:rgba(255,255,255,.08);border-radius:3px;margin:14px 0 2px;overflow:hidden}.pb u{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--blue),var(--gold))}
.cta{position:relative}.wm{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:700 30vw 'Space Grotesk',sans-serif;color:transparent;-webkit-text-stroke:1px rgba(125,211,252,.1);z-index:-1;pointer-events:none;white-space:nowrap}
@media(hover:none){#cg{display:none}}@media(max-width:860px){#dots{display:none}}

.pkd-root{margin-bottom:-4rem}
@media(min-width:768px){.pkd-root{margin-bottom:0}}
@media(max-width:460px){
.id{min-height:0;padding:22px}
.id .mid{gap:12px}
.av{width:60px;height:60px}
.id h3{font-size:1.7rem}
.pw{max-width:100%}
#me{overflow:hidden}
.tabs{flex-wrap:wrap}
}
@media(prefers-reduced-motion:reduce){
html{scroll-behavior:auto}
#cg{display:none}
.mq div{animation:none}
#ld{animation:none;opacity:0;visibility:hidden}
.rv{transition:none!important;opacity:1!important;transform:none!important}
}
`;
