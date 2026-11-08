declare module "@strata-packages/offcanvas";

declare module "@strata-packages/cursorfx" {
  export interface CursorFXInstance {
    unmount(): void;
    setColor(css: string): void;
  }

  export interface CursorFXEngine {
    init(options?: Record<string, unknown>): void;
    mount(preset: unknown, options?: Record<string, unknown>): CursorFXInstance;
  }

  const CursorFX: CursorFXEngine;
  export default CursorFX;
}

declare module "@strata-packages/cursorfx/*";
