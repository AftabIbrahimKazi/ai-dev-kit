export const CHAPTER_COUNT = 8 as const;
export const CHAPTER_HERO = 0 as const;
export const CHAPTER_PROMPT = 1 as const;
export const CHAPTER_SKILLS = 2 as const;
export const CHAPTER_STANDARDS = 3 as const;
export const CHAPTER_MODS = 4 as const;
export const CHAPTER_COMMANDS = 5 as const;
export const CHAPTER_MAP = 6 as const;
export const CHAPTER_MODULES = 7 as const;

export const FAN_CHAPTERS: readonly number[] = [CHAPTER_SKILLS, CHAPTER_STANDARDS, CHAPTER_MODS, CHAPTER_COMMANDS];

export const CHAPTER_GROUPS: Readonly<Record<number, readonly string[]>> = {
  [CHAPTER_SKILLS]: ["skills-workflow", "skills-standards", "skills-meta", "skills-memory", "skills-models"],
  [CHAPTER_STANDARDS]: ["standards", "partials", "frameworks", "script-partials", "qa"],
  [CHAPTER_MODS]: ["mods"],
  [CHAPTER_COMMANDS]: ["skills-commands"],
};

export const ACTOR_AUTOMATIC = 2 as const;
export const ACTOR_YOU = 0 as const;
export const ACTOR_CLAUDE = 1 as const;

export const YOU_POSITION: readonly [number, number, number] = [0, -6, 150];
export const CLAUDE_POSITION: readonly [number, number, number] = [0, 0, 0];

export const MAX_NODES = 384 as const;
export const NODE_BASE_RADIUS = 0.9 as const;
export const NODE_DEGREE_RADIUS = 0.28 as const;
export const NODE_SCALE_MIN = 0.3 as const;
export const NODE_SCALE_GAIN = 1 as const;
export const NODE_GRADIENT_HUE = 0.035 as const;
export const NODE_GRADIENT_LIGHT = 0.2 as const;
export const NODE_GRADIENT_LIFT = 0.02 as const;
export const NODE_LIGHTNESS_MAX = 0.74 as const;
export const NODE_GRADIENT_SATURATION = 0.14 as const;
export const NODE_GRADIENT_AXIS: readonly [number, number] = [0.55, 0.83];
export const NODE_ALPHA_MIN = 0.1 as const;
export const NODE_ALPHA_GAIN = 0.9 as const;
export const NODE_LIGHT_DIRECTION: readonly [number, number, number] = [-0.5, 0.7, 0.55];
export const NODE_SHADE_FLOOR = 0.2 as const;
export const NODE_SHADE_CEIL = 1.18 as const;
export const NODE_SHADE_FLOOR_DARK = 0.04 as const;
export const NODE_SHADE_CEIL_DARK = 0.95 as const;
export const NODE_SHADE_CURVE = 1.4 as const;
export const NODE_SPEC_POWER = 34 as const;
export const NODE_SPEC_GAIN = 0.75 as const;
export const NODE_RIM_POWER = 2.4 as const;
export const NODE_RIM_GLOW = 0.45 as const;
export const NODE_RIM_DARKEN = 0.55 as const;
export const HALO_SIZE_MIN = 1.2 as const;
export const HALO_SIZE_GAIN = 4.8 as const;
export const HALO_ALPHA_MIN = 0.01 as const;
export const HALO_ALPHA_GAIN = 0.73 as const;
export const HALO_POINT_LIMIT = 220 as const;
export const HALO_STRENGTH_DARK = 1 as const;
export const HALO_STRENGTH_LIGHT = 0.5 as const;
export const EDGE_GAIN_DARK = 0.75 as const;
export const EDGE_GAIN_LIGHT = 0.85 as const;
export const EDGE_FLOOR = 0.012 as const;
export const EDGE_CURVE = 1.6 as const;
export const EDGE_REACH_FOCUS = 0.6 as const;
export const SPHERE_WIDTH_SEGMENTS = 14 as const;
export const SPHERE_HEIGHT_SEGMENTS = 10 as const;
export const LIT_DAMP_RATE = 7 as const;
export const LIT_SETTLE_EPSILON = 0.0008 as const;

export const LIT_HERO = 0.3 as const;
export const LIT_PROMPT = 0.14 as const;
export const LIT_MAP = 0.95 as const;
export const LIT_MODULES = 0.62 as const;
export const LIT_OUTSIDE_SET = 0.07 as const;
export const LIT_OUTSIDE_FOCUS = 0.1 as const;

