/**
 * Niramay launch splash — the owner-supplied `Niramay_Splash.html`, drawn with
 * the platform Canvas so the first frame is ready with the activity's first
 * layout. No WebView, no network, no animation framework.
 *
 * Provenance: docs/splash/Niramay_Splash.html. Tests/niramay-splash.test.ts
 * re-extract both embedded JPEGs from that file and compare their SHA-256
 * digests, so the bytes shipped in the APK are the owner's artwork.
 *
 * Final CSS cascade, as actually rendered (later rules win):
 *   html,body  background:#f6eed8
 *   .sp        background:radial-gradient(circle at 50% 38%,#fffef8,#f6eed8 85%)
 *   .go .mk    animation: soft 1.5s cubic-bezier(.2,.7,.2,1) .3s both
 *              (the earlier `zoom 1s ...` declaration is overridden, so no blur)
 *   .go .tx    animation: rise 1.1s ease 1.2s both   (overrides the earlier .8s/.9s)
 *   .go .gl    animation: glow 2s ease .1s both      (300px gold halo at 50%/190px)
 *   .gd        animation: float 3.6s ease-in-out infinite, six staggered dots
 *   .go .gl2   animation: lw 1.4s ease 1.6s both     (gold hairline, 0 -> 120px)
 *   .pb        styled but absent from the markup — Niramay has NO progress bar
 *   @media(prefers-reduced-motion:reduce){ *{animation:none!important} }
 *
 * Two deliberate choices, both documented so they are not mistaken for drift:
 *
 * 1. The reference leaves `.gl`, `.gd` and `.gl2` invisible under reduced motion,
 *    because `animation:none` reverts them to `opacity:0` / `width:0`. The owner
 *    asked for the opposite: show the glow, all six particles and the gold line
 *    in their final visible state rather than an artwork-less splash. That is
 *    what this view does under reduced motion, with no motion of any kind.
 *
 * 2. The six particles live in the reference's full-viewport layer (`.sp`), not
 *    in the 228x488 stage, so their positions are percentages of the whole view
 *    while their diameter and drift are multiplied by --k. Both are reproduced.
 */

import {
  NIRAMAY_SPLASH_LOGO_JPEG_BASE64,
  NIRAMAY_SPLASH_WORD_JPEG_BASE64,
} from './niramay-splash-assets';

export const NIRAMAY_SPLASH_PACKAGE = 'com.appforge.niramay';

/** Reference `window.SPLASH_MS`. */
export const NIRAMAY_SPLASH_MS = 3400;

/** Reference page colour: the `html,body` background behind the splash. */
export const NIRAMAY_SPLASH_BG = '#F6EED8';

/** Startup safety net: the splash can never outlive this. */
export const NIRAMAY_SPLASH_HARD_TIMEOUT_MS = 12000;

export const NIRAMAY_SPLASH_LOGO_NAME = 'niramay_splash_logo';
export const NIRAMAY_SPLASH_WORD_NAME = 'niramay_splash_word';
export const NIRAMAY_SPLASH_ICON_NAME = 'niramay_splash_transparent_icon';

/** The two embedded images, extracted byte-for-byte from the reference HTML. */
export function niramaySplashLogoJpeg(): Buffer {
  return Buffer.from(NIRAMAY_SPLASH_LOGO_JPEG_BASE64, 'base64');
}

export function niramaySplashWordJpeg(): Buffer {
  return Buffer.from(NIRAMAY_SPLASH_WORD_JPEG_BASE64, 'base64');
}

/** colors.xml entries that only the Niramay build receives. */
export function niramaySplashColorEntries(): string {
  return `    <color name="niramay_splash_bg">${NIRAMAY_SPLASH_BG}</color>`;
}

/**
 * Launch theme. The window background is the reference page colour, so there is
 * no colour break before the animated view draws and no older gradient anywhere.
 */
export function niramaySplashStylesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/niramay_splash_bg</item>
    </style>
