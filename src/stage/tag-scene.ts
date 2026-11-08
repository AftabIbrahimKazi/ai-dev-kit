import { CanvasTexture, Color, Group, Sprite, SpriteMaterial, Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import type { IconName } from "./icon-registry";
import { iconKey, type IconTone } from "./tag-icons";
import {
  TAG_BORDER_PX,
  TAG_FADE_GAIN,
  TAG_FONT_PX,
  TAG_FONT_WEIGHT,
  TAG_GAP,
  TAG_HEIGHT,
  TAG_ICON_GAP_PX,
  TAG_ICON_PX,
  TAG_PAD_X,
  TAG_PAD_Y,
  TAG_POINTER_PX,
} from "./stage-config";

export type TagPlacement = "above" | "below";
export type TagStyle = "fill" | "spotlight";

export interface TagSpec {
  key: string;
  text: string;
  position: Vector3;
  colorIndex: number;
  icon?: IconName;
  style?: TagStyle;
  placement?: TagPlacement;
  radius?: number;
}

const SPOTLIGHT_PLATE = "#ffffff" as const;
const SPOTLIGHT_GLOW = "rgba(255, 255, 255, 0.9)" as const;
const FILL_SHADOW = "rgba(4, 32, 42, 0.45)" as const;
const DARK_TEXT = "#04202a" as const;
const LIGHT_TEXT = "#eafffb" as const;
const LUMA_RED = 0.2126 as const;
const LUMA_GREEN = 0.7152 as const;
const LUMA_BLUE = 0.0722 as const;
const CONTRAST_OFFSET = 0.05 as const;
const DARK_TEXT_LUMA = 0.012 as const;
const LIGHT_TEXT_LUMA = 0.96 as const;
const PILL_RADIUS_FACTOR = 0.5 as const;
const OPACITY_EPSILON = 0.004 as const;
const LETTER_SPACING = "1.5px" as const;
const POINTER_HALF_WIDTH_FACTOR = 0.8 as const;
const SPOTLIGHT_BORDER_FACTOR = 1.6 as const;
const ABOVE_ANCHOR = 0 as const;
const BELOW_ANCHOR = 1 as const;

export class TagScene {
  public readonly group: Group = new Group();

  private readonly _specs: TagSpec[];
  private readonly _sprites: Map<string, Sprite> = new Map();
  private readonly _radii: Map<string, number> = new Map();
  private readonly _placements: Map<string, TagPlacement> = new Map();
  private readonly _opacity: Map<string, number> = new Map();
  private readonly _forward: Vector3 = new Vector3();
  private readonly _offset: Vector3 = new Vector3();
  private _fontFamily: string = "sans-serif";
  private _icons: Map<string, HTMLImageElement> = new Map();

  constructor(specs: TagSpec[]) {
    this._specs = specs;
  }

  public build(fontFamily: string, colors: Color[], icons: Map<string, HTMLImageElement>): void {
    this._fontFamily = fontFamily;
    this._icons = icons;
    this._disposeSprites();
    this._specs.forEach((spec) => {
      const placement = spec.placement ?? "above";
      const texture = this._paint(spec, colors[spec.colorIndex], placement);
      const aspect = texture.image.width / texture.image.height;
      const material = new SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false, sizeAttenuation: false });
      const sprite = new Sprite(material);
      sprite.center.set(0.5, placement === "below" ? BELOW_ANCHOR : ABOVE_ANCHOR);
      sprite.scale.set(TAG_HEIGHT * aspect, TAG_HEIGHT, 1);
      sprite.position.copy(spec.position);
      sprite.renderOrder = spec.style === "spotlight" ? 7 : 6;
      this.group.add(sprite);
      this._sprites.set(spec.key, sprite);
      this._radii.set(spec.key, spec.radius ?? 0);
      this._placements.set(spec.key, placement);
      this._opacity.set(spec.key, 0);
    });
  }

  public setOpacity(key: string, value: number): void {
    const sprite = this._sprites.get(key);
    if (!sprite) return;
    const next = Math.min(1, Math.max(0, value * TAG_FADE_GAIN));
    if (Math.abs((this._opacity.get(key) ?? 0) - next) < OPACITY_EPSILON && next !== 0 && next !== 1) return;
    this._opacity.set(key, next);
    sprite.material.opacity = next;
    sprite.visible = next > 0;
  }

  public place(camera: PerspectiveCamera): void {
    camera.getWorldDirection(this._forward);
    this._sprites.forEach((sprite, key) => {
      if (!sprite.visible) return;
      const depth = Math.max(this._offset.copy(sprite.position).sub(camera.position).dot(this._forward), 1);
      const clear = (this._radii.get(key) ?? 0) / (depth * TAG_HEIGHT) + TAG_GAP;
      sprite.center.y = this._placements.get(key) === "below" ? BELOW_ANCHOR + clear : ABOVE_ANCHOR - clear;
    });
  }

  public destroy(): void {
    this._disposeSprites();
    this.group.clear();
  }

  private _paint(spec: TagSpec, color: Color, placement: TagPlacement): CanvasTexture {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const font = `${TAG_FONT_WEIGHT} ${TAG_FONT_PX}px ${this._fontFamily}`;
    if (!context) return new CanvasTexture(canvas);
    const isSpotlight = spec.style === "spotlight";
    const tone: IconTone = isSpotlight || this._prefersDarkText(color) ? "dark" : "light";
    const textColor = tone === "dark" ? DARK_TEXT : LIGHT_TEXT;
    const accent = `#${color.getHexString()}`;
    const plateColor = isSpotlight ? SPOTLIGHT_PLATE : accent;
    const borderColor = isSpotlight ? accent : tone === "dark" ? "rgba(4, 32, 42, 0.35)" : "rgba(234, 255, 251, 0.45)";
    const borderPx = isSpotlight ? TAG_BORDER_PX * SPOTLIGHT_BORDER_FACTOR : TAG_BORDER_PX;
    const icon = spec.icon ? this._icons.get(iconKey(spec.icon, tone)) : undefined;
    context.font = font;
    context.letterSpacing = LETTER_SPACING;
    const label = spec.text.toUpperCase();
    const textWidth = Math.ceil(context.measureText(label).width);
    const iconSpace = icon ? TAG_ICON_PX + TAG_ICON_GAP_PX : 0;
    const plateHeight = TAG_FONT_PX + TAG_PAD_Y * 2;
    const width = textWidth + iconSpace + TAG_PAD_X * 2;
    const height = plateHeight + TAG_POINTER_PX;
    canvas.width = width;
    canvas.height = height;
    const plateTop = placement === "below" ? TAG_POINTER_PX : 0;
    const half = borderPx / 2;
    context.font = font;
    context.letterSpacing = LETTER_SPACING;
    context.shadowColor = isSpotlight ? SPOTLIGHT_GLOW : FILL_SHADOW;
    context.shadowBlur = TAG_POINTER_PX;
    context.fillStyle = plateColor;
    context.strokeStyle = borderColor;
    context.lineWidth = borderPx;
    context.beginPath();
    context.roundRect(half, plateTop + half, width - borderPx, plateHeight - borderPx, plateHeight * PILL_RADIUS_FACTOR);
    context.fill();
    context.shadowBlur = 0;
    context.stroke();
    const pointerBase = placement === "below" ? plateTop + half : plateTop + plateHeight - half;
    const pointerTip = placement === "below" ? 0 : height;
    const pointerHalf = TAG_POINTER_PX * POINTER_HALF_WIDTH_FACTOR;
    context.fillStyle = isSpotlight ? accent : plateColor;
    context.beginPath();
    context.moveTo(width / 2 - pointerHalf, pointerBase);
    context.lineTo(width / 2 + pointerHalf, pointerBase);
    context.lineTo(width / 2, pointerTip);
    context.closePath();
    context.fill();
    const middle = plateTop + plateHeight / 2;
    if (icon) context.drawImage(icon, TAG_PAD_X, middle - TAG_ICON_PX / 2, TAG_ICON_PX, TAG_ICON_PX);
    context.fillStyle = textColor;
    context.textBaseline = "middle";
    context.textAlign = "left";
    context.fillText(label, TAG_PAD_X + iconSpace, middle);
    return new CanvasTexture(canvas);
  }

  private _prefersDarkText(plate: Color): boolean {
    const luma = LUMA_RED * plate.r + LUMA_GREEN * plate.g + LUMA_BLUE * plate.b; // Color channels are linear in the working space, as relative luminance requires
    const againstDark = (luma + CONTRAST_OFFSET) / (DARK_TEXT_LUMA + CONTRAST_OFFSET);
    const againstLight = (LIGHT_TEXT_LUMA + CONTRAST_OFFSET) / (luma + CONTRAST_OFFSET);
    return againstDark >= againstLight;
  }

  private _disposeSprites(): void {
    this._sprites.forEach((sprite) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      this.group.remove(sprite);
    });
    this._sprites.clear();
    this._radii.clear();
    this._placements.clear();
  }
}
