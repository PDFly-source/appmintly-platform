'use client';

import React, { useState, useEffect } from 'react';

export interface BrandSplashProps {
  autoDismissMs?: number;
  onComplete?: () => void;
}

const CSS = `
.bs-root{position:fixed;inset:0;z-index:9999;overflow:hidden;isolation:isolate;transition:opacity .4s ease}
.bs-root.is-fading{opacity:0}
.bs-root>*{position:absolute}
.bs-ph{width:240px;height:500px;border:6px solid #15151a;border-radius:36px;position:relative;overflow:hidden;cursor:pointer;isolation:isolate;box-shadow:0 18px 40px rgba(0,0,0,.18)}
.bs-ph>*{position:absolute}
.bs-ctr{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding-bottom:44px}
.bs-ctr img{display:block;mix-blend-mode:multiply}
.bs-cc{left:50%;top:190px}
.bs-go .bs-mk{animation:zoom 1s cubic-bezier(.2,.9,.3,1.1) .2s both}
.bs-go .bs-tx{animation:rise .8s ease .9s both}
.bs-pb{left:60px;right:60px;bottom:54px;height:5px;border-radius:5px;background:rgba(0,0,0,.07);overflow:hidden}
.bs-pb:after,.bs-steps i:after{content:"";display:block;height:100%;width:0;border-radius:5px;background:var(--pg,var(--s))}
.bs-go .bs-pb:after{animation:fill 2.4s cubic-bezier(.4,0,.2,1) .6s both}
/* 1 AppMintly */
.bs-a1{background:radial-gradient(circle at 12% 8%,rgba(31,157,85,.2),transparent 46%),radial-gradient(circle at 92% 96%,rgba(37,99,235,.22),transparent 52%),#f8fbff}
.bs-rg{width:200px;height:200px;margin:-100px 0 0 -100px;border-radius:50%;border:1.5px solid rgba(37,99,235,.4);opacity:0}
.bs-go .bs-rg{animation:ring 1.6s ease-out .3s both}
.bs-dots{left:0;right:0;bottom:52px;display:flex;justify-content:center;gap:9px}
.bs-dots i{width:9px;height:9px;border-radius:50%;opacity:.25;animation:pulse 1.1s ease-in-out infinite}
/* 2 NexDrop */
.bs-a2{background:linear-gradient(135deg,#ebfafd,#fff 50%,#fff0e8)}
.bs-sk{left:0;height:5px;border-radius:5px;opacity:0}
.bs-go .bs-sk{animation:streak 1.3s cubic-bezier(.2,.7,.2,1) both}
.bs-go.bs-a2 .bs-mk{animation:slide .8s cubic-bezier(.2,.8,.2,1) .25s both}
.bs-go.bs-a2 .bs-tx{animation:wipe .8s cubic-bezier(.6,0,.2,1) .9s both}
/* 3 Niramay */
.bs-a3{background:radial-gradient(circle at 50% 38%,#fffef8,#f6eed8 85%)}
.bs-gl{width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;background:radial-gradient(circle,rgba(212,170,70,.28),transparent 68%);opacity:0}
.bs-go .bs-gl{animation:glow 2s ease .1s both}
.bs-gd{width:4px;height:4px;border-radius:50%;background:#c9a24a;opacity:0}
.bs-gd{animation:float 3.6s ease-in-out infinite}
.bs-go.bs-a3 .bs-mk{animation:soft 1.5s cubic-bezier(.2,.7,.2,1) .3s both}
.bs-go.bs-a3 .bs-tx{animation:rise 1.1s ease 1.2s both}
.gl2{left:50%;bottom:58px;height:1px;width:0;margin-left:-60px;background:linear-gradient(90deg,transparent,#c9a24a,transparent)}
.bs-go .gl2{animation:lw 1.4s ease 1.6s both}
/* 4 PDFMiniFly */
.bs-a4{background:linear-gradient(180deg,#fff,#fff0ec)}
.bs-rgl{width:270px;height:270px;margin:-135px 0 0 -135px;border-radius:50%;background:radial-gradient(circle,rgba(255,70,40,.24),transparent 68%);opacity:0}
.bs-go .bs-rgl{animation:glow 1.2s ease .3s both}
.bs-go.bs-a4 .bs-mk{animation:drop .95s cubic-bezier(.3,.8,.3,1) .2s both}
.bs-go.bs-a4 .bs-tx{animation:wipe .9s cubic-bezier(.6,0,.2,1) .95s both}
/* 5 BillCraft */
.bs-a5{background:radial-gradient(circle at 50% 40%,#fff,#ece4ff 88%)}
.bs-rp{width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:2px solid #17c3a0;opacity:0}
.bs-go .bs-rp{animation:rip 1.8s ease-out 1s both}
.bs-go.bs-a5 .bs-mk{animation:fall .9s cubic-bezier(.3,.7,.3,1) .2s both}
.bs-steps{left:60px;right:60px;bottom:52px;display:flex;gap:6px}
.bs-steps i{flex:1;height:4px;border-radius:4px;background:rgba(91,33,182,.14);overflow:hidden}
.bs-go .bs-steps i:after{animation:fill .6s ease both;animation-delay:var(--d)}
/* 6 Cineflow */
.bs-a6{background:linear-gradient(160deg,#f5f7ff,#ede8ff)}
.bs-a6 .bs-ctr{perspective:700px}
.bs-fs{left:0;right:0;height:26px;background:#141a4a}
.bs-fs:before{content:"";position:absolute;left:0;right:0;top:9px;height:8px;background:repeating-linear-gradient(90deg,#eef0ff 0 10px,transparent 10px 20px);animation:scroll 1.2s linear infinite}
.bs-f1{top:66px;transform-origin:left}
.bs-f2{bottom:66px;transform-origin:right}
.bs-f2:before{animation-direction:reverse}
.bs-go .bs-fs{animation:sx 1s cubic-bezier(.2,.8,.2,1) both}
.bs-go.bs-a6 .bs-mk{animation:flip 1.1s cubic-bezier(.2,.8,.2,1) .35s both}
/* 7 Studyria */
.bs-a7{background:repeating-linear-gradient(180deg,transparent 0 31px,rgba(20,20,30,.055) 31px 32px),#fbfaf7}
.bs-ml{left:34px;top:0;bottom:0;width:1px;background:rgba(190,25,25,.3);transform-origin:top}
.bs-go .bs-ml{animation:gy .9s ease .1s both}
.bs-go.bs-a7 .bs-mk{animation:settle 1s cubic-bezier(.2,.8,.2,1) .25s both}
.bs-go.bs-a7 .bs-tx{animation:wipe 1s cubic-bezier(.6,0,.2,1) .95s both}
.bs-sk{display:none}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes zoom{from{opacity:0;transform:scale(.72);filter:blur(10px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes ring{from{opacity:.9;transform:scale(.45)}to{opacity:0;transform:scale(1.6)}}
@keyframes wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
@keyframes fill{to{width:100%}}
@keyframes pulse{50%{opacity:1;transform:scale(1.35)}}
@keyframes streak{0%{transform:translateX(-130px);opacity:0}25%{opacity:.9}100%{transform:translateX(310px);opacity:0}}
@keyframes slide{from{opacity:0;transform:translateX(-70px) skewX(-8deg);filter:blur(6px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes glow{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes float{0%{opacity:0;transform:translateY(24px)}40%{opacity:.9}100%{opacity:0;transform:translateY(-56px)}}
@keyframes soft{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
@keyframes lw{to{width:120px}}
@keyframes drop{0%{opacity:0;transform:translateY(130px) rotate(-8deg) scale(.8)}60%{opacity:1;transform:translateY(-10px) rotate(2deg) scale(1.03)}100%{opacity:1;transform:none}}
@keyframes rip{from{opacity:.8;transform:scale(.8)}to{opacity:0;transform:scale(3)}}
@keyframes fall{0%{opacity:0;transform:translateY(-100px) scale(.9)}55%{opacity:1;transform:translateY(8px)}78%{transform:translateY(-3px)}100%{opacity:1;transform:none}}
@keyframes scroll{to{background-position-x:20px}}
@keyframes sx{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes flip{from{opacity:0;transform:rotateY(-80deg) scale(.8)}to{opacity:1;transform:none}}
@keyframes gy{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes settle{from{opacity:0;transform:translateY(-36px) scale(.94)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.bs-go .bs-fs,.bs-go .bs-mk,.bs-go .bs-tx,.bs-fs:before,.bs-go .bs-sk,.bs-go .bs-rp,.bs-go .bs-gl,.bs-go .bs-gd,.bs-go .bs-rgl,.bs-go .bs-ml,.bs-go .bs-rg,.bs-go .bs-dots i,.bs-go .bs-steps i,.bs-go .bs-pb:after{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;

/**
 * Brand splash - generated from the owner-approved artwork sheet so the app and
 * the reference render identically: same ground, same marks, same sequence.
 * Shows once per tab; the overlay fades before it unmounts.
 */
export const BrandSplash: React.FC<BrandSplashProps> = ({ autoDismissMs = 2600, onComplete }) => {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = !!sessionStorage.getItem('brand_splash_appmintly_shown');
    } catch {
      seen = true;
    }
    if (seen) return;
    const t = setTimeout(() => setVisible(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const a = setTimeout(() => setFading(true), autoDismissMs);
    const b = setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem('brand_splash_appmintly_shown', 'true');
      } catch {
        /* storage unavailable - splash reappears next load */
      }
      onComplete?.();
    }, autoDismissMs + 420);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [visible, autoDismissMs, onComplete]);

  if (!visible) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className={`bs-root bs-a1 bs-go${fading ? ' is-fading' : ''}`} aria-hidden="true" data-splash="appmintly">
        <div className="bs-rg bs-cc" /><div className="bs-rg bs-cc" style={{borderColor:"rgba(31,157,85,.45)",animationDelay:".55s"}} />
        <div className="bs-ctr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bs-mk" src="/brand/splash/mark.jpg" alt="" width={170} height={170} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bs-tx" src="/brand/splash/wordmark.jpg" alt="AppMintly" width={190} height={48} />
        </div>
        <div className="bs-dots"><i style={{background:"#1f9d55"}} /><i style={{background:"#2563eb",animationDelay:".15s"}} /><i style={{background:"#f5a623",animationDelay:".3s"}} /><i style={{background:"#e5392f",animationDelay:".45s"}} /></div>
      </div>
    </>
  );
};
