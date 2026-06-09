// The slot-machine reel timing, adapted from 162-0's spin(): ~14 frames at 70ms, tumbling through a
// pre-built sequence of frames before snapping to the pre-picked target. The frames are produced by
// pools.reelFrames so every one is a REAL (team, year) pairing (no impossible combos flash by), and
// on a full draw the year settles before the team. Kept framework-free: the caller supplies the
// frames + onFrame/onDone and owns React state.

export const FRAME_MS = 70;
export const FRAMES = 14;

export const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Play `frames` ([{ team, year }, …]) one per tick, then snap to `target` ({ name, year }).
// onFrame({ team, year }) fires each tick; onDone() once after the snap. Returns a cancel fn.
export function runReel({ frames, target, onFrame, onDone }) {
  let t = 0;
  const tick = () => {
    if (t >= frames.length) {
      clearInterval(iv);
      onFrame({ team: target.name, year: target.year });
      onDone && onDone();
      return;
    }
    onFrame(frames[t]);
    t += 1;
  };
  const iv = setInterval(tick, FRAME_MS);
  return () => clearInterval(iv);
}
