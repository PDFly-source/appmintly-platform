/**
 * Studyria launch splash — the owner-supplied `Studyria_Splash.html`, drawn with
 * the platform Canvas so the first frame is ready with the activity's first
 * layout. No WebView, no network, no animation framework.
 *
 * Provenance: the owner's reference file (64,448 bytes, SHA-256
 * d41817e6f52960a24291ab090761b76e1166112c076da56c3aafa684f4a6c91e) and the two
 * JPEGs it embeds (see studyria-splash-assets.ts). tests/studyria-splash.test.ts
 * re-extracts both images from the reference and compares their digests, so the
 * bytes shipped in the APK are the owner's artwork.
 *
 * Final CSS cascade, as actually rendered (later rules win):
 *   .sp      background:#fbfaf7 + repeating lines (1k thick every 32k, from 31k)
 *   .ml      left:34k; width:1px (a CSS px — it never scales with --k)
 *            rgba(190,25,25,.3); transform-origin:top; gy .9s ease .1s both
 *   .mk      165px wide; opacity 0 / translateY(-36px) / scale(.94) ->
 *            identity; settle 1s cubic-bezier(.2,.8,.2,1) .25s both
 *   .tx      200px wide; clip-path inset(0 100% 0 0) -> inset(0);
 *            wipe 1s cubic-bezier(.6,0,.2,1) .95s both
 *   .pb      60px insets, bottom 54px, height 5px, radius 5px,
 *            track rgba(0,0,0,.07), fill linear-gradient(90deg,#15151a,#b30f10),
 *            fill 2.4s cubic-bezier(.4,0,.2,1) .6s both
 *   both JPEGs are mix-blend-mode:multiply over the ruled canvas
 *   prefers-reduced-motion disables every animation — the bar is left UNFILLED
 *   (its width comes only from @keyframes fill), everything else renders final.
 */
import {
  BAR_BOTTOM,
  BAR_H,
  BAR_INSET,
  GAP,
  MARK_AR_DEN,
  MARK_AR_NUM,
  MARK_W,
  PAD_BOTTOM,
  STAGE_H,
  STAGE_W,
  WORD_AR_DEN,
  WORD_AR_NUM,
  WORD_W,
} from './studyria-geometry';
import {
  STUDYRIA_SPLASH_MARK_JPEG_BASE64,
  STUDYRIA_SPLASH_MARK_SHA256,
  STUDYRIA_SPLASH_WORD_JPEG_BASE64,
  STUDYRIA_SPLASH_WORD_SHA256,
} from './studyria-splash-assets';

export { STUDYRIA_SPLASH_MARK_SHA256, STUDYRIA_SPLASH_WORD_SHA256 };

export const STUDYRIA_SPLASH_PACKAGE = 'com.appforge.studyria';

/** Reference window.SPLASH_MS. */
export const STUDYRIA_SPLASH_MS = 3400;

/** `.sp` canvas — also the window, system-splash and animated-view colour. */
export const STUDYRIA_SPLASH_BG = '#FBFAF7';

/** Fail-safe dismissal if the first content frame never arrives. */
export const STUDYRIA_SPLASH_HARD_TIMEOUT_MS = 12000;

export const STUDYRIA_SPLASH_MARK_NAME = 'studyria_splash_mark';
export const STUDYRIA_SPLASH_WORD_NAME = 'studyria_splash_word';
export const STUDYRIA_SPLASH_ICON_NAME = 'studyria_splash_transparent_icon';

export function studyriaSplashMarkJpeg(): Buffer {
  return Buffer.from(STUDYRIA_SPLASH_MARK_JPEG_BASE64, 'base64');
}

export function studyriaSplashWordJpeg(): Buffer {
  return Buffer.from(STUDYRIA_SPLASH_WORD_JPEG_BASE64, 'base64');
}

export function studyriaSplashColorEntries(): string {
  return `    <color name="studyria_splash_bg">${STUDYRIA_SPLASH_BG}</color>`;
}

export function studyriaSplashStylesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/studyria_splash_bg</item>
    </style>
</resources>`;
}

/**
 * Android 12+ system splash: the same flat canvas, and an invisible icon.
 *
 * The reference composition has no launcher mark in it, so the system splash
 * must not draw one. A transparent animated icon removes both the launcher
 * glyph and the icon zoom, leaving a flat #FBFAF7 surface that hands over to
 * the animated view with no colour change and no shape change.
 */
export function studyriaSplashStylesV31Xml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/studyria_splash_bg</item>
        <item name="android:windowSplashScreenBackground">@color/studyria_splash_bg</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/${STUDYRIA_SPLASH_ICON_NAME}</item>
    </style>
</resources>`;
}

/** Transparent drawable used as the (invisible) system-splash icon. */
export function studyriaSplashTransparentIconXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#00000000" />
</shape>`;
}

/**
 * The complete `StudyriaSplashView.java` source.
 *
 * Geometry is the reference's own model: a 228x488 stage scaled by
 * u = min(width/228, height/488) and centred, with the artwork column centred in
 * the stage's 44px-bottom-padded content box (gap 12px). In design px that puts
 * the mark at y=125.163 (height 122.964) and the wordmark at y=260.127
 * (height 58.710); the bar occupies y=429..434 inset 60px on each side.
 */
export function studyriaSplashJava(pkg: string): string {
  return `package ${pkg};

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.graphics.Shader;
import android.provider.Settings;
import android.util.Log;
import java.io.File;
import java.io.FileOutputStream;
import android.view.View;

/**
 * Studyria launch splash — the owner-supplied Studyria_Splash.html drawn with
 * the platform Canvas. Generated by lib/splash/studyria-splash.ts; do not edit
 * the generated copy.
 */
public class StudyriaSplashView extends View {

    public interface OnSplashFinishedListener {
        void onSplashFinished();
    }

    /** Reference window.SPLASH_MS. */
    private static final long DURATION_MS = ${STUDYRIA_SPLASH_MS}L;

    // ---- reference stage (CSS px == design px) ----
    private static final float STAGE_W = ${STAGE_W}f;
    private static final float STAGE_H = ${STAGE_H}f;
    private static final float CTR_PAD_BOTTOM = ${PAD_BOTTOM}f;
    private static final float CTR_GAP = ${GAP}f;
    private static final float MARK_W = ${MARK_W}f;
    private static final float WORD_W = ${WORD_W}f;
    private static final float MARK_AR = ${MARK_AR_NUM}f / ${MARK_AR_DEN}f;   // mark JPEG aspect
    private static final float WORD_AR = ${WORD_AR_NUM}f / ${WORD_AR_DEN}f;   // wordmark JPEG aspect

    // ---- .sp ruled canvas ----
    private static final int CANVAS = Color.parseColor("${STUDYRIA_SPLASH_BG}");
    private static final int LINE_COLOR = 0x0E14141E;   // rgba(20,20,30,.055)
    private static final float LINE_OFFSET = 31f;       // line starts at 31k
    private static final float LINE_PERIOD = 32f;       // and repeats every 32k

    // ---- .ml margin rule ----
    private static final int RULE_COLOR = 0x4DBE1919;   // rgba(190,25,25,.3)
    private static final float RULE_LEFT = 34f;
    private static final long RULE_DELAY = 100L, RULE_DUR = 900L;

    // ---- .mk settle ----
    private static final float SETTLE_FROM_Y = -36f;
    private static final float SETTLE_FROM_SCALE = 0.94f;
    private static final long SETTLE_DELAY = 250L, SETTLE_DUR = 1000L;

    // ---- .tx wipe ----
    private static final long WIPE_DELAY = 950L, WIPE_DUR = 1000L;

    // ---- .pb progress bar ----
    private static final float BAR_INSET = ${BAR_INSET}f;
    private static final float BAR_BOTTOM = ${BAR_BOTTOM}f;
    private static final float BAR_H = ${BAR_H}f;
    private static final int BAR_TRACK = 0x12000000;    // rgba(0,0,0,.07)
    private static final int BAR_FILL_FROM = 0xFF15151A;
    private static final int BAR_FILL_TO = 0xFFB30F10;
    private static final long FILL_DELAY = 600L, FILL_DUR = 2400L;

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint linePaint = new Paint();
    private final Paint rulePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint markPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint wordPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final RectF rect = new RectF();

    private final float density;
    private final boolean reducedMotion;
    private final Bitmap mark;
    private final Bitmap word;