</resources>`;
}

/**
 * Android 12+ system splash: the same neutral surface with a fully transparent
 * icon, so the platform paints a plain window for the frames before the activity
 * takes over. No brand tile, no halo, no old artwork.
 */
export function niramaySplashStylesV31Xml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/niramay_splash_bg</item>
        <item name="android:windowSplashScreenBackground">@color/niramay_splash_bg</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/${NIRAMAY_SPLASH_ICON_NAME}</item>
    </style>
</resources>`;
}

/** Transparent drawable used as the (invisible) system-splash icon. */
export function niramaySplashTransparentIconXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#00000000" />
</shape>`;
}

/**
 * The complete `NiramaySplashView.java` source. Pure Canvas drawing: no WebView,
 * no network, no animation framework, no external assets.
 */
export function niramaySplashJava(packageId: string): string {
  return `package ${packageId};

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.provider.Settings;
import android.view.View;

/**
 * Niramay launch splash — the owner-supplied Niramay_Splash.html, drawn with the
 * platform Canvas. Generated by lib/splash/niramay-splash.ts; do not edit the
 * generated copy.
 */
public class NiramaySplashView extends View {

    public interface OnSplashFinishedListener {
        void onSplashFinished();
    }

    /** Reference window.SPLASH_MS. */
    private static final long DURATION_MS = ${NIRAMAY_SPLASH_MS}L;

    // ---- reference stage (CSS px == dp) ----
    private static final float STAGE_W = 228f;
    private static final float STAGE_H = 488f;
    private static final float CTR_GAP = 12f;           // .ctr gap
    private static final float CTR_PAD_BOTTOM = 44f;    // .ctr padding-bottom
    private static final float LOGO_W = 150f;           // .mk inline width
    private static final float WORD_W = 195f;           // .tx inline width

    // radial-gradient(circle at 50% 38%,#fffef8,#f6eed8 85%): default
    // farthest-corner circle from that centre, in stage units.
    private static final float GRAD_CX = 114f;
    private static final float GRAD_CY = 185.44f;
    private static final float GRAD_R = 323.32f;
    private static final float GRAD_STOP = 0.85f;

    // .gl.cc: 300x300 halo, centred at left:50% / top:190px of the stage.
    private static final float GLOW_CX = 114f;
    private static final float GLOW_CY = 190f;
    private static final float GLOW_R = 150f;
    private static final float GLOW_STOP = 0.68f;

    // .gl2: 1px gold hairline, bottom:58px, width 0 -> 120px, margin-left -60px.
    private static final float LINE_BOTTOM = 58f;
    private static final float LINE_H = 1f;
    private static final float LINE_W = 120f;

    // .gd: six 4px dots in the full-viewport layer, size and drift scaled by --k.
    private static final float PARTICLE_D = 4f;
    private static final float PARTICLE_DRIFT_UP = -56f;
    private static final float PARTICLE_DRIFT_DOWN = 24f;
    private static final long PARTICLE_FLOAT_MS = 3600L;
    private static final float[] PARTICLE_X = {22f, 74f, 40f, 62f, 14f, 84f};
    private static final float[] PARTICLE_Y = {70f, 62f, 78f, 74f, 50f, 40f};
    private static final long[] PARTICLE_DELAY = {0L, 900L, 1700L, 2400L, 1200L, 2000L};

    // ---- palette (final cascade) ----
    private static final int CANVAS = 0xFFF6EED8;       // html,body background
    private static final int GRAD_INNER = 0xFFFFFEF8;   // #fffef8
    private static final int GRAD_OUTER = 0xFFF6EED8;   // #f6eed8
    private static final int GLOW_INNER = 0x47D4AA46;   // rgba(212,170,70,.28)
    private static final int GLOW_OUTER = 0x00D4AA46;   // transparent
    private static final int PARTICLE_COLOR = 0xFFC9A24A; // #c9a24a
    private static final int LINE_COLOR = 0xFFC9A24A;   // #c9a24a

    // ---- timeline: delay + duration from the final declarations ----
    private static final long LOGO_DELAY = 300L, LOGO_DUR = 1500L;   // soft
    private static final long WORD_DELAY = 1200L, WORD_DUR = 1100L;  // rise
    private static final long GLOW_DELAY = 100L, GLOW_DUR = 2000L;   // glow
    private static final long LINE_DELAY = 1600L, LINE_DUR = 1400L;  // lw

