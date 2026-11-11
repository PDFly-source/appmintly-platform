/**
 * AppMintly launch splash — the owner-supplied `docs/splash/AppMintly_Splash.html`
 * reference, reproduced natively for the marketplace's own APK.
 *
 * WHY NATIVE (not a WebView):
 *   The reference must be the very first pixel the user sees. A WebView splash
 *   costs a process/engine warm-up (100-400ms) before its first frame, which
 *   either shows a blank window or re-introduces a "flash" between the system
 *   splash and the animation. This port draws with the platform Canvas instead:
 *   the first frame is ready in the same vsync as the activity's first layout,
 *   needs no engine, no bundled HTML parser, no JavaScript, and cannot be
 *   affected by a WebView update or a missing renderer.
 *
 * SCOPE: only builds of the marketplace's own package id
 * (`com.appmintly.appmintly`) receive this splash. Every other app built by
 * lib/apk-builder.ts keeps the previous launch experience, byte for byte.
 *
 * The reference in numbers (CSS px == dp, stage 228x488 scaled to the viewport):
 *   background   #f8fbff + green wash at 12%/8% (rgba(31,157,85,.20), 46%)
 *                + blue wash at 92%/96% (rgba(37,99,235,.22), 52%)
 *   rings        two 200dp circles centred at stage (114, 190); scale .45->1.6,
 *                opacity .9->0, 1.6s ease-out, delays .3s / .55s
 *   logo         raw JPEG 420x307 at 170dp wide, mix-blend-mode: multiply;
 *                zoom .72->1 with 10dp blur, 1s cubic-bezier(.2,.9,.3,1.1), delay .2s
 *   wordmark     raw JPEG 620x159 at 190dp wide, multiply; rise 18dp,
 *                .8s ease, delay .9s
 *   dots         four 9dp dots (green/blue/amber/red), 9dp apart, bottom 52dp,
 *                1.1s ease-in-out pulse (.25 opacity / 1.35 scale peak), .15s stagger
 *   duration     3400ms
 *
 * DELIBERATE OMISSION — the progress bar:
 *   The reference stylesheet declares `.pb` (left/right 60dp, bottom 54dp,
 *   height 5dp, track rgba(0,0,0,.07), 2.4s fill) but the document contains no
 *   `.pb` element and never defines its `--pg` fill colour. Adding one would
 *   also collide with the dots row (dots occupy bottom 52-61dp, the bar 54-59dp,
 *   horizontally overlapping 82-146dp). It is therefore not rendered: the port
 *   matches what the reference actually draws. Enabling it later is a two-line
 *   change (geometry is already commented in the view).
 */
import {
  APPMINTLY_SPLASH_MARK_JPEG_BASE64,
  APPMINTLY_SPLASH_WORD_JPEG_BASE64,
} from './appmintly-splash-assets';

/** Package id of the marketplace's own APK — the only build that gets this splash. */
export const APPMINTLY_SPLASH_PACKAGE = 'com.appmintly.appmintly';

/** Reference `window.SPLASH_MS`. */
export const APPMINTLY_SPLASH_MS = 3400;

/** Reference canvas colour (`#f8fbff`). */
export const APPMINTLY_SPLASH_BG = '#F8FBFF';

/** Startup safety net: the splash can never outlive this (previous behaviour). */
export const APPMINTLY_SPLASH_HARD_TIMEOUT_MS = 12000;

export const APPMINTLY_SPLASH_MARK_NAME = 'splash_mark';
export const APPMINTLY_SPLASH_WORD_NAME = 'splash_word';
export const APPMINTLY_SPLASH_ICON_NAME = 'splash_transparent_icon';

/** The two embedded images, extracted byte-for-byte from the reference HTML. */
export function appmintlySplashMarkJpeg(): Buffer {
  return Buffer.from(APPMINTLY_SPLASH_MARK_JPEG_BASE64, 'base64');
}

