/**
 * PKD profile 3D scene: a faithful port of the supplied reference HTML's
 * Three.js (r128) scene, adapted to live inside the AppMintly React app.
 *
 * Differences from the standalone reference (all deliberate):
 *  - three.js r128 is the SAME pinned build as the reference, self-hosted in
 *    /vendor/three-r128.min.js and loaded lazily on this route only (no CDN
 *    dependency, no package.json change).
 *  - Tile icons / names / count come from the live catalog, not hardcoded.
 *  - ONE requestAnimationFrame loop, cancelled on cleanup; paused while the tab
 *    is hidden; every geometry/material/texture/renderer is disposed.
 *  - All listeners are registered with a shared AbortController (no leaks, no
 *    duplicates on remount / React strict mode).
 *  - Reduced motion: a single static frame is rendered, no loop.
 *  - If WebGL or the script is unavailable, start() resolves `false` so the
 *    page shows its CSS-only presentation.
 */

export interface SceneApp {
  name: string;
  icon: string; // absolute, base-path-aware URL
  glow: number; // 0xRRGGBB accent
}

export interface SceneHandle {
  dispose: () => void;
}

let threePromise: Promise<any> | null = null;

/** Load the pinned three.js build once (shared across mounts). */
export function loadThree(src: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.THREE) return Promise.resolve(w.THREE);
  if (threePromise) return threePromise;
  threePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => (w.THREE ? resolve(w.THREE) : reject(new Error('THREE missing after load')));
    s.onerror = () => {
      threePromise = null; // allow a retry on the next mount
      reject(new Error('three.js failed to load'));
    };
    document.head.appendChild(s);
  });
  return threePromise;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

interface StartOptions {
  canvas: HTMLCanvasElement;
  apps: SceneApp[];
  showcase: HTMLElement; // the #apps section (scroll range for the showcase)
  progressFill: HTMLElement; // .pb u
  progressBar: HTMLElement; // #pg
  onShow: (index: number) => void; // reference show(i)
  reducedMotion: boolean;
}

