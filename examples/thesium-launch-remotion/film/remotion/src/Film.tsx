import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { createScene } from './scene.js';

// The launch film on Remotion: the shared scene module (scene.js), driven by Remotion's frame.
// Time is frame / fps, and fps is the composition's (Thesium raises it for motion-blur samples).

type Thesium = { width: number; height: number; fps: number; duration: number; params: Record<string, unknown> };

const fonts = `
  @font-face { font-family: 'Unbounded'; src: url('${staticFile('fonts/Unbounded.ttf')}'); font-weight: 200 900; }
  @font-face { font-family: 'Space Grotesk'; src: url('${staticFile('fonts/SpaceGrotesk.ttf')}'); font-weight: 300 700; }
  @font-face { font-family: 'JetBrains Mono'; src: url('${staticFile('fonts/JetBrainsMono.ttf')}'); font-weight: 100 800; }
`;

export const Film = ({ thesium }: { thesium: Thesium }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const root = useRef<HTMLDivElement>(null);
  const draw = useRef<((t: number) => void) | null>(null);
  const now = useRef(frame / fps);
  now.current = frame / fps;
  // Remotion waits for this before capturing: fonts, images and the shader are ready.
  const [handle] = useState(() => delayRender('Building the scene'));

  useEffect(() => {
    // The kit's frameTime() reads the film's own fps from THESIUM, as on the web engine.
    (globalThis as { THESIUM?: Thesium }).THESIUM = thesium;
    createScene(root.current as HTMLDivElement, thesium, (p: string) => staticFile(p.replace(/^\//, ''))).then((render) => {
      draw.current = render;
      render(now.current);
      continueRender(handle);
    });
  }, [handle, thesium]);

  useLayoutEffect(() => {
    draw.current?.(frame / fps);
  }, [frame, fps]);

  return (
    <AbsoluteFill style={{ background: '#05070c' }}>
      <style>{fonts}</style>
      <div ref={root} style={{ position: 'absolute', inset: 0 }} />
    </AbsoluteFill>
  );
};