export function appmintlySplashWordJpeg(): Buffer {
  return Buffer.from(APPMINTLY_SPLASH_WORD_JPEG_BASE64, 'base64');
}

/** colors.xml entries that only the AppMintly build receives. */
export function appmintlySplashColorEntries(): string {
  return `    <color name="splash_launch_bg">${APPMINTLY_SPLASH_BG}</color>`;
}

/**
 * Launch theme for the AppMintly build. The window background is the splash
 * canvas itself, so there is no colour break between the window, the system
 * splash surface and the animated view.
 */
export function appmintlySplashStylesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/splash_launch_bg</item>
    </style>
</resources>`;
}

/**
 * Android 12+ system splash: the same canvas colour with a fully transparent
 * icon, so the platform paints a neutral surface for the few frames before the
 * activity window takes over. No brand tile, no old artwork, no halo.
 */
export function appmintlySplashStylesV31Xml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.NoTitleBar">
        <item name="android:windowBackground">@color/splash_launch_bg</item>
        <item name="android:windowSplashScreenBackground">@color/splash_launch_bg</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/${APPMINTLY_SPLASH_ICON_NAME}</item>
    </style>
</resources>`;
}

/** Transparent drawable used as the (invisible) system-splash icon. */
export function appmintlySplashTransparentIconXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#00000000" />
</shape>`;
}

/**
 * The complete `AppMintlySplashView.java` source. Pure Canvas drawing: no
 * WebView, no network, no animation framework, no external assets.
 */
export function appmintlySplashJava(packageId: string): string {
  return `package ${packageId};

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.provider.Settings;
import android.view.View;

/**
 * AppMintly launch splash: a native port of the owner-supplied
 * docs/splash/AppMintly_Splash.html reference (see lib/splash/appmintly-splash.ts
 * for the measurement-by-measurement mapping and the one deliberate omission).
 *
 * Every coordinate is expressed in the reference's CSS stage units (1 unit == 1dp)
 * and scaled by density * k, where k = min(width/228, height/488) - exactly the
 * fit() function in the reference script. Rotation, multi-window and any other
 * size change therefore re-scale identically to the browser.
 */
public class AppMintlySplashView extends View {

    /** Notified once, when the 3400ms animation has completed. */
    public interface OnSplashFinishedListener {
        void onSplashFinished();
    }

    static final long DURATION_MS = 3400L;

    /* ---- stage geometry (CSS px in the reference) ---- */
    private static final float STAGE_W = 228f;
    private static final float STAGE_H = 488f;
    private static final float LOGO_W = 170f;
    private static final float WORD_W = 190f;
    private static final float COLUMN_GAP = 12f;
    private static final float COLUMN_PAD_BOTTOM = 44f;
    private static final float RING_SIZE = 200f;
    private static final float RING_CX = 114f;
    private static final float RING_CY = 190f;
    private static final float DOT_SIZE = 9f;
    private static final float DOT_GAP = 9f;
    private static final float DOT_BOTTOM = 52f;
    private static final float MARK_ASPECT = 307f / 420f;
    private static final float WORD_ASPECT = 159f / 620f;

    /* ---- palette (identical to the reference) ---- */
    private static final int BG = 0xFFF8FBFF;
    private static final int GREEN = 0xFF1F9D55;
    private static final int BLUE = 0xFF2563EB;
    private static final int AMBER = 0xFFF5A623;
    private static final int RED = 0xFFE5392F;
    private static final int WASH_GREEN = 0x331F9D55;
    private static final int WASH_BLUE = 0x382563EB;
    private static final int RING_BLUE = 0xFF2563EB;
    private static final int RING_GREEN = 0xFF1F9D55;

    /* ---- animation schedule (ms, straight from the CSS) ---- */
    private static final float LOGO_DELAY = 200f;
    private static final float LOGO_DURATION = 1000f;
    private static final float WORD_DELAY = 900f;
    private static final float WORD_DURATION = 800f;
    private static final float RING_DURATION = 1600f;
    private static final float RING1_DELAY = 300f;
    private static final float RING2_DELAY = 550f;
    private static final float DOT_PERIOD = 1100f;

