/**
 * CineFlow launch splash — the owner-supplied `Cineflow_Splash.html`, drawn with
 * the platform Canvas so the first frame is ready with the activity's first
 * layout. No WebView, no network, no animation framework.
 *
 * Provenance: the owner's reference file (80,916 bytes, SHA-256
 * c7dd4bb974f6ecf8dd07c8c6bab3a4186222b634b0e8688019af8cc1ed02bff5).
 * tests/cineflow-splash.test.ts re-extracts both embedded JPEGs from that file
 * and compares their SHA-256 digests, so the bytes shipped in the APK are the
 * owner's artwork.
 *
 * Final CSS cascade, as actually rendered (later rules win):
 *   html,body  background:#f0eeff              (fully covered by .sp)
 *   .sp        background:linear-gradient(160deg,#f5f7ff,#ede8ff)
 *   --k        min(innerWidth/228, innerHeight/488), recomputed on resize
 *   .stage     228x488, zoom:var(--k)
 *   .ctr       centered column, gap 12px, padding-bottom 44px
 *   .mk        135px wide, 420x426 JPEG, mix-blend-mode:multiply
 *   .tx        215px wide, 620x155 JPEG, mix-blend-mode:multiply
 *   .go .mk    animation: flip 1.1s cubic-bezier(.2,.8,.2,1) .35s both
 *              (the earlier `zoom 1s ... .2s` declaration is overridden, so the
 *               mark turns in 3D and never blurs)
 *   .go .tx    animation: rise .8s ease .9s both
 *   .go .fs    animation: sx 1s cubic-bezier(.2,.8,.2,1) both, scaleX(0) -> 1
 *   .fs        #141a4a, height 26px * --k, .f1 top:13.5%, .f2 bottom:13.5%
 *   .fs:before 8px * --k light stripe band at 9px * --k inside the band,
 *              repeating 10px/20px, scroll 1.2s linear infinite,
 *              animation-direction:reverse on .f2
 *   .pb        styled but absent from the markup — CineFlow has NO progress bar
 *   @media(prefers-reduced-motion:reduce){ *{animation:none!important} }
 *
 * Three deliberate choices, documented so they are not mistaken for drift:
 *
 * 1. The bands live in the reference's full-viewport layer (`.sp`), not inside
 *    the 228x488 stage: their anchors are 13.5% of the viewport height and they
 *    span the full width, while their height and stripe metrics scale by --k.
 *    The approved plan requires exactly this (not the older fixed 66px layout).
 *
 * 2. The artwork is white-background JPEG meant for `mix-blend-mode:multiply`.
 *    It is drawn with PorterDuff MULTIPLY inside a software layer so it blends
 *    with the gradient instead of pasting two white boxes.
 *
 * 3. Under reduced motion every animation is disabled, so the reference shows
 *    the final frame of each declaration (opacity 1, rotateY 0, scale 1,
 *    translateY 0, scaleX 1). That is what this view draws, with no motion.
 */

import {
  CINEFLOW_SPLASH_HTML_SHA256,
  CINEFLOW_SPLASH_MARK_JPEG_BASE64,
  CINEFLOW_SPLASH_MARK_SHA256,
  CINEFLOW_SPLASH_WORD_JPEG_BASE64,
  CINEFLOW_SPLASH_WORD_SHA256,
} from './cineflow-splash-assets';

export {
  CINEFLOW_SPLASH_HTML_SHA256,
  CINEFLOW_SPLASH_MARK_SHA256,
  CINEFLOW_SPLASH_WORD_SHA256,
};

export const CINEFLOW_SPLASH_PACKAGE = 'com.appforge.cineflow';

/** Reference window.SPLASH_MS. */
export const CINEFLOW_SPLASH_MS = 3400;

/** `.sp` gradient start — also the window, system-splash and canvas colour. */
export const CINEFLOW_SPLASH_BG = '#F5F7FF';

/** Fail-safe dismissal if the first content frame never arrives. */
export const CINEFLOW_SPLASH_HARD_TIMEOUT_MS = 12000;

