// Types for scene.js, the launch film's picture code shared with the web and HyperFrames versions.
export function createScene(
  root: HTMLElement,
  info: { width: number; height: number; fps: number; params: Record<string, unknown> },
  assetUrl: (path: string) => string,
): Promise<(t: number) => void>;