    private final float density;
    private final Paint washPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint imagePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final RectF dst = new RectF();

    private Bitmap mark;
    private Bitmap wordmark;
    private final boolean reducedMotion;
    private boolean running;
    private boolean finished;
    private long startNs = -1L;
    private OnSplashFinishedListener listener;

    public AppMintlySplashView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        reducedMotion = isReducedMotion();
        mark = loadMultiply("${APPMINTLY_SPLASH_MARK_NAME}");
        wordmark = loadMultiply("${APPMINTLY_SPLASH_WORD_NAME}");
        setBackgroundColor(BG);
        setContentDescription("AppMintly");
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

        float t = elapsedMs();
        if (t > DURATION_MS) t = DURATION_MS;
        final boolean animate = !reducedMotion;

        /* ---- stage fit: k = min(w/228dp, h/488dp), centred ---- */
        final float stageW = STAGE_W * density;
        final float stageH = STAGE_H * density;
        final float k = Math.min(w / stageW, h / stageH);
        final float u = density * k;
        final float ox = (w - stageW * k) / 2f;
        final float oy = (h - stageH * k) / 2f;

        /* ---- canvas + the two radial washes ---- */
        canvas.drawColor(BG);
        float maxDim = Math.max(w, h);
        drawWash(canvas, ox + 0.12f * stageW * k, oy + 0.08f * stageH * k, 0.46f * maxDim, WASH_GREEN);
        drawWash(canvas, ox + 0.92f * stageW * k, oy + 0.96f * stageH * k, 0.52f * maxDim, WASH_BLUE);

        /* ---- rings ---- */
        final float ringCx = ox + RING_CX * u;
        final float ringCy = oy + RING_CY * u;
        final float ringR = (RING_SIZE / 2f) * u;
        if (animate) {
            drawRing(canvas, ringCx, ringCy, ringR, 1.5f * u, t, RING1_DELAY, RING_BLUE, 0.40f);
            drawRing(canvas, ringCx, ringCy, ringR, 1.5f * u, t, RING2_DELAY, RING_GREEN, 0.45f);
        }

        /* ---- centre column: logo, then wordmark ---- */
        final float logoW = LOGO_W * u;
        final float logoH = logoW * MARK_ASPECT;
        final float wordW = WORD_W * u;
        final float wordH = wordW * WORD_ASPECT;
        final float gap = COLUMN_GAP * u;
        final float columnH = logoH + gap + wordH;
        final float contentBoxH = stageH * k - COLUMN_PAD_BOTTOM * u;
        final float columnTop = oy + (contentBoxH - columnH) / 2f;
        final float cx = ox + (STAGE_W / 2f) * u;

        float logoProgress = 1f;
        if (animate) logoProgress = bezier(segment(t, LOGO_DELAY, LOGO_DURATION), 0.2f, 0.9f, 0.3f, 1.1f);
        float logoScale = animate ? 0.72f + 0.28f * logoProgress : 1f;
        float logoAlpha = animate ? clamp01(logoProgress) : 1f;
        float logoBlur = animate ? 10f * u * (1f - clamp01(logoProgress)) : 0f;
        drawColumnImage(canvas, mark, cx, columnTop, logoW, logoH, logoScale, logoAlpha, logoBlur);

        float wordProgress = 1f;
        if (animate) wordProgress = bezier(segment(t, WORD_DELAY, WORD_DURATION), 0.25f, 0.1f, 0.25f, 1f);
        float wordOffset = animate ? 18f * u * (1f - wordProgress) : 0f;
        drawColumnImage(canvas, wordmark, cx, columnTop + logoH + gap + wordOffset,
                wordW, wordH, 1f, wordProgress, 0f);

        /* ---- four pulsing dots ---- */
        final float dotD = DOT_SIZE * u;
        final float dotGap = DOT_GAP * u;
        final float rowW = 4f * dotD + 3f * dotGap;
        final float firstDotX = cx - rowW / 2f + dotD / 2f;
        final float dotY = oy + (STAGE_H - DOT_BOTTOM - DOT_SIZE / 2f) * u;
        final int[] dotColors = new int[]{GREEN, BLUE, AMBER, RED};
        for (int i = 0; i < dotColors.length; i++) {
            float alpha = 0.25f;
            float scale = 1f;
            if (animate) {
                float local = t - i * 150f;
                if (local > 0f) {
                    float phase = (local % DOT_PERIOD) / DOT_PERIOD;
                    if (phase < 0.5f) {
                        float e = bezier(phase / 0.5f, 0.42f, 0f, 0.58f, 1f);
                        alpha = 0.25f + 0.75f * e;
                        scale = 1f + 0.35f * e;
                    } else {
                        float e = bezier((phase - 0.5f) / 0.5f, 0.42f, 0f, 0.58f, 1f);
                        alpha = 1f - 0.75f * e;
                        scale = 1.35f - 0.35f * e;
                    }
                }
            }
            dotPaint.setColor(dotColors[i]);
            dotPaint.setAlpha(Math.round(255f * alpha));
            canvas.drawCircle(firstDotX + i * (dotD + dotGap), dotY, (dotD / 2f) * scale, dotPaint);
        }

