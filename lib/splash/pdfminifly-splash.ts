/**
 * PDFMiniFly launch splash — the owner-supplied `docs/splash/PDFMiniFly_Splash.html`
 * reference, reproduced natively for the PDFMiniFly build.
 *
 * WHY NATIVE (not a WebView):
 *   The reference must be the first pixel the user sees. A WebView splash costs a
 *   process/engine warm-up before its first frame, which either shows a blank
 *   window or re-introduces a flash between the system splash and the animation.
 *   This port draws with the platform Canvas instead: the first frame is ready in
 *   the same vsync as the activity's first layout, needs no engine, no bundled
 *   HTML, no JavaScript, and cannot be affected by a WebView update.
 *
 * SCOPE: only builds of the PDFMiniFly package id (`com.appforge.pdfminifly`)
 * receive this splash. Every other app built by lib/apk-builder.ts — including
 * AppMintly, whose splash is a different design in lib/splash/appmintly-splash.ts —
 * keeps its generated project byte-for-byte.
 *
 * THE REFERENCE, AS IT ACTUALLY COMPUTES (CSS px == dp, stage 228x488):
 *   The stylesheet declares some properties twice. The LATER rules win, so the
 *   port follows the final cascade, not the earlier duplicates:
 *     background  `.sp` final = linear-gradient(180deg,#fff,#fff0ec)
 *                 (the earlier flat `#fff4f1` is overridden)
 *     glow        `.rgl` 270dp circle, centred at stage (114,190),
 *                 radial-gradient(circle, rgba(255,70,40,.24), transparent 68%),
 *                 animation glow 1.2s ease .3s both (opacity 0->1, scale .6->1)
 *     logo        `.mk` 165dp wide, animation DROP .95s cubic-bezier(.3,.8,.3,1)
 *                 .2s both — the later rule overrides the earlier `zoom`
 *                 keyframes: 0% translateY(130) rotate(-8) scale(.8) opacity 0,
 *                 60% translateY(-10) rotate(2) scale(1.03) opacity 1, 100% rest
 *     wordmark    `.tx` 185dp wide, animation WIPE .9s cubic-bezier(.6,0,.2,1)
 *                 .95s both — the later rule overrides the earlier `rise`;
 *                 clip-path inset(0 100% 0 0) -> inset(0), i.e. reveal left-to-right
 *     column      `.ctr` centred column, gap 12dp, padding-bottom 44dp
 *     progress    `.pb` inline override left/right 70dp (not the sheet's 60dp),
 *                 bottom 54dp, height 5dp, radius 5dp,
 *                 track rgba(215,25,32,.12), fill
 *                 linear-gradient(90deg,#d71920,#ff7a1a),
 *                 animation fill 2.4s cubic-bezier(.4,0,.2,1) .6s both (width 0->100%)
 *     duration    window.SPLASH_MS = 3400
 *   Both images are drawn with `mix-blend-mode:multiply`, like the reference's
 *   `.ctr img`.
 *
 * REDUCED MOTION: the reference disables every animation under
 * `prefers-reduced-motion`. The port reproduces that end state: artwork fully
 * placed, the glow still at its base opacity 0, the progress bar at width 0.
 */
import {
  PDFMINIFLY_SPLASH_LOGO_JPEG_BASE64,
  PDFMINIFLY_SPLASH_WORD_JPEG_BASE64,
} from './pdfminifly-splash-assets';

/** Package id of the PDFMiniFly build — the only package that gets this splash. */
export const PDFMINIFLY_SPLASH_PACKAGE = 'com.appforge.pdfminifly';

/** Reference `window.SPLASH_MS`. */
export const PDFMINIFLY_SPLASH_MS = 3400;

/** Reference canvas colour: the top stop of the final `.sp` gradient. */
export const PDFMINIFLY_SPLASH_BG = '#FFFFFF';

/** Startup safety net: the splash can never outlive this. */
export const PDFMINIFLY_SPLASH_HARD_TIMEOUT_MS = 12000;

export const PDFMINIFLY_SPLASH_LOGO_NAME = 'pdfminifly_splash_logo';
export const PDFMINIFLY_SPLASH_WORD_NAME = 'pdfminifly_splash_word';
export const PDFMINIFLY_SPLASH_ICON_NAME = 'pdfminifly_splash_transparent_icon';

/** The two embedded images, extracted byte-for-byte from the reference HTML. */
export function pdfminiflySplashLogoJpeg(): Buffer {
  return Buffer.from(PDFMINIFLY_SPLASH_LOGO_JPEG_BASE64, 'base64');
}

export function pdfminiflySplashWordJpeg(): Buffer {
  return Buffer.from(PDFMINIFLY_SPLASH_WORD_JPEG_BASE64, 'base64');
}

/** colors.xml entries that only the PDFMiniFly build receives. */
export function pdfminiflySplashColorEntries(): string {
  return `    <color name="pdfminifly_splash_bg">${PDFMINIFLY_SPLASH_BG}</color>`;
}

/**
 * Launch theme. The window background is the gradient's top stop, so there is no
 * colour break before the animated view draws, and no older gradient anywhere.
 */
export function pdfminiflySplashStylesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/pdfminifly_splash_bg</item>
    </style>
</resources>`;
}

/**
 * Android 12+ system splash: the same white surface with a fully transparent
 * icon, so the platform paints a neutral window for the frames before the
 * activity takes over. No brand tile, no halo, no old artwork.
 */
export function pdfminiflySplashStylesV31Xml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/pdfminifly_splash_bg</item>
        <item name="android:windowSplashScreenBackground">@color/pdfminifly_splash_bg</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/${PDFMINIFLY_SPLASH_ICON_NAME}</item>
    </style>
</resources>`;
}

/** Transparent drawable used as the (invisible) system-splash icon. */
export function pdfminiflySplashTransparentIconXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#00000000" />
</shape>`;
}

/**
 * The complete `PdfMiniFlySplashView.java` source. Pure Canvas drawing: no
 * WebView, no network, no animation framework, no external assets.
 */
export function pdfminiflySplashJava(packageId: string): string {
  return `package ${packageId};

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
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
 * PDFMiniFly launch splash — the owner-supplied PDFMiniFly_Splash.html, drawn
 * with the platform Canvas so the first frame is ready with the activity's
 * first layout. Generated by lib/splash/pdfminifly-splash.ts; do not edit the
 * generated copy.
 */
public class PdfMiniFlySplashView extends View {

    public interface OnSplashFinishedListener {
        void onSplashFinished();
    }

    /** Reference window.SPLASH_MS. */
    private static final long DURATION_MS = ${PDFMINIFLY_SPLASH_MS}L;

    // ---- reference stage (CSS px == dp) ----
    private static final float STAGE_W = 228f;
    private static final float STAGE_H = 488f;
    private static final float GLOW_D = 270f;          // .rgl width/height
    private static final float GLOW_CY = 190f;         // .cc top
    private static final float COLUMN_GAP = 12f;       // .ctr gap
    private static final float COLUMN_PAD_BOTTOM = 44f;// .ctr padding-bottom
    private static final float LOGO_W = 165f;          // .mk width
    private static final float WORD_W = 185f;          // .tx width
    private static final float BAR_INSET_X = 70f;      // .pb inline left/right
    private static final float BAR_BOTTOM = 54f;       // .pb bottom
    private static final float BAR_H = 5f;             // .pb height

    // ---- palette (final cascade) ----
    private static final int BG_TOP = 0xFFFFFFFF;      // #fff
    private static final int BG_BOTTOM = 0xFFFFF0EC;   // #fff0ec
    private static final int GLOW_COLOR = 0x3DFF4628;  // rgba(255,70,40,.24)
    private static final int BAR_TRACK = 0x1FD71920;   // rgba(215,25,32,.12)
    private static final int BAR_FILL_START = 0xFFD71920;
    private static final int BAR_FILL_END = 0xFFFF7A1A;

    // ---- timeline: delay + duration from the final animation declarations ----
    private static final long LOGO_DELAY = 200L, LOGO_DUR = 950L;   // drop
    private static final long WORD_DELAY = 950L, WORD_DUR = 900L;   // wipe
    private static final long GLOW_DELAY = 300L, GLOW_DUR = 1200L;  // glow
    private static final long BAR_DELAY = 600L, BAR_DUR = 2400L;    // fill

    private final float density;
    private final boolean reducedMotion;
    private final Bitmap logo;
    private final Bitmap word;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint artPaint = new Paint(Paint.FILTER_BITMAP_FLAG);

    private boolean running;
    private boolean finished;
    private long startNs = -1L;
    private OnSplashFinishedListener listener;

    public PdfMiniFlySplashView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        reducedMotion = isReducedMotion();
        logo = loadBitmap("${PDFMINIFLY_SPLASH_LOGO_NAME}");
        word = loadBitmap("${PDFMINIFLY_SPLASH_WORD_NAME}");
        // The reference draws both images with mix-blend-mode:multiply over the
        // gradient and glow, so they must blend with the backdrop rather than
        // sit on it. Blend modes need a software layer to be honoured.
        artPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));
        setLayerType(LAYER_TYPE_SOFTWARE, null);
        setBackgroundColor(BG_TOP);
        setContentDescription("PDFMiniFly");
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

        // 1. background: linear-gradient(180deg,#fff,#fff0ec)
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(new LinearGradient(0f, 0f, 0f, h, BG_TOP, BG_BOTTOM, Shader.TileMode.CLAMP));
        canvas.drawRect(0f, 0f, w, h, paint);
        paint.setShader(null);

        // 2. coral glow behind the artwork (.rgl .cc): 270dp circle at stage (114,190)
        if (!reducedMotion) {
            final float gp = ease(progress(t, GLOW_DELAY, GLOW_DUR), 0.25f, 0.1f, 0.25f, 1f);
            if (gp > 0f) {
                final float gcx = ox + (STAGE_W / 2f) * u;
                final float gcy = oy + GLOW_CY * u;
                final float radius = (GLOW_D / 2f) * u * lerp(0.6f, 1f, gp);
                paint.setShader(new RadialGradient(
                        gcx, gcy, radius,
                        new int[]{GLOW_COLOR, GLOW_COLOR & 0x00FFFFFF},
                        new float[]{0f, 0.68f},
                        Shader.TileMode.CLAMP));
                paint.setAlpha(Math.round(255f * gp));
                canvas.drawCircle(gcx, gcy, radius, paint);
                paint.setAlpha(255);
                paint.setShader(null);
            }
        }

        if (logo == null || word == null) {
            finishIfDue(t);
            return;
        }

        // 3. centred column: logo, 12dp gap, wordmark; padding-bottom 44dp
        final float colCx = ox + (STAGE_W / 2f) * u;
        final float logoW = LOGO_W * u;
        final float logoH = logoW * ((float) logo.getHeight() / (float) logo.getWidth());
        final float wordW = WORD_W * u;
        final float wordH = wordW * ((float) word.getHeight() / (float) word.getWidth());
        final float contentH = logoH + COLUMN_GAP * u + wordH;
        final float areaH = (STAGE_H - COLUMN_PAD_BOTTOM) * u;
        final float top = oy + Math.max(0f, (areaH - contentH) / 2f);
        final RectF logoDst = new RectF(colCx - logoW / 2f, top, colCx + logoW / 2f, top + logoH);
        final RectF wordDst = new RectF(
                colCx - wordW / 2f,
                logoDst.bottom + COLUMN_GAP * u,
                colCx + wordW / 2f,
                logoDst.bottom + COLUMN_GAP * u + wordH);

        // 3a. logo: animation drop .95s cubic-bezier(.3,.8,.3,1) .2s both
        if (reducedMotion) {
            canvas.drawBitmap(logo, null, logoDst, artPaint);
        } else {
            final float raw = progress(t, LOGO_DELAY, LOGO_DUR);
            float ty;
            float rot;
            float scale;
            float alpha;
            if (raw < 0.6f) {
                final float s = ease(raw / 0.6f, 0.3f, 0.8f, 0.3f, 1f);
                ty = lerp(130f, -10f, s);
                rot = lerp(-8f, 2f, s);
                scale = lerp(0.8f, 1.03f, s);
                alpha = s;
            } else {
                final float s = ease((raw - 0.6f) / 0.4f, 0.3f, 0.8f, 0.3f, 1f);
                ty = lerp(-10f, 0f, s);
                rot = lerp(2f, 0f, s);
                scale = lerp(1.03f, 1f, s);
                alpha = 1f;
            }
            final int save = canvas.save();
            canvas.translate(0f, ty * u);
            canvas.rotate(rot, logoDst.centerX(), logoDst.centerY());
            canvas.scale(scale, scale, logoDst.centerX(), logoDst.centerY());
            artPaint.setAlpha(Math.round(255f * clamp01(alpha)));
            canvas.drawBitmap(logo, null, logoDst, artPaint);
            artPaint.setAlpha(255);
            canvas.restoreToCount(save);
        }

        // 3b. wordmark: animation wipe .9s cubic-bezier(.6,0,.2,1) .95s both
        // clip-path inset(0 100% 0 0) -> inset(0): revealed left to right.
        final float reveal = reducedMotion
                ? 1f
                : ease(progress(t, WORD_DELAY, WORD_DUR), 0.6f, 0f, 0.2f, 1f);
        if (reveal > 0f) {
            final int save = canvas.save();
            canvas.clipRect(wordDst.left, wordDst.top, wordDst.left + wordDst.width() * clamp01(reveal), wordDst.bottom);
            canvas.drawBitmap(word, null, wordDst, artPaint);
            canvas.restoreToCount(save);
        }

        // 4. progress bar: track + fill, both fully rounded
        final float barL = ox + BAR_INSET_X * u;
        final float barR = ox + (STAGE_W - BAR_INSET_X) * u;
        final float barTop = oy + (STAGE_H - BAR_BOTTOM - BAR_H) * u;
        final float barH = BAR_H * u;
        final float radius = barH / 2f;
        paint.setColor(BAR_TRACK);
        canvas.drawRoundRect(new RectF(barL, barTop, barR, barTop + barH), radius, radius, paint);
        final float fill = reducedMotion
                ? 0f
                : ease(progress(t, BAR_DELAY, BAR_DUR), 0.4f, 0f, 0.2f, 1f);
        if (fill > 0f) {
            final float fillRight = barL + (barR - barL) * clamp01(fill);
            paint.setShader(new LinearGradient(
                    barL, barTop, fillRight, barTop,
                    BAR_FILL_START, BAR_FILL_END, Shader.TileMode.CLAMP));
            canvas.drawRoundRect(new RectF(barL, barTop, fillRight, barTop + barH), radius, radius, paint);
            paint.setShader(null);
        }

        // Completion follows real time even under reduced motion: the
        // reference removes the motion, not the 3400ms splash window.
        finishIfDue(reducedMotion ? elapsedMs() : t);
    }

    /** Fires the listener once, at the reference duration, then stops drawing. */
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

    /** CSS cubic-bezier(x1,y1,x2,y2) as a timing function (Newton + bisection). */
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

    private Bitmap loadBitmap(String resourceName) {
        try {
            final int id = getResources().getIdentifier(resourceName, "drawable", getContext().getPackageName());
            if (id == 0) return null;
            final BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            return BitmapFactory.decodeResource(getResources(), id, opts);
        } catch (Throwable ignored) {
            return null;
        }
    }
}
`;
}
