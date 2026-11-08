import { DISABLED_SELECTOR, FOCUS_VISIBLE_SELECTOR, INTERACTIVE_SELECTOR, SOUND_CLICK_ATTRIBUTE, SOUND_OWN_ATTRIBUTE, TOUCH_POINTER, type ToneName } from "./sound-config";
import { soundEngine } from "./sound-engine";

const GESTURE_EVENTS: readonly string[] = ["pointerdown", "keydown", "touchend"];

export class SoundController {
  private _hovered: Element | null = null;
  private _isBound: boolean = false;

  public init(): void {
    if (this._isBound) return;
    this._isBound = true;
    document.addEventListener("pointerover", this._onPointerOver, { passive: true });
    document.addEventListener("pointerdown", this._onPointerDown, { passive: true });
    document.addEventListener("click", this._onClick, { passive: true });
    document.addEventListener("focusin", this._onFocusIn);
    document.documentElement.addEventListener("pointerleave", this._onPointerLeave, { passive: true });
    GESTURE_EVENTS.forEach((name) => document.addEventListener(name, this._onGesture, { capture: true, passive: true }));
  }

  public destroy(): void {
    this._isBound = false;
    document.removeEventListener("pointerover", this._onPointerOver);
    document.removeEventListener("pointerdown", this._onPointerDown);
    document.removeEventListener("click", this._onClick);
    document.removeEventListener("focusin", this._onFocusIn);
    document.documentElement.removeEventListener("pointerleave", this._onPointerLeave);
    GESTURE_EVENTS.forEach((name) => document.removeEventListener(name, this._onGesture, { capture: true }));
  }

  private _interactiveOf(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest(INTERACTIVE_SELECTOR);
    return element && !element.closest(DISABLED_SELECTOR) ? element : null;
  }

  private _isFocusVisible(target: Element): boolean {
    try {
      return target.matches(FOCUS_VISIBLE_SELECTOR);
    } catch {
      return false;
    }
  }

  private readonly _onGesture = (): void => {
    soundEngine.unlock();
  };

  private readonly _onPointerOver = (event: PointerEvent): void => {
    if (event.pointerType === TOUCH_POINTER) return;
    const element = this._interactiveOf(event.target);
    if (element === this._hovered) return;
    this._hovered = element;
    if (element) soundEngine.play("hover");
  };

  private readonly _onPointerLeave = (): void => {
    this._hovered = null;
  };

  private readonly _onPointerDown = (event: PointerEvent): void => {
    const element = this._interactiveOf(event.target);
    if (element && !element.closest(`[${SOUND_OWN_ATTRIBUTE}]`)) soundEngine.play("press");
  };

  private readonly _onFocusIn = (event: FocusEvent): void => {
    const element = this._interactiveOf(event.target);
    if (element && this._isFocusVisible(element)) soundEngine.play("focus");
  };

  private readonly _onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const source = event.target.closest(`[${SOUND_CLICK_ATTRIBUTE}]`);
    const tone = source?.getAttribute(SOUND_CLICK_ATTRIBUTE);
    if (tone) {
      soundEngine.play(tone as ToneName); // the attribute is only ever written with a ToneName by theme-toggle
      return;
    }
    const element = this._interactiveOf(event.target);
    if (element && !element.closest(`[${SOUND_OWN_ATTRIBUTE}]`)) soundEngine.play("click");
  };
}