export const FAN_MAX_TARGETS = 44 as const;
export const FAN_LINE_OPACITY = 0.45 as const;
export const FAN_PULSE_SPEED = 0.32 as const;
export const FAN_PULSE_STAGGER = 0.137 as const;
export const FAN_PULSE_SIZE = 4 as const;
export const FAN_ACTIVE_MIN = 0.02 as const;

export const PACKET_START = 0.12 as const;
export const PACKET_END = 0.62 as const;
export const PACKET_FADE_IN_AT = 0.6 as const;
export const PACKET_FADE_IN_RATE = 3 as const;
export const PACKET_FADE_OUT_FROM = 1.62 as const;
export const PACKET_FADE_OUT_TO = 1.9 as const;
export const PACKET_VISIBLE_UNTIL = 2.1 as const;
export const PACKET_SIZE = 16 as const;
export const PACKET_WOBBLE = 2 as const;
export const PACKET_WOBBLE_SPEED = 9 as const;
export const TRAIL_OPACITY = 0.9 as const;

export const RIPPLE_COUNT = 6 as const;
export const RIPPLE_SPEED = 0.45 as const;
export const RIPPLE_BASE_SIZE = 8 as const;
export const RIPPLE_GROWTH = 42 as const;
export const RIPPLE_OPACITY = 0.4 as const;
export const RIPPLE_GROUP_SIZE = 3 as const;

export const CORE_SIZE = 3.2 as const;
export const CORE_HALO_SIZE = 34 as const;
export const CORE_PULSE_SPEED = 2.2 as const;
export const CORE_PULSE_DEPTH = 0.08 as const;
export const CORE_LIT_FLOOR = 0.25 as const;

export const TAG_HEIGHT = 0.05 as const;
export const TAG_FONT_PX = 44 as const;
export const TAG_PAD_X = 30 as const;
export const TAG_PAD_Y = 16 as const;
export const TAG_GAP = 0.16 as const;
export const TAG_POINTER_PX = 14 as const;
export const TAG_BORDER_PX = 3 as const;
export const TAG_ICON_PX = 40 as const;
export const TAG_ICON_GAP_PX = 14 as const;
export const CORE_LABEL_RADIUS = 2.6 as const;
export const TAG_FADE_GAIN = 1.3 as const;
export const TAG_FONT_WEIGHT = 800 as const;

export const NEURAL_SEED = 20240611 as const;
export const NEURAL_POINT_COUNT = 1500 as const;
export const NEURAL_REGION_COUNT = 22 as const;
export const NEURAL_AXES: readonly [number, number, number] = [560, 340, 460];
export const NEURAL_SHELL_THICKNESS = 0.22 as const;
export const NEURAL_REGION_SPREAD = 95 as const;
export const NEURAL_FISSURE = 36 as const;
export const NEURAL_LINKS_PER_POINT = 3 as const;
export const NEURAL_LINK_MAX = 110 as const;
export const NEURAL_POINT_SIZE_MIN = 1.6 as const;
export const NEURAL_POINT_SIZE_GAIN = 2.2 as const;
export const NEURAL_POINT_LIMIT = 14 as const;
export const NEURAL_POINT_ALPHA_DARK = 0.4 as const;
export const NEURAL_POINT_ALPHA_LIGHT = 0.28 as const;
export const NEURAL_EDGE_ALPHA_DARK = 0.12 as const;
export const NEURAL_EDGE_ALPHA_LIGHT = 0.1 as const;
export const NEURAL_FIRING_SHARE = 0.4 as const;
export const NEURAL_PULSE_SPEED = 0.16 as const;
export const NEURAL_PULSE_WIDTH = 0.14 as const;
export const NEURAL_PULSE_GAIN = 4 as const;
export const NEURAL_TWINKLE_SPEED = 0.9 as const;
export const NEURAL_TWINKLE_BASE = 0.7 as const;
export const NEURAL_TWINKLE_GAIN = 0.3 as const;
export const NEURAL_DRIFT_SPEED = 0.006 as const;
export const NEURAL_REVEAL_FLOOR = 0.3 as const;

