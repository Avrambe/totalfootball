// The slot-machine reel timing, adapted from 162-0's spin(): ~14 frames tumbling through a pre-built
// sequence of frames before snapping to the pre-picked target. The frames are produced by
// pools.reelFrames so every one is a REAL (team, year) pairing (no impossible combos flash by), and
// on a full draw the year settles before the team. The frame interval RAMPS UP over the last few
// frames so the reel visibly decelerates onto the target — it reads like a real spinner instead of
// stopping abruptly. Kept framework-free: the caller supplies the frames + onFrame/onDone and owns
// React state.

export const FRAME_MS = 70;
export const FRAMES = 14;

export const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

// The ease-out tail: ascending delays (ms) for the final steps, slowest at the very end. The LAST
// value is the gap before the snap to the real target, so the landing is the final decelerating beat
// — not a separate instant flash after the ramp. Earlier frames run at the steady FRAME_MS. Tunable.
const TAIL_MS = [110, 160, 230, 320, 430];

// Delay before showing step `i`, where the snap (i === total) is fromEnd 0 and gets the slowest delay,
// the last tumbling frame gets the next-slowest, and so on — so the ramp culminates on the landing.
function delayFor(i, total) {
  const fromEnd = total - i; // steps remaining after this one (0 === the snap itself)
  if (fromEnd < TAIL_MS.length) return TAIL_MS[TAIL_MS.length - 1 - fromEnd];
  return FRAME_MS;
}

// Play `frames` ([{ team, year }, …]) one per tick, then snap to `target` ({ name, year }).
// onFrame({ team, year }) fires each tick; onDone() once after the snap. Returns a cancel fn.
export function runReel({ frames, target, onFrame, onDone }) {
  let t = 0;
  let timer = null;
  const total = frames.length;
  const tick = () => {
    if (t >= total) {
      onFrame({ team: target.name, year: target.year, code: target.teamCode });
      onDone && onDone();
      return;
    }
    onFrame(frames[t]);
    t += 1;
    timer = setTimeout(tick, delayFor(t, total));
  };
  timer = setTimeout(tick, FRAME_MS);
  return () => timer && clearTimeout(timer);
}