export const CINEFLOW_SPLASH_MARK_NAME = 'cineflow_splash_mark';
export const CINEFLOW_SPLASH_WORD_NAME = 'cineflow_splash_word';
export const CINEFLOW_SPLASH_ICON_NAME = 'cineflow_splash_transparent_icon';

export function cineflowSplashMarkJpeg(): Buffer {
  return Buffer.from(CINEFLOW_SPLASH_MARK_JPEG_BASE64, 'base64');
}

export function cineflowSplashWordJpeg(): Buffer {
  return Buffer.from(CINEFLOW_SPLASH_WORD_JPEG_BASE64, 'base64');
}

export function cineflowSplashColorEntries(): string {
  return `    <color name="cineflow_splash_bg">${CINEFLOW_SPLASH_BG}</color>
    <color name="cineflow_splash_band">#141A4A</color>
    <color name="cineflow_splash_stripe">#EEF0FF</color>`;
}

export function cineflowSplashStylesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/cineflow_splash_bg</item>
    </style>
</resources>`;
}

/**
 * Android 12+ system splash: the same light canvas, and an invisible icon.
 *
 * The reference has no launcher mark in its composition, so the system splash
 * must not show one: a transparent animated icon removes both the launcher
 * glyph and the icon zoom, leaving a flat #F5F7FF surface that hands over to
 * the animated view with no colour change and no shape change.
 */
export function cineflowSplashStylesV31Xml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/cineflow_splash_bg</item>
        <item name="android:windowSplashScreenBackground">@color/cineflow_splash_bg</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/${CINEFLOW_SPLASH_ICON_NAME}</item>
    </style>
</resources>`;
}

/** Transparent drawable used as the (invisible) system-splash icon. */
export function cineflowSplashTransparentIconXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#00000000" />
</shape>`;
}

/**
 * The complete `CineFlowSplashView.java` source. Pure Canvas drawing: no
 * WebView, no network, no animation framework, no external assets.
 *
 * Geometry is the reference's own model: a 228x488 stage scaled by
 * u = min(width/228, height/488), with the artwork column centred inside the
 * stage's 44px-bottom-padded content box. Verified against the browser render:
 * at 412x915 the reference puts the mark at y=234.6 and the wordmark at
 * y=503.7; this model puts them at 234.7 and 503.7.
 */
export function cineflowSplashJava(pkg: string): string {
  return `package ${pkg};

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Camera;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.graphics.Shader;
import android.provider.Settings;
import android.view.View;

/**
 * CineFlow launch splash — the owner-supplied Cineflow_Splash.html drawn with
 * the platform Canvas. Generated by lib/splash/cineflow-splash.ts; do not edit
 * the generated copy.
 */
public class CineFlowSplashView extends View {

    public interface OnSplashFinishedListener {
        void onSplashFinished();
    }

    /** Reference window.SPLASH_MS. */
    private static final long DURATION_MS = ${CINEFLOW_SPLASH_MS}L;

    // ---- reference stage (CSS px == dp) ----
    private static final float STAGE_W = 228f;
    private static final float STAGE_H = 488f;
    private static final float CTR_GAP = 12f;           // .ctr gap
    private static final float CTR_PAD_BOTTOM = 44f;    // .ctr padding-bottom
    private static final float MARK_W = 135f;           // .mk inline width
    private static final float WORD_W = 215f;           // .tx inline width
    private static final float MARK_AR = 426f / 420f;   // mark JPEG aspect
    private static final float WORD_AR = 155f / 620f;   // wordmark JPEG aspect

    // ---- film strips (.fs): full viewport width, anchors 13.5% ----
    private static final float BAND_ANCHOR = 0.135f;
    private static final float BAND_H = 26f;
    private static final float STRIPE_H = 8f;
    private static final float STRIPE_INSET = 9f;
    private static final float STRIPE_PITCH = 20f;
    private static final float STRIPE_LIT = 10f;
    private static final long STRIPE_CYCLE_MS = 1200L;