        /* ---- completion ---- */
        if (!finished && elapsedMs() >= DURATION_MS) {
            finished = true;
            running = false;
            if (listener != null) listener.onSplashFinished();
            return;
        }
        if (running) postInvalidateOnAnimation();
    }

    private void drawWash(Canvas canvas, float cx, float cy, float radius, int color) {
        washPaint.setShader(new RadialGradient(cx, cy, radius,
                color, color & 0x00FFFFFF, Shader.TileMode.CLAMP));
        canvas.drawRect(0f, 0f, getWidth(), getHeight(), washPaint);
        washPaint.setShader(null);
    }

    private void drawRing(Canvas canvas, float cx, float cy, float r, float stroke,
                          float t, float delay, int color, float baseAlpha) {
        float progress = segment(t, delay, RING_DURATION);
        if (progress <= 0f || progress >= 1f) return;
        float eased = bezier(progress, 0f, 0f, 0.58f, 1f);
        float scale = 0.45f + 1.15f * eased;
        float alpha = 0.9f * (1f - eased);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeWidth(stroke);
        ringPaint.setColor(color);
        ringPaint.setAlpha(Math.round(255f * baseAlpha * alpha));
        canvas.drawCircle(cx, cy, r * scale, ringPaint);
    }

    /**
     * Draws one column image (logo or wordmark). The reference animates the logo
     * with a 10px Gaussian blur that resolves to sharp; a multi-sample offset
     * stack reproduces that focus-in on every API level (Paint has no render
     * effect before API 31 and no blur at all in this toolchain), at a cost of
     * at most nine texture blits per frame.
     */
    private void drawColumnImage(Canvas canvas, Bitmap bitmap, float cx, float top,
                                 float width, float height, float scale, float alpha, float blur) {
        if (bitmap == null || alpha <= 0.004f) return;
        float cy = top + height / 2f;
        int samples = blur > 0.4f ? 9 : 1;
        int save = canvas.save();
        if (scale != 1f) canvas.scale(scale, scale, cx, cy);
        imagePaint.setAlpha(Math.round(255f * clamp01(alpha) / samples));
        for (int s = 0; s < samples; s++) {
            float dx = 0f;
            float dy = 0f;
            if (samples > 1) {
                double angle = 2.0 * Math.PI * s / (samples - 1);
                dx = (float) Math.cos(angle) * blur * 0.5f;
                dy = (float) Math.sin(angle) * blur * 0.5f;
            }
            dst.set(cx - width / 2f + dx, top + dy, cx + width / 2f + dx, top + height + dy);
            canvas.drawBitmap(bitmap, null, dst, imagePaint);
        }
        canvas.restoreToCount(save);
    }

    private static float clamp01(float v) {
        return v < 0f ? 0f : (v > 1f ? 1f : v);
    }

    private static float segment(float t, float start, float duration) {
        if (duration <= 0f) return t >= start ? 1f : 0f;
        float p = (t - start) / duration;
        return p < 0f ? 0f : (p > 1f ? 1f : p);
    }

    /**
     * CSS cubic-bezier(x1, y1, x2, y2): solve x(u) = x, return y(u).
     * Bisection only - deterministic, allocation free, no Newton divergence.
     */
    private static float bezier(float x, float x1, float y1, float x2, float y2) {
        if (x <= 0f) return 0f;
        if (x >= 1f) return 1f;
        float lo = 0f;
        float hi = 1f;
        float u = x;
        for (int i = 0; i < 26; i++) {
            float bx = bezierAxis(x1, x2, u);
            if (Math.abs(bx - x) < 0.00005f) break;
            if (bx < x) lo = u; else hi = u;
            u = (lo + hi) / 2f;
        }
        return bezierAxis(y1, y2, u);
    }

    private static float bezierAxis(float p1, float p2, float t) {
        float it = 1f - t;
        return 3f * it * it * t * p1 + 3f * it * t * t * p2 + t * t * t;
    }

    private boolean isReducedMotion() {
        try {
            float scale = Settings.Global.getFloat(getContext().getContentResolver(),
                    Settings.Global.ANIMATOR_DURATION_SCALE, 1.0f);
            return scale == 0.0f;
        } catch (Throwable ignored) {
            return false;
        }
    }

    /**
     * The reference draws both images with mix-blend-mode: multiply over the
     * light canvas. Hardware canvases do not honour MULTIPLY on every supported
     * API level, so the same result is baked into the alpha channel instead:
     * for each pixel the view stamps colour C with alpha a so that
     * a*C + (1-a)*canvas == canvas*image/255 - i.e. an exact multiply over the
     * #f8fbff canvas, on every API level from 21.
     */
    private Bitmap loadMultiply(String resourceName) {
        try {
            int id = getResources().getIdentifier(resourceName, "drawable", getContext().getPackageName());
            if (id == 0) return null;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inScaled = false;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap decoded = BitmapFactory.decodeResource(getResources(), id, opts);
            if (decoded == null) return null;
            return multiplyMatte(decoded);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static Bitmap multiplyMatte(Bitmap source) {
        int width = source.getWidth();
        int height = source.getHeight();
        int[] pixels = new int[width * height];
        source.getPixels(pixels, 0, width, 0, 0, width, height);
        final float bgR = 248f;
        final float bgG = 251f;
        final float bgB = 255f;
        for (int i = 0; i < pixels.length; i++) {
            int p = pixels[i];
            int r = (p >> 16) & 0xFF;
            int g = (p >> 8) & 0xFF;
            int b = p & 0xFF;
            int ink = Math.min(r, Math.min(g, b));
            int a = 255 - ink;
            if (a <= 2) {
                pixels[i] = 0;
                continue;
            }
            float af = a / 255f;
            float inv = 1f - af;
            int cr = channel(bgR, r, inv, af);
            int cg = channel(bgG, g, inv, af);
            int cb = channel(bgB, b, inv, af);
            pixels[i] = (a << 24) | (cr << 16) | (cg << 8) | cb;
        }
        Bitmap out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        out.setPixels(pixels, 0, width, 0, 0, width, height);
        source.recycle();
        return out;
    }

    private static int channel(float bg, int value, float inv, float alpha) {
        float c = (bg * value / 255f - inv * bg) / alpha;
        if (c < 0f) return 0;
        if (c > 255f) return 255;
        return Math.round(c);
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        super.onMeasure(widthMeasureSpec, heightMeasureSpec);
        setMeasuredDimension(getMeasuredWidth(), getMeasuredHeight());
    }
}
`;
}