export function startScene(THREE: any, o: StartOptions): SceneHandle {
  const { canvas, apps, showcase: sec } = o;
  const N_APPS = Math.max(1, apps.length);
  const ST = (Math.PI * 2) / N_APPS;
  const ac = new AbortController();
  const sig = { signal: ac.signal } as AddEventListenerOptions;
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(x: T): T => (disposables.push(x), x);

  let M = window.innerWidth < 860;
  const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  R.outputEncoding = THREE.sRGBEncoding;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.toneMappingExposure = 1.1;

  const S = new THREE.Scene();
  S.fog = new THREE.FogExp2(0x07090e, 0.035);
  const C = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  C.position.z = 11;

  const rs = () => {
    M = window.innerWidth < 860;
    R.setSize(window.innerWidth, window.innerHeight);
    C.aspect = window.innerWidth / window.innerHeight;
    C.updateProjectionMatrix();
  };
  rs();
  window.addEventListener('resize', rs, sig);

  // studio environment for glossy reflections (identical to the reference)
  const env = new THREE.Scene();
  [
    [0xffffff, 0, 8, 0, 10, 0.3, 10],
    [0x4c8dff, -8, 0, 0, 0.3, 8, 8],
    [0xf5b50a, 8, 1, 2, 0.3, 6, 6],
    [0x7dd3fc, 0, -6, 4, 9, 0.3, 6],
    [0xffffff, 0, 2, -9, 12, 8, 0.3],
  ].forEach((p) => {
    const g = track(new THREE.BoxGeometry(p[4], p[5], p[6]));
    const mt = track(new THREE.MeshBasicMaterial({ color: p[0] }));
    const m = new THREE.Mesh(g, mt);
    m.position.set(p[1], p[2], p[3]);
    env.add(m);
  });
  const pm = new THREE.PMREMGenerator(R);
  const envRT = pm.fromScene(env, 0.03);
  S.environment = envRT.texture;
  track(envRT);
  track(pm);

  const L1 = new THREE.PointLight(0x4c8dff, 2.5, 30);
  const L2 = new THREE.PointLight(0xf5b50a, 1.6, 30);
  S.add(L1, L2);

  const glowT = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return track(new THREE.CanvasTexture(c));
  })();

  let alive = true;
  const itex = (src: string) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    const t = track(new THREE.CanvasTexture(c));
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      if (!alive) return;
      x.clearRect(0, 0, 256, 256);
      x.save();
      x.beginPath();
      x.moveTo(60, 0);
      x.arcTo(256, 0, 256, 256, 56);
      x.arcTo(256, 256, 0, 256, 56);
      x.arcTo(0, 256, 0, 0, 56);
      x.arcTo(0, 0, 256, 0, 56);
      x.clip();
      x.drawImage(im, 0, 0, 256, 256);
      x.restore();
      t.needsUpdate = true;
      if (o.reducedMotion) R.render(S, C);
    };
    im.src = src;
    return t;
  };

  const G = new THREE.Group();
  const ring = new THREE.Group();
  const tiles: any[] = [];
  G.add(ring);
  S.add(G);

  apps.forEach((a, i) => {
    const an = (i / N_APPS) * Math.PI * 2;
    const g = new THREE.Group();
    g.add(
      new THREE.Mesh(
        track(new THREE.BoxGeometry(2.1, 2.1, 0.24)),
        track(
          new THREE.MeshPhysicalMaterial({
            color: 0x1d2538, metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.3,
          })
        )
      )
    );
    const p = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.8, 1.8)),
      track(new THREE.MeshBasicMaterial({ map: itex(a.icon), transparent: true }))
    );
    p.position.z = 0.13;
    g.add(p);
    const s = new THREE.Sprite(
      track(
        new THREE.SpriteMaterial({
          map: glowT, color: a.glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      )
    );
    s.scale.set(5.5, 5.5, 1);
    s.position.z = -0.6;
    g.add(s);
    g.position.set(Math.sin(an) * 3.8, 0, Math.cos(an) * 3.8);
    g.rotation.y = an;
    ring.add(g);
    tiles.push(g);
  });

  const orb = new THREE.Mesh(
    track(new THREE.TorusGeometry(3.8, 0.014, 8, 200)),
    track(new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5 }))
  );
  orb.rotation.x = Math.PI / 2;
  orb.position.y = -1.7;
  ring.add(orb);

  const cr = new THREE.Group();
  const gm = new THREE.Mesh(
    track(new THREE.OctahedronGeometry(1, 0)),
    track(
      new THREE.MeshPhysicalMaterial({
        color: 0x4c8dff, metalness: 0.95, roughness: 0.06, flatShading: true, clearcoat: 1, envMapIntensity: 1.8,
      })
    )
  );
  gm.scale.y = 1.45;
  const wf = new THREE.Mesh(
    track(new THREE.OctahedronGeometry(1.4, 1)),
    track(new THREE.MeshBasicMaterial({ color: 0x7dd3fc, wireframe: true, transparent: true, opacity: 0.28 }))
  );
  wf.scale.y = 1.45;
  const gs = new THREE.Sprite(
    track(
      new THREE.SpriteMaterial({
        map: glowT, color: 0x4c8dff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    )
  );
  gs.scale.set(6, 6, 1);
  cr.add(gm, wf, gs);
  G.add(cr);

  // dust: fewer particles on small screens (battery), same look
  const N = M ? 600 : 1100;
  const pa = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) pa[i] = (Math.random() - 0.5) * (i % 3 === 2 ? 50 : 40);
  const pg = track(new THREE.BufferGeometry());
  pg.setAttribute('position', new THREE.BufferAttribute(pa, 3));
  const dust = new THREE.Points(
    pg,
    track(
      new THREE.PointsMaterial({
        color: 0x9cc2ff, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    )
  );
  S.add(dust);

  let tp = 0, sp = 0, mx = 0, my = 0, rot = 0, gz = 0, gy = 0, gsc = 1;
  const clk = new THREE.Clock();
  let lastShown = -2;

  const onScroll = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    tp = h > 0 ? window.scrollY / h : 0;
    o.progressBar.style.transform = 'scaleX(' + tp + ')';
  };
  const onPointer = (e: PointerEvent) => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener('scroll', onScroll, { ...sig, passive: true });
  window.addEventListener('pointermove', onPointer, sig);
  onScroll();

  const frame = (animate: boolean) => {
    const t = clk.getElapsedTime();
    sp += (tp - sp) * 0.06;
    const rect = sec.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const h = sec.offsetHeight - window.innerHeight;
    const pr = h > 0 ? (window.scrollY - top) / h : 0;
    const inA = pr > 0 && pr < 1;
    const idx = Math.max(0, Math.min(N_APPS - 1, Math.floor(pr * N_APPS)));
    if (pr > -0.15 && pr < 1.1 && idx !== lastShown) {
      lastShown = idx;
      o.onShow(idx);
    }
    if (inA) {
      let tg = -idx * ST;
      tg += Math.round((rot - tg) / (Math.PI * 2)) * Math.PI * 2;
      rot += (tg - rot) * 0.07;
    } else if (animate) rot -= 0.0032;
    ring.rotation.y = rot;
    G.rotation.x = my * 0.14;
    G.rotation.z = -mx * 0.06;
    o.progressFill.style.width = (inA ? pr * 100 : 0) + '%';

    const near = inA || window.scrollY < window.innerHeight * 0.55;
    gz += ((near ? 0 : -10) - gz) * 0.05;
    gsc += ((near ? 1 : 0) - gsc) * 0.08;
    G.visible = gsc > 0.02;
    const gx = M ? 0 : 2.7;
    const ty = M ? (inA ? 2.4 : 2.9) : 0;
    gy += (ty - gy) * 0.06;
    G.position.x += (gx - G.position.x) * 0.06;
    G.position.y = gy;
    G.position.z = gz;
    G.scale.setScalar((M ? 0.6 : 1) * Math.max(gsc, 0.001));
    tiles.forEach((g, i) => {
      g.position.y = Math.sin(t * 1.2 + i * 1.3) * 0.12;
    });
    cr.rotation.y = t * 0.5;
    cr.position.y = Math.sin(t) * 0.15;
    L1.position.set(Math.cos(t * 0.5) * 6, 3, 5);
    L2.position.set(-Math.cos(t * 0.4) * 6, -2, 4);
    dust.rotation.y = t * 0.01;
    dust.position.y = sp * 8;
    C.position.x += (mx * 1.6 - C.position.x) * 0.04;
    C.position.y += (-my * 1 - C.position.y) * 0.04;
    C.lookAt(M ? 0 : 1.2, 0, 0);
    R.render(S, C);
  };

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    frame(true);
  };
  const start = () => {
    if (!raf && alive) loop();
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  if (o.reducedMotion) {
    // static composition: render on scroll/resize only, never a continuous loop
    frame(false);
    const again = () => frame(false);
    window.addEventListener('scroll', again, { ...sig, passive: true });
    window.addEventListener('resize', again, sig);
  } else {
    start();
    document.addEventListener(
      'visibilitychange',
      () => (document.hidden ? stop() : start()),
      sig
    );
  }

  return {
    dispose() {
      alive = false;
      stop();
      ac.abort();
      scene_cleanup();
    },
  };

  function scene_cleanup() {
    S.traverse((obj: any) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const m = Array.isArray(obj.material) ? obj.material : [obj.material];
        m.forEach((x: any) => {
          x.map?.dispose?.();
          x.dispose?.();
        });
      }
    });
    disposables.forEach((d) => {
      try {
        d.dispose();
      } catch {
        /* already disposed */
      }
    });
    S.environment = null;
    R.dispose();
    try {
      R.forceContextLoss();
    } catch {
      /* ignore */
    }
  }
}
