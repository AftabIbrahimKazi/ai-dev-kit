import { Color } from "three";
import type { StagePalette } from "@/types/kit-stage";
import { ACTOR_TOKENS, FAN_TOKENS, FONT_TOKEN, LIGHT_BACKGROUND_TOKEN, THEME_ATTRIBUTE, THEME_DARK } from "./stage-config";

const FALLBACK_FONT = "sans-serif" as const;

export class PaletteLoader {
  private readonly _root: HTMLElement;

  constructor(root: HTMLElement) {
    this._root = root;
  }

  public load(): StagePalette {
    const isDark = this._root.getAttribute(THEME_ATTRIBUTE) === THEME_DARK;
    return {
      actors: ACTOR_TOKENS.map((token) => this._readColor(token)),
      fan: FAN_TOKENS.map((token) => this._readColor(token)),
      background: isDark ? new Color(0x000000) : this._readColor(LIGHT_BACKGROUND_TOKEN),
      isDark,
    };
  }

  public loadFont(): string {
    const value = getComputedStyle(this._root).getPropertyValue(FONT_TOKEN).trim();
    return value.length > 0 ? value : FALLBACK_FONT;
  }

  private _readColor(token: string): Color {
    return new Color(getComputedStyle(this._root).getPropertyValue(token).trim());
  }
}