    private final float density;
    private final boolean reducedMotion;
    private final Bitmap logo;
    private final Bitmap word;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint logoPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint wordPaint = new Paint(Paint.FILTER_BITMAP_FLAG);

    private boolean running;
    private boolean finished;
    private long startNs = -1L;
    private OnSplashFinishedListener listener;

    public NiramaySplashView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        reducedMotion = isReducedMotion();
        logo = loadBitmap("${NIRAMAY_SPLASH_LOGO_NAME}");
        word = loadBitmap("${NIRAMAY_SPLASH_WORD_NAME}");
        // The reference draws both images with mix-blend-mode:multiply over the
        // gradient, so they have to blend with the backdrop rather than sit on
        // it. Blend modes need a software layer to be honoured.
        logoPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));
        wordPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));
        setLayerType(LAYER_TYPE_SOFTWARE, null);
        setBackgroundColor(CANVAS);
        setContentDescription("Niramay splash");
    }

    public void setOnSplashFinishedListener(OnSplashFinishedListener l) {
        listener = l;
    }

    /** Restarts the timeline (used when the view is re-attached to a window). */
    public void restart() {
        startNs = -1L;
        finished = false;
        invalidate();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (startNs < 0L) {
            startNs = System.nanoTime();
            running = true;
            postInvalidateOnAnimation();
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        running = false;
        super.onDetachedFromWindow();
    }

    private float elapsedMs() {
        if (startNs < 0L) return 0f;
        return (System.nanoTime() - startNs) / 1000000f;
    }

    private Bitmap loadBitmap(String name) {
        try {
            final int id = getResources().getIdentifier(name, "drawable", getContext().getPackageName());
            if (id == 0) return null;
            return BitmapFactory.decodeResource(getResources(), id);
        } catch (Throwable ignored) {
            return null;
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        final int w = getWidth();
        final int h = getHeight();
        if (w <= 0 || h <= 0) return;

        final float t = reducedMotion ? DURATION_MS : elapsedMs();

        // fit(): the stage is scaled by min(viewport/228, viewport/488) exactly
        // like the reference's --k, so the composition matches the browser at
        // every aspect ratio; the artwork itself is never stretched.
        final float stageW = STAGE_W * density;
        final float stageH = STAGE_H * density;
        final float k = Math.min(w / stageW, h / stageH);
        final float u = density * k;
        final float ox = (w - stageW * k) / 2f;
        final float oy = (h - stageH * k) / 2f;

        // 1. background: radial-gradient(circle at 50% 38%,#fffef8,#f6eed8 85%)
        paint.setStyle(Paint.Style.FILL);
        paint.setAlpha(255);
        canvas.drawColor(CANVAS);
        paint.setShader(new RadialGradient(
                ox + GRAD_CX * u, oy + GRAD_CY * u, GRAD_R * u,
                new int[]{GRAD_INNER, GRAD_OUTER},
                new float[]{0f, GRAD_STOP},
                Shader.TileMode.CLAMP));
        canvas.drawRect(0f, 0f, w, h, paint);
        paint.setShader(null);

        // 2. floating gold dots: .gd lives in the full-viewport .sp layer and is
        //    declared before .stage, so it paints under the stage's own content.
        drawParticles(canvas, w, h, u, t);

        // 3. gold halo behind the artwork: .gl.cc
        drawGlow(canvas, ox + GLOW_CX * u, oy + GLOW_CY * u, u, t);

        if (logo == null || word == null) {
            finishIfDue(t);
            return;
        }

        // 4. centred column: logo, 12dp gap, wordmark; padding-bottom 44dp
        final float colCx = ox + (STAGE_W / 2f) * u;
        final float logoW = LOGO_W * u;
        final float logoH = logoW * ((float) logo.getHeight() / (float) logo.getWidth());
        final float wordW = WORD_W * u;
        final float wordH = wordW * ((float) word.getHeight() / (float) word.getWidth());
        final float contentH = logoH + CTR_GAP * u + wordH;
        final float areaH = (STAGE_H - CTR_PAD_BOTTOM) * u;
        final float top = oy + Math.max(0f, (areaH - contentH) / 2f);

        // 4a. logo: animation soft 1.5s cubic-bezier(.2,.7,.2,1) .3s both
        final float lp = reducedMotion ? 1f : progress(t, LOGO_DELAY, LOGO_DUR);
        final float le = reducedMotion ? 1f : ease(lp, 0.2f, 0.7f, 0.2f, 1f);
        final float logoScale = reducedMotion ? 1f : lerp(0.92f, 1f, le);
        logoPaint.setAlpha(Math.round(255f * clamp01(le)));
        drawArtwork(canvas, logo, colCx, top + logoH / 2f, logoW, logoH, logoScale, logoPaint);

        // 4b. wordmark: animation rise 1.1s ease 1.2s both
        final float wp = reducedMotion ? 1f : progress(t, WORD_DELAY, WORD_DUR);
        final float we = reducedMotion ? 1f : ease(wp, 0.25f, 0.1f, 0.25f, 1f);
        final float wordTop = top + logoH + CTR_GAP * u;
        wordPaint.setAlpha(Math.round(255f * clamp01(we)));
        drawArtwork(canvas, word, colCx,
                wordTop + wordH / 2f + (18f * (1f - we)) * u,
                wordW, wordH, 1f, wordPaint);

        // 5. bottom gold hairline: lw 1.4s ease 1.6s both, width 0 -> 120dp
        final float lineY = oy + (STAGE_H - LINE_BOTTOM - LINE_H) * u;
        final float lineLeft = ox + (STAGE_W / 2f - LINE_W / 2f) * u;
        final float lineFull = LINE_W * u;
        final float lw = reducedMotion
                ? 1f
                : ease(progress(t, LINE_DELAY, LINE_DUR), 0.25f, 0.1f, 0.25f, 1f);
        final float lineNow = lineFull * clamp01(lw);
        if (lineNow > 0.5f) {
            paint.setShader(new LinearGradient(
                    lineLeft, lineY, lineLeft + lineNow, lineY,
                    new int[]{0x00C9A24A, LINE_COLOR, 0x00C9A24A},
                    new float[]{0f, 0.5f, 1f},
                    Shader.TileMode.CLAMP));
            canvas.drawRect(lineLeft, lineY, lineLeft + lineNow,
                    lineY + Math.max(1f, LINE_H * u), paint);
            paint.setShader(null);
        }

        finishIfDue(t);
    }

    /** .go .gl: glow 2s ease .1s both — opacity 0 -> 1, scale .6 -> 1. */
    private void drawGlow(Canvas canvas, float cx, float cy, float u, float t) {
        final float p = reducedMotion ? 1f : progress(t, GLOW_DELAY, GLOW_DUR);
        final float e = reducedMotion ? 1f : ease(p, 0.25f, 0.1f, 0.25f, 1f);
        if (e <= 0f) return;
        final float scale = reducedMotion ? 1f : lerp(0.6f, 1f, e);
        paint.setStyle(Paint.Style.FILL);
        paint.setAlpha(Math.round(255f * clamp01(e)));
        paint.setShader(new RadialGradient(
                0f, 0f, GLOW_R * u,
                new int[]{GLOW_INNER, GLOW_OUTER},
                new float[]{0f, GLOW_STOP},
                Shader.TileMode.CLAMP));
        final int save = canvas.save();
        canvas.translate(cx, cy);
        if (scale != 1f) canvas.scale(scale, scale);
        canvas.drawCircle(0f, 0f, GLOW_R * u, paint);
        canvas.restoreToCount(save);
        paint.setShader(null);
        paint.setAlpha(255);
    }

    /**
     * .gd: float 3.6s ease-in-out infinite, six staggered delays. Opacity ramps
     * 0 -> .9 over the first 40% and .9 -> 0 over the rest; the drift runs from
     * +24dp to -56dp across the whole cycle, all scaled by --k like the CSS.
     */
    private void drawParticles(Canvas canvas, int w, int h, float u, float t) {
        final float radius = (PARTICLE_D * u) / 2f;
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(null);
        paint.setColor(PARTICLE_COLOR);
        for (int i = 0; i < PARTICLE_X.length; i++) {
            final float cx = (PARTICLE_X[i] / 100f) * w;
            final float cy = (PARTICLE_Y[i] / 100f) * h;
            float opacity;
            float dy;
            if (reducedMotion) {
                // Stable visible state: no loop, no movement, artwork intact.
                opacity = 0.9f;
                dy = 0f;
            } else {
                final float elapsed = t - PARTICLE_DELAY[i];
                if (elapsed < 0f) {
                    opacity = 0f;
                    dy = 0f;
                } else {
                    final float phase = (elapsed % PARTICLE_FLOAT_MS) / (float) PARTICLE_FLOAT_MS;
                    if (phase < 0.4f) {
                        opacity = 0.9f * easeInOut(phase / 0.4f);
                    } else {
                        opacity = 0.9f * (1f - easeInOut((phase - 0.4f) / 0.6f));
                    }
                    dy = lerp(PARTICLE_DRIFT_DOWN, PARTICLE_DRIFT_UP, easeInOut(phase)) * u;
                }
            }
            if (opacity <= 0.004f) continue;
            paint.setAlpha(Math.round(255f * clamp01(opacity)));
            canvas.drawCircle(cx, cy + dy, radius, paint);
        }
        paint.setAlpha(255);
    }

    /** Serialises a bitmap with its own scale about the column centre. */
    private void drawArtwork(Canvas canvas, Bitmap bmp, float cx, float cy,
                             float w, float h, float scale, Paint p) {
        if (p.getAlpha() == 0) return;
        final int save = canvas.save();
        canvas.translate(cx, cy);
        if (scale != 1f) canvas.scale(scale, scale);
        final RectF dst = new RectF(-w / 2f, -h / 2f, w / 2f, h / 2f);
        canvas.drawBitmap(bmp, null, dst, p);
        canvas.restoreToCount(save);
    }

    private void finishIfDue(float t) {
        if (!finished && t >= DURATION_MS) {
            finished = true;
            if (listener != null) listener.onSplashFinished();
        }
        if (running) postInvalidateOnAnimation();
    }

    /** Animation progress 0..1 for a CSS delay/duration pair ("both" fill mode). */
    private static float progress(float t, long delay, long dur) {
        if (dur <= 0L) return t >= delay ? 1f : 0f;
        final float p = (t - delay) / (float) dur;
        return clamp01(p);
    }

    /** CSS ease-in-out = cubic-bezier(.42,0,.58,1). */
    private static float easeInOut(float p) {
        return ease(p, 0.42f, 0f, 0.58f, 1f);
    }

    /** CSS cubic-bezier(x1,y1,x2,y2) as a timing function (bisection). */
    private static float ease(float p, float x1, float y1, float x2, float y2) {
        if (p <= 0f) return 0f;
        if (p >= 1f) return 1f;
        final float[] curveX = {0f, x1, x2, 1f};
        final float[] curveY = {0f, y1, y2, 1f};
        float lo = 0f;
        float hi = 1f;
        float t = p;
        for (int i = 0; i < 24; i++) {
            final float x = bezier(curveX, t);
            if (Math.abs(x - p) < 1e-4f) break;
            if (x < p) lo = t; else hi = t;
            t = (lo + hi) / 2f;
        }
        return bezier(curveY, t);
    }

    private static float bezier(float[] c, float t) {
        final float mt = 1f - t;
        return mt * mt * mt * c[0]
                + 3f * mt * mt * t * c[1]
                + 3f * mt * t * t * c[2]
                + t * t * t * c[3];
    }

    private static float lerp(float a, float b, float s) {
        return a + (b - a) * s;
    }

    private static float clamp01(float v) {
        return v < 0f ? 0f : (v > 1f ? 1f : v);
    }

    /** The reference disables every animation under prefers-reduced-motion. */
    private boolean isReducedMotion() {
        try {
            float scale = Settings.Global.getFloat(
                    getContext().getContentResolver(),
                    Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
            return scale == 0f;
        } catch (Throwable ignored) {
            return false;
        }
    }
}
`;
}
