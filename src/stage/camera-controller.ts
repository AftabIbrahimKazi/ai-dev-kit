import { AnimationClip, KeyframeTrack, easeInOutSine } from "@triforge/keyframe";
import { Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import type { CameraFocus, CameraKeyframe } from "@/types/kit-stage";
import {
  CAMERA_FINAL_ORBIT,
  CAMERA_IDLE_RATE,
  CAMERA_IDLE_SWAY,
  CAMERA_NARROW_ASPECT,
  CAMERA_NARROW_LIFT,
  CAMERA_NARROW_ZOOM,
  CAMERA_POINTER_PHI,
  CAMERA_POINTER_THETA,
  CAMERA_SIDE_SHIFT,
  INTRO_FOV_BOOST,
  INTRO_PHI_DROP,
  INTRO_RADIUS_BOOST,
  INTRO_THETA_SWEEP,
} from "./stage-config";

export interface CameraUpdate {
  chapter: number;
  pointerX: number;
  pointerY: number;
  seconds: number;
  introEase: number;
  isMotionReduced: boolean;
  focus: CameraFocus | null;
  orbitFrom?: number;
}

const POSE_KEYS: readonly string[] = ["tx", "ty", "tz", "radius", "fit", "theta", "phi", "side", "fov"];
const FIT_NDC_BLANK_HALF = 0.42 as const;
const FIT_NDC_FULL_WIDTH = 0.8 as const;
const FIT_NDC_HEIGHT = 0.78 as const;
const HOLD_SPAN = 0.2 as const;
const DEG_TO_RAD = Math.PI / 180;
const FOV_EPSILON = 0.01 as const;
const LAST_ORBIT_FROM = 6.5 as const;

export class CameraController {
  private readonly _camera: PerspectiveCamera;
  private readonly _pose: Record<string, number> = { tx: 0, ty: 0, tz: 0, radius: 100, fit: 0, theta: 0, phi: 1.3, side: 0, fov: 52 };
  private readonly _hold: Vector3 = new Vector3();
  private _clip: AnimationClip | null = null;
  private _lastFov: number = 0;

  constructor(camera: PerspectiveCamera) {
    this._camera = camera;
  }

  public init(keyframes: CameraKeyframe[]): void {
    const tracks = POSE_KEYS.map((key) => new KeyframeTrack(this._pose, key, this._framesFor(key, keyframes)));
    this._clip = new AnimationClip("landing-camera", tracks);
  }

  public update(input: CameraUpdate): void {
    if (!this._clip) return;
    this._clip.evaluate(input.chapter);
    const pose = this._pose;
    let radius = Math.max(pose.radius, this._fitDistance(pose.fit, pose.fov, Math.abs(pose.side)));
    let theta = pose.theta;
    let phi = pose.phi;
    this._hold.set(pose.tx, pose.ty, pose.tz);
    if (input.focus && input.focus.blend > 0) {
      this._hold.lerp(input.focus.target, input.focus.blend);
      radius += (input.focus.radius - radius) * input.focus.blend;
    }
    const intro = 1 - input.introEase;
    radius *= 1 + intro * INTRO_RADIUS_BOOST;
    if (!input.isMotionReduced) {
      theta += Math.sin(input.seconds * CAMERA_IDLE_RATE) * CAMERA_IDLE_SWAY + input.pointerX * CAMERA_POINTER_THETA;
      if (input.chapter > (input.orbitFrom ?? LAST_ORBIT_FROM)) theta += input.seconds * CAMERA_FINAL_ORBIT;
      phi += input.pointerY * CAMERA_POINTER_PHI;
    }
    phi -= intro * INTRO_PHI_DROP;
    theta += intro * INTRO_THETA_SWEEP;
    const fov = pose.fov + intro * INTRO_FOV_BOOST;
    const isNarrow = this._camera.aspect < CAMERA_NARROW_ASPECT;
    if (isNarrow) {
      this._hold.y -= radius * CAMERA_NARROW_LIFT;
      radius *= CAMERA_NARROW_ZOOM;
    } else {
      const halfWidth = Math.tan((fov * DEG_TO_RAD) / 2) * this._camera.aspect;
      const shift = pose.side * radius * halfWidth * CAMERA_SIDE_SHIFT;
      this._hold.x += Math.cos(theta) * shift;
      this._hold.z -= Math.sin(theta) * shift;
    }
    const spread = Math.sin(phi);
    this._camera.position.set(this._hold.x + radius * spread * Math.sin(theta), this._hold.y + radius * Math.cos(phi), this._hold.z + radius * spread * Math.cos(theta));
    this._camera.lookAt(this._hold);
    if (Math.abs(fov - this._lastFov) > FOV_EPSILON) {
      this._camera.fov = fov;
      this._camera.updateProjectionMatrix();
      this._lastFov = fov;
    }
  }

  private _fitDistance(fit: number, fov: number, sideWeight: number): number {
    if (fit <= 0) return 0;
    const halfTan = Math.tan((fov * DEG_TO_RAD) / 2);
    const widthShare = FIT_NDC_FULL_WIDTH + (FIT_NDC_BLANK_HALF - FIT_NDC_FULL_WIDTH) * sideWeight;
    const across = this._camera.aspect < CAMERA_NARROW_ASPECT ? FIT_NDC_FULL_WIDTH : widthShare;
    return fit / (halfTan * Math.min(FIT_NDC_HEIGHT, across * this._camera.aspect));
  }

  private _framesFor(key: string, keyframes: CameraKeyframe[]): Array<{ time: number; value: number; easing?: (t: number) => number }> {
    const frames: Array<{ time: number; value: number; easing?: (t: number) => number }> = [];
    keyframes.forEach((frame, index) => {
      const value = this._valueOf(key, frame);
      frames.push({ time: index, value });
      if (index < keyframes.length - 1) frames.push({ time: index + HOLD_SPAN, value, easing: easeInOutSine });
    });
    return frames;
  }

  private _valueOf(key: string, frame: CameraKeyframe): number {
    const lookup: Record<string, number> = {
      tx: frame.target[0],
      ty: frame.target[1],
      tz: frame.target[2],
      radius: frame.radius,
      fit: frame.fit,
      theta: frame.theta,
      phi: frame.phi,
      side: frame.side,
      fov: frame.fov,
    };
    return lookup[key];
  }
}
