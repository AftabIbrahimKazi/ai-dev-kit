import { smoothstep } from "./math-utils";
import { CHAPTER_PROMPT, TYPE_END, TYPE_START } from "./stage-config";

export class PromptTypeController {
  private readonly _target: HTMLElement;
  private readonly _text: string;
  private _shown: number = -1;

  constructor(target: HTMLElement, text: string) {
    this._target = target;
    this._text = text;
  }

  public update(chapter: number): void {
    const progress = smoothstep(TYPE_START, TYPE_END, chapter - CHAPTER_PROMPT);
    const count = Math.floor(progress * this._text.length);
    if (count === this._shown) return;
    this._shown = count;
    this._target.textContent = this._text.slice(0, count);
  }

  public reset(): void {
    this._shown = -1;
    this._target.textContent = this._text;
  }
}
