import { Composition, getInputProps, registerRoot } from 'remotion';
import { Film } from './Film';

// Thesium passes the film's facts and tuned parameters as input props (THESIUM). For motion blur it
// can ask for more frames per second than the film has (thesium.renderFps): Film derives time from
// useVideoConfig().fps, so the extra frames are exact sub-frame times.
type Thesium = { renderFps?: number; [key: string]: unknown };
const thesium = (getInputProps() as { THESIUM?: Thesium }).THESIUM ?? {};
const fps = thesium.renderFps ?? 30;

const Root = () => (
  <Composition
    id="Film"
    component={Film}
    width={1920}
    height={1080}
    fps={fps}
    durationInFrames={Math.round(30 * fps)}
    defaultProps={{ thesium }}
  />
);

registerRoot(Root);
