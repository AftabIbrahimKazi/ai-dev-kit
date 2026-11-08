import { getDampFactor } from "./math-utils";
import { CHAPTER_COUNT, PANE_ACTIVE_FROM, PANE_ACTIVE_UNTIL, SCROLL_DAMP_RATE } from "./stage-config";

const STATE_ACTIVE = "active" as const;
const STATE_PAST = "past" as const;
const STATE_UPCOMING = "upcoming" as const;
const NO_ACTIVE = -1 as const;
const LAST_PROGRESS = 0.999 as const;
const RAIL_ACTIVE = "active" as const;
const RAIL_IDLE = "idle" as const;
const SETTLE_EPSILON = 0.0005 as const;

export class ScrollObserver {
  private readonly _chapters: HTMLElement[];
  private readonly _rail: HTMLElement[];
  private readonly _tops: number[] = [];
  private readonly _heights: number[] = [];
  private _viewport: number = 0;
  private _smooth: number = 0;
  private _raw: number = 0;
  private _activeIndex: number = NO_ACTIVE;
  private _resizeObserver: ResizeObserver | null = null;

  constructor(chapters: HTMLElement[], rail: HTMLElement[]) {
    this._chapters = chapters;
    this._rail = rail;
  }

  public init(): void {
    this.measure();
    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(document.body);
    this._raw = this._chapterAt(window.scrollY);
    this._smooth = this._raw;
    this._syncStates(this._raw);
  }

  public measure(): void {
    this._viewport = window.innerHeight;
    this._chapters.forEach((chapter, i) => {
      this._tops[i] = chapter.getBoundingClientRect().top + window.scrollY;
      this._heights[i] = chapter.offsetHeight;
    });
  }

  public update(deltaSeconds: number, isInstant: boolean): boolean {
    this._raw = this._chapterAt(window.scrollY);
    this._syncStates(this._raw);
    const gap = this._raw - this._smooth;
    if (isInstant) this._smooth = this._raw;
    else this._smooth += gap * getDampFactor(SCROLL_DAMP_RATE, deltaSeconds);
    return Math.abs(gap) > SETTLE_EPSILON;
  }

  public getSmooth(): number {
    return this._smooth;
  }

  public getRaw(): number {
    return this._raw;
  }

  public destroy(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
  }

  private readonly _onResize = (): void => {
    this.measure();
  };

  private _chapterAt(scrollY: number): number {
    let index = 0;
    for (let i = 0; i < this._tops.length; i += 1) {
      if (this._tops[i] <= scrollY + 2) index = i;
    }
    const range = Math.max(1, this._heights[index] - this._viewport);
    const progress = Math.min(LAST_PROGRESS, Math.max(0, (scrollY - this._tops[index]) / range));
    return index + progress;
  }

  private _syncStates(chapter: number): void {
    const whole = Math.min(CHAPTER_COUNT - 1, Math.floor(chapter));
    const fraction = chapter - whole;
    let active: number = NO_ACTIVE;
    if (fraction < PANE_ACTIVE_UNTIL) active = whole;
    else if (fraction >= PANE_ACTIVE_FROM) active = Math.min(CHAPTER_COUNT - 1, whole + 1);
    if (whole === CHAPTER_COUNT - 1) active = whole;
    if (active !== this._activeIndex) {
      this._activeIndex = active;
      const pivot = active === NO_ACTIVE ? whole + 0.5 : active;
      this._chapters.forEach((element, i) => {
        const pane = element.querySelector<HTMLElement>(".rk-pane-ts");
        if (!pane) return;
        if (i === active) pane.dataset.state = STATE_ACTIVE;
        else pane.dataset.state = i < pivot ? STATE_PAST : STATE_UPCOMING;
      });
      this._rail.forEach((item, i) => {
        item.dataset.state = i === active ? RAIL_ACTIVE : RAIL_IDLE;
      });
    }
  }
}