    // ---- timeline: delay + duration from the final declarations ----
    private static final long SX_DELAY = 0L, SX_DUR = 1000L;          // sx
    private static final long FLIP_DELAY = 350L, FLIP_DUR = 1100L;    // flip
    private static final long RISE_DELAY = 900L, RISE_DUR = 800L;     // rise
    private static final float PERSPECTIVE = 700f;                    // perspective(700px)
    private static final float FLIP_START_DEG = -80f;
    private static final float FLIP_START_SCALE = 0.8f;
    private static final float RISE_START = 18f;                      // translateY(18px)

    // ---- palette (final cascade) ----
    private static final int CANVAS = 0xFFF5F7FF;       // #f5f7ff
    private static final int GRAD_START = 0xFFF5F7FF;   // #f5f7ff
    private static final int GRAD_END = 0xFFEDE8FF;     // #ede8ff
    private static final int BAND_COLOR = 0xFF141A4A;   // #141a4a
    private static final int STRIPE_COLOR = 0xFFEEF0FF; // #eef0ff
    private static final float GRAD_DEG = 160f;         // linear-gradient(160deg,...)

    private final float density;
    private final boolean reducedMotion;
    private final Bitmap mark;
    private final Bitmap word;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bandPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stripePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint markPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint wordPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Camera camera = new Camera();

    private boolean running;
    private boolean finished;
    private long startNs = -1L;
    private OnSplashFinishedListener listener;

    public CineFlowSplashView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        reducedMotion = isReducedMotion();
        mark = loadBitmap("${CINEFLOW_SPLASH_MARK_NAME}");
        word = loadBitmap("${CINEFLOW_SPLASH_WORD_NAME}");
        // The reference draws both images with mix-blend-mode:multiply over the
        // gradient, so they have to blend with the backdrop rather than sit on
        // it. Blend modes need a software layer to be honoured.
        markPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));
        wordPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));
        setLayerType(LAYER_TYPE_SOFTWARE, null);
        setBackgroundColor(CANVAS);
        setContentDescription("CineFlow splash");
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
        // fit(): u is the reference's --k in pixels per CSS px.
        final float u = Math.min(w / (STAGE_W * density), h / (STAGE_H * density)) * density;
        final float stageW = STAGE_W * u;
        final float stageH = STAGE_H * u;
        final float ox = (w - stageW) / 2f;
        final float oy = (h - stageH) / 2f;

        // One layer so MULTIPLY composites against the gradient, never the window.
        final int layer = canvas.saveLayer(0f, 0f, w, h, null, Canvas.ALL_SAVE_FLAG);

        // 1. background: linear-gradient(160deg,#f5f7ff,#ede8ff)
        drawBackdrop(canvas, w, h);

        // 2. film strips: .fs live in the full-viewport .sp layer, so their
        //    anchors are 13.5% of the viewport and they span its full width.
        drawBands(canvas, w, h, u, t);

        // 3. artwork column: .ctr inside .stage
        final float markH = MARK_W * u * MARK_AR;
        final float wordH = WORD_W * u * WORD_AR;
        final float gap = CTR_GAP * u;
        final float total = markH + gap + wordH;
        final float contentTop = oy + Math.max(0f, ((STAGE_H * u - CTR_PAD_BOTTOM * u) - total) / 2f);
        final float cx = w / 2f;

        // .mk: flip 1.1s cubic-bezier(.2,.8,.2,1) .35s both
        final float fl = ease(progress(t, FLIP_DELAY, FLIP_DUR), 0.2f, 0.8f, 0.2f, 1f);
        markPaint.setAlpha(Math.round(255f * fl));
        drawFlipped(canvas, mark, cx, contentTop + markH / 2f, MARK_W * u, markH,
                lerp(FLIP_START_DEG, 0f, fl), lerp(FLIP_START_SCALE, 1f, fl),
                PERSPECTIVE * u, markPaint);

        // .tx: rise .8s ease .9s both
        final float rp = progress(t, RISE_DELAY, RISE_DUR);
        final float re = ease(rp, 0.25f, 0.1f, 0.25f, 1f);
        wordPaint.setAlpha(Math.round(255f * re));
        drawRisen(canvas, word, cx, contentTop + markH + gap + wordH / 2f,
                WORD_W * u, wordH, lerp(RISE_START * u, 0f, re), wordPaint);

        canvas.restoreToCount(layer);

        finishIfDue(t);
    }

    /** linear-gradient(160deg): centre line at 160deg from north, through the middle. */
    private void drawBackdrop(Canvas canvas, int w, int h) {
        canvas.drawColor(CANVAS);
        final double rad = Math.toRadians(GRAD_DEG);
        final float dx = (float) Math.sin(rad);
        final float dy = (float) -Math.cos(rad);
        final float cx = w / 2f;
        final float cy = h / 2f;
        final float half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2f;
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(new LinearGradient(cx - half * dx, cy - half * dy,
                cx + half * dx, cy + half * dy,
                new int[]{GRAD_START, GRAD_END}, null, Shader.TileMode.CLAMP));
        canvas.drawRect(0f, 0f, w, h, paint);
        paint.setShader(null);
    }

    /** .f1 / .f2: sx expansion, then the light stripes scrolling inside them. */
    private void drawBands(Canvas canvas, int w, int h, float u, float t) {
        final float bandH = BAND_H * u;
        final float sx = ease(progress(t, SX_DELAY, SX_DUR), 0.2f, 0.8f, 0.2f, 1f);
        final float topY = BAND_ANCHOR * h;
        final float botY = h - BAND_ANCHOR * h - bandH;
        bandPaint.setColor(BAND_COLOR);
        stripePaint.setColor(STRIPE_COLOR);

        final float phase = ((t % STRIPE_CYCLE_MS) / (float) STRIPE_CYCLE_MS) * STRIPE_PITCH * u;
        drawBand(canvas, 0f, topY, w, bandH, w * sx, u, phase, false);
        drawBand(canvas, w, botY, w, bandH, w * sx, u, phase, true);
    }

    private void drawBand(Canvas canvas, float originX, float top, float fullW, float bandH,
                          float shownW, float u, float phase, boolean reversed) {
        if (shownW <= 0f) return;
        final float left = reversed ? originX - shownW : originX;
        final int save = canvas.save();
        canvas.clipRect(left, top, left + shownW, top + bandH);
        canvas.drawRect(left, top, left + shownW, top + bandH, bandPaint);

        final float stripeY = top + STRIPE_INSET * u;
        final float stripeH = STRIPE_H * u;
        final float pitch = STRIPE_PITCH * u;
        final float lit = STRIPE_LIT * u;
        final float offset = reversed ? phase : -phase;
        float x = left + offset - pitch;
        while (x < left + shownW) {
            canvas.drawRect(x, stripeY, x + lit, stripeY + stripeH, stripePaint);
            x += pitch;
        }
        canvas.restoreToCount(save);
    }

    /** rotateY about the artwork centre with the reference's perspective. */
    private void drawFlipped(Canvas canvas, Bitmap bmp, float cx, float cy, float w, float h,
                             float angleDeg, float scale, float persp, Paint p) {
        if (bmp == null || p.getAlpha() == 0) return;
        final int save = canvas.save();
        canvas.translate(cx, cy);
        if (scale != 1f) canvas.scale(scale, scale);
        final Matrix m = new Matrix();
        camera.save();
        camera.setLocation(0f, 0f, -persp);
        camera.rotateY(angleDeg);
        camera.getMatrix(m);
        camera.restore();
        m.preTranslate(-w / 2f, -h / 2f);
        m.postTranslate(w / 2f, h / 2f);
        canvas.concat(m);
        canvas.drawBitmap(bmp, null, new RectF(0f, 0f, w, h), p);
        canvas.restoreToCount(save);
    }

    /** translateY about the artwork centre. */
    private void drawRisen(Canvas canvas, Bitmap bmp, float cx, float cy, float w, float h,
                           float dy, Paint p) {
        if (bmp == null || p.getAlpha() == 0) return;
        final int save = canvas.save();
        canvas.translate(cx, cy + dy);
        canvas.drawBitmap(bmp, null, new RectF(-w / 2f, -h / 2f, w / 2f, h / 2f), p);
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
        return clamp01((t - delay) / (float) dur);
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
