/**
 * Studyria splash geometry — the owner-supplied Studyria_Splash.html measured in
 * its own design pixels (a 228x488 stage with `zoom: --k`).
 *
 * Single source of truth for the numbers that the generated Java, the unit
 * tests and the device QA profile all have to agree on. Nothing here is a
 * guess: every value is a declared CSS length in the reference.
 */
export const STAGE_W = 228;
export const STAGE_H = 488;
export const PAD_BOTTOM = 44;
export const GAP = 12;

/** `.mk` inline width, and the JPEG it clips (420x313). */
export const MARK_W = 165;
export const MARK_AR_NUM = 313;
export const MARK_AR_DEN = 420;

/** `.tx` inline width, and the JPEG it clips (620x182). */
export const WORD_W = 200;
export const WORD_AR_NUM = 182;
export const WORD_AR_DEN = 620;

/** `.pb`: left/right 60, bottom 54, height 5, radius 5 (a pill). */
export const BAR_INSET = 60;
export const BAR_BOTTOM = 54;
export const BAR_H = 5;

/** `.sp` ruled canvas: 1k lines every 32k, starting at 31k. */
export const LINE_OFFSET = 31;
export const LINE_PERIOD = 32;

/** `.ml` margin rule: 34k in from the viewport edge, 1 CSS px wide. */
export const RULE_LEFT = 34;

export type DesignGeometry = {
  markW: number;
  markH: number;
  wordW: number;
  wordH: number;
  columnH: number;
  markTop: number;
  markBottom: number;
  wordTop: number;
  wordBottom: number;
  barTop: number;
  barBottom: number;
  barLeft: number;
  barRight: number;
};

/**
 * The column inside `.ctr` (inset 0, gap 12, padding-bottom 44, centred), and
 * `.pb` measured from the top-left of the stage. All values in design px.
 */
export function designGeometry(): DesignGeometry {
  const markH = MARK_W * (MARK_AR_NUM / MARK_AR_DEN);
  const wordH = WORD_W * (WORD_AR_NUM / WORD_AR_DEN);
  const columnH = markH + GAP + wordH;
  const markTop = ((STAGE_H - PAD_BOTTOM) - columnH) / 2;
  const markBottom = markTop + markH;
  const wordTop = markBottom + GAP;
  const wordBottom = wordTop + wordH;
  return {
    markW: MARK_W,
    markH,
    wordW: WORD_W,
    wordH,
    columnH,
    markTop,
    markBottom,
    wordTop,
    wordBottom,
    barTop: STAGE_H - BAR_BOTTOM - BAR_H,
    barBottom: STAGE_H - BAR_BOTTOM,
    barLeft: BAR_INSET,
    barRight: STAGE_W - BAR_INSET,
  };
}