    private OnSplashFinishedListener listener;
    private long startNs = -1L;
    private float barLogMs = -1000f;
    private boolean running = false;
    private boolean finished = false;
    // Frame-dump instrumentation: the view renders itself into a bitmap at the
    // two evidence moments so the drawn pixels can be inspected independently of
    // screencap. No effect on what is drawn to the screen.
    private boolean dumping = false;
    private boolean dumped1200 = false;
    private boolean dumped2900 = false;

    public StudyriaSplashView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        reducedMotion = isReducedMotion();
        mark = loadBitmap("${STUDYRIA_SPLASH_MARK_NAME}");
        word = loadBitmap("${STUDYRIA_SPLASH_WORD_NAME}");
        // Both JPEGs are mix-blend-mode:multiply in the reference, so they have
        // to blend with the ruled canvas rather than sit on top of it.
        markPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));
        wordPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.MULTIPLY));
        markPaint.setFilterBitmap(true);
        wordPaint.setFilterBitmap(true);
        linePaint.setColor(LINE_COLOR);
        linePaint.setStyle(Paint.Style.FILL);
        rulePaint.setColor(RULE_COLOR);
        rulePaint.setStyle(Paint.Style.FILL);
        paint.setStyle(Paint.Style.FILL);
        // A software layer keeps MULTIPLY compositing against the backdrop.
        setLayerType(LAYER_TYPE_SOFTWARE, null);
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
            Log.i("StudyriaSplash", "attach durationMs=" + DURATION_MS + " reducedMotion=" + reducedMotion);
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
        // fit(): u is the reference's --k, in device px per design px.
        final float u = Math.min(w / STAGE_W, h / STAGE_H);
        final float stageW = STAGE_W * u;
        final float stageH = STAGE_H * u;
        final float ox = (w - stageW) / 2f;
        final float oy = (h - stageH) / 2f;

        // One layer so MULTIPLY composites against the ruled canvas, not the window.
        final int layer = canvas.saveLayer(0f, 0f, w, h, null, Canvas.ALL_SAVE_FLAG);

        canvas.drawColor(CANVAS);
        drawRuledCanvas(canvas, w, h, u);
        drawMarginRule(canvas, h, u, t);

        final float markW = MARK_W * u;
        final float markH = markW * MARK_AR;
        final float wordW = WORD_W * u;
        final float wordH = wordW * WORD_AR;
        final float colH = markH + CTR_GAP * u + wordH;
        final float colTop = oy + ((STAGE_H * u - CTR_PAD_BOTTOM * u) - colH) / 2f;
        final float markX = ox + (stageW - markW) / 2f;
        final float wordX = ox + (stageW - wordW) / 2f;
        final float wordY = colTop + markH + CTR_GAP * u;

        drawMark(canvas, markX, colTop, markW, markH, u, t);
        drawWord(canvas, wordX, wordY, wordW, wordH, t);
        drawBar(canvas, ox, oy, stageW, u, t);

        canvas.restoreToCount(layer);

        if (!finished && t >= DURATION_MS) {
            finished = true;
            if (listener != null) listener.onSplashFinished();
        }
        if (running && !finished) {
            postInvalidateOnAnimation();
        }
        maybeDumpFrame(canvas, t, u, stageW, stageH, ox, oy);
    }

    /** Logs the real geometry the pixels come from, and dumps the drawn frame. */
    private void maybeDumpFrame(Canvas canvas, float t, float u, float stageW, float stageH,
                                float ox, float oy) {
        if (dumping) return;
        final boolean early = !dumped1200 && t >= 1180f;
        final boolean late = !dumped2900 && t >= 2880f;
        if (!early && !late) return;
        if (early) dumped1200 = true;
        if (late) dumped2900 = true;

        final float left = ox + BAR_INSET * u;
        final float right = ox + stageW - BAR_INSET * u;
        final float bottom = oy + (STAGE_H - BAR_BOTTOM) * u;
        final float top = bottom - BAR_H * u;
        final float p = reducedMotion ? 0f : easeFill(progress(t, FILL_DELAY, FILL_DUR));
        final float fillW = (right - left) * p;

        final float[] m = new float[9];
        canvas.getMatrix().getValues(m);
        final android.graphics.Rect clip = canvas.getClipBounds();
        final int[] loc = new int[2];
        getLocationOnScreen(loc);
        Log.i("StudyriaSplash", "geo " + (early ? "1200" : "2900")
                + " t=" + Math.round(t)
                + " view=" + getWidth() + "x" + getHeight()
                + " screen=" + loc[0] + "," + loc[1]
                + " u=" + u
                + " stage=" + Math.round(stageW) + "x" + Math.round(stageH)
                + " ox=" + Math.round(ox) + " oy=" + Math.round(oy)
                + " matrix=" + m[0] + "," + m[1] + "," + m[2] + ";" + m[3] + "," + m[4] + "," + m[5]
                + " clip=" + clip.left + "," + clip.top + "," + clip.right + "," + clip.bottom
                + " track=" + Math.round(left) + "," + Math.round(top) + ","
                + Math.round(right) + "," + Math.round(bottom)
                + " fill=" + Math.round(left) + "," + Math.round(top) + ","
                + Math.round(left + fillW) + "," + Math.round(bottom)
                + " fillW=" + Math.round(fillW)
                + " alpha=" + paint.getAlpha()
                + " shader=" + (paint.getShader() != null));

        final Bitmap shot = Bitmap.createBitmap(getWidth(), getHeight(), Bitmap.Config.ARGB_8888);
        final Canvas bc = new Canvas(shot);
        dumping = true;
        try {
            draw(bc);
        } catch (Throwable ignored) {
        } finally {
            dumping = false;
        }
        savePng(shot, "splash_view_" + (early ? "1200" : "2900"));
        shot.recycle();
    }

    private void savePng(Bitmap bmp, String name) {
        try {
            final File dir = getContext().getExternalFilesDir(null);
            if (dir == null) {
                Log.i("StudyriaSplash", "dump " + name + " skipped: no external files dir");
                return;
            }
            final File f = new File(dir, name + ".png");
            final FileOutputStream fos = new FileOutputStream(f);
            bmp.compress(Bitmap.CompressFormat.PNG, 100, fos);
            fos.close();
            Log.i("StudyriaSplash", "dump " + name + " path=" + f.getAbsolutePath()
                    + " bytes=" + f.length() + " size=" + bmp.getWidth() + "x" + bmp.getHeight());
        } catch (Throwable e) {
            Log.i("StudyriaSplash", "dump " + name + " failed: " + e);
        }
    }

    /** .sp: repeating 1k rule lines every 32k, the first starting at 31k. */
    private void drawRuledCanvas(Canvas canvas, int w, int h, float u) {
        final float step = LINE_PERIOD * u;
        if (step <= 0f) return;
        final float thick = Math.max(1f, u);
        float y = LINE_OFFSET * u;
        while (y < h) {
            canvas.drawRect(0f, y, w, y + thick, linePaint);
            y += step;
        }
    }

    /** .ml: 1 CSS px wide, 34k in from the viewport's left edge, grown from the top. */
    private void drawMarginRule(Canvas canvas, int h, float u, float t) {
        final float p = reducedMotion ? 1f : easeRule(progress(t, RULE_DELAY, RULE_DUR));
        if (p <= 0f) return;
        final float x = RULE_LEFT * u;
        // width:1px is a CSS pixel, not a design pixel: it never scales with --k.
        final float width = Math.max(1f, density);
        canvas.drawRect(x, 0f, x + width, h * p, rulePaint);
    }

    /** .mk: settle — opacity 0, translateY(-36px), scale(.94) into place. */
    private void drawMark(Canvas canvas, float x, float y, float w, float h, float u, float t) {
        if (mark == null) return;
        final float p = reducedMotion ? 1f : easeSettle(progress(t, SETTLE_DELAY, SETTLE_DUR));
        final float scale = SETTLE_FROM_SCALE + (1f - SETTLE_FROM_SCALE) * p;
        final float dy = SETTLE_FROM_Y * u * (1f - p);
        final int save = canvas.save();
        canvas.translate(x + w / 2f, y + h / 2f + dy);
        canvas.scale(scale, scale);
        markPaint.setAlpha((int) Math.round(p * 255f));
        rect.set(-w / 2f, -h / 2f, w / 2f, h / 2f);
        canvas.drawBitmap(mark, null, rect, markPaint);
        canvas.restoreToCount(save);
    }

    /** .tx: wipe — clip-path inset(0 100% 0 0) opening to inset(0). */
    private void drawWord(Canvas canvas, float x, float y, float w, float h, float t) {
        if (word == null) return;
        final float p = reducedMotion ? 1f : easeWipe(progress(t, WIPE_DELAY, WIPE_DUR));
        if (p <= 0f) return;
        final int save = canvas.save();
        canvas.clipRect(x, y, x + w * p, y + h);
        wordPaint.setAlpha(255);
        rect.set(x, y, x + w, y + h);
        canvas.drawBitmap(word, null, rect, wordPaint);
        canvas.restoreToCount(save);
    }

    /**
     * .pb: a 5k pill, 60k in from each side of the stage and 54k off its bottom.
     * Under prefers-reduced-motion the reference leaves it unfilled, because the
     * width only ever comes from @keyframes fill.
     */
    private void drawBar(Canvas canvas, float ox, float oy, float stageW, float u, float t) {
        final float left = ox + BAR_INSET * u;
        final float right = ox + stageW - BAR_INSET * u;
        final float bottom = oy + (STAGE_H - BAR_BOTTOM) * u;
        final float top = bottom - BAR_H * u;
        final float radius = (BAR_H * u) / 2f;

        paint.setShader(null);
        paint.setColor(BAR_TRACK);
        rect.set(left, top, right, bottom);
        canvas.drawRoundRect(rect, radius, radius, paint);

        final float p = reducedMotion ? 0f : easeFill(progress(t, FILL_DELAY, FILL_DUR));
        final float fillW = (right - left) * p;
        // The bar-fill assertion reads THIS number: it is the same variable the
        // draw call below uses, so logged progress can never disagree with the
        // pixels. Throttled to ~4 lines a second, so 3.4s logs about 14 lines.
        if (!dumping && t - barLogMs >= 250f) {
            barLogMs = t;
            Log.i("StudyriaSplash", "t=" + Math.round(t)
                    + " progress=" + Math.round(p * 1000)
                    + " fillW=" + Math.round(fillW)
                    + " track=" + Math.round(left) + "," + Math.round(top) + ","
                    + Math.round(right) + "," + Math.round(bottom)
                    + " reducedMotion=" + reducedMotion);
        }
        if (fillW <= 0f) return;
        paint.setShader(new LinearGradient(left, top, right, top,
                new int[]{BAR_FILL_FROM, BAR_FILL_TO}, null, Shader.TileMode.CLAMP));
        rect.set(left, top, left + fillW, bottom);
        canvas.drawRoundRect(rect, radius, radius, paint);
        paint.setShader(null);
    }

    private static float progress(float t, long delay, long dur) {
        if (t <= delay) return 0f;
        if (t >= delay + dur) return 1f;
        return (t - delay) / (float) dur;
    }

    /** CSS cubic-bezier(x1,y1,x2,y2): solve x(t)=p, return y(t). */
    private static float cubicBezier(float p, float x1, float y1, float x2, float y2) {
        if (p <= 0f) return 0f;
        if (p >= 1f) return 1f;
        float lo = 0f;
        float hi = 1f;
        float t = p;
        for (int i = 0; i < 24; i++) {
            final float x = bezier(t, x1, x2);
            if (Math.abs(x - p) < 0.0005f) break;
            if (x < p) {
                lo = t;
            } else {
                hi = t;
            }
            t = (lo + hi) / 2f;
        }
        return bezier(t, y1, y2);
    }

    private static float bezier(float t, float a, float b) {
        final float m = 1f - t;
        return 3f * m * m * t * a + 3f * m * t * t * b + t * t * t;
    }

    private static float easeSettle(float p) { return cubicBezier(p, 0.2f, 0.8f, 0.2f, 1f); }

    private static float easeWipe(float p) { return cubicBezier(p, 0.6f, 0f, 0.2f, 1f); }

    private static float easeFill(float p) { return cubicBezier(p, 0.4f, 0f, 0.2f, 1f); }

    private static float easeRule(float p) { return cubicBezier(p, 0.25f, 0.1f, 0.25f, 1f); }

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