export const CAMERA_NEAR = 0.5 as const;
export const CAMERA_FAR = 1200 as const;
export const CAMERA_FOV = 52 as const;
export const CAMERA_SIDE_SHIFT = 0.42 as const;
export const CAMERA_NARROW_ASPECT = 0.95 as const;
export const CAMERA_NARROW_LIFT = 0.2 as const;
export const CAMERA_NARROW_ZOOM = 1.35 as const;
export const CAMERA_IDLE_SWAY = 0.05 as const;
export const CAMERA_IDLE_RATE = 0.18 as const;
export const CAMERA_POINTER_THETA = 0.05 as const;
export const CAMERA_POINTER_PHI = 0.03 as const;
export const CAMERA_FINAL_ORBIT = 0.03 as const;
export const CAMERA_FOCUS_MAX_RADIUS = 340 as const;
export const CAMERA_FOCUS_MIN_RADIUS = 70 as const;
export const CAMERA_FOCUS_RADIUS_GAIN = 2.4 as const;
export const CAMERA_FOCUS_RADIUS_PAD = 40 as const;
export const CAMERA_FOCUS_DAMP_RATE = 4 as const;
export const CAMERA_POINTER_DAMP_RATE = 3 as const;
export const CAMERA_FAN_THETA = 0.9 as const;
export const CAMERA_FAN_PHI = 1.25 as const;
export const CAMERA_FAN_FOV = 54 as const;
export const CAMERA_FAN_MIN_RADIUS = 80 as const;
export const CAMERA_FAN_MAX_RADIUS = 200 as const;
export const CAMERA_FAN_RADIUS_GAIN = 2.3 as const;
export const CAMERA_FAN_RADIUS_PAD = 40 as const;

export const INTRO_MS = 2800 as const;
export const INTRO_RADIUS_BOOST = 5 as const;
export const INTRO_THETA_SWEEP = 0.8 as const;
export const INTRO_LIT_FLOOR = 0.03 as const;
export const INTRO_WAVE_WIDTH = 0.35 as const;
export const INTRO_CORE_WAKE = 0.6 as const;
export const INTRO_DRAW_SHARE = 0.6 as const;
export const INTRO_PULSE_SHARE = 0.85 as const;
export const INTRO_PHASE_WAIT = "wait" as const;
export const INTRO_PHASE_DRAW = "draw" as const;
export const INTRO_PHASE_PULSE = "pulse" as const;
export const INTRO_PHASE_ARRIVE = "arrive" as const;
export const INTRO_PHASE_EVENT = "rk:intro-phase" as const;
export const STAGE_READY_ATTRIBUTE = "data-stage" as const;
export const STAGE_READY = "ready" as const;
export const STAGE_READY_EVENT = "rk:stage-ready" as const;
export const INTRO_FOV_BOOST = 10 as const;
export const INTRO_PHI_DROP = 0.25 as const;
export const INTRO_ATTRIBUTE = "data-intro" as const;
export const INTRO_PLAY = "play" as const;
export const INTRO_LIFT = "lift" as const;
export const INTRO_DONE = "done" as const;
export const INTRO_WAIT_MAX_MS = 12000 as const;

export const SCROLL_DAMP_RATE = 4.5 as const;
export const PANE_ACTIVE_UNTIL = 0.62 as const;
export const PANE_ACTIVE_FROM = 0.88 as const;

export const TYPE_START = 0.1 as const;
export const TYPE_END = 0.5 as const;

export const MAX_PIXEL_RATIO = 2 as const;
export const LOW_PIXEL_RATIO = 1 as const;
export const SAMPLE_FRAMES = 90 as const;
export const SLOW_FRAME_MS = 24 as const;
export const MAX_DELTA_SECONDS = 0.05 as const;

export const THEME_ATTRIBUTE = "data-st-theme" as const;
export const THEME_DARK = "dark" as const;
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)" as const;
export const MODULE_SELECTOR = ".rk-module-ts" as const;
export const MODULE_ID_PREFIX = "rk-module-" as const;
export const MODULE_ID_SUFFIX = "-ts" as const;
export const FONT_TOKEN = "--font-family-display" as const;
export const ACTOR_TOKENS: readonly string[] = ["--color-lamp", "--color-accent", "--color-denied", "--color-point-maint"];
export const FAN_TOKENS: readonly string[] = ["--color-point-skills", "--color-point-standards", "--color-point-mods", "--color-point-commands"];
export const LIGHT_BACKGROUND_TOKEN = "--color-wall-mid" as const;
export const AXIS_COUNT = 3 as const;