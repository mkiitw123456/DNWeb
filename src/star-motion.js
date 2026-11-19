// All flight positions are measured in viewport pixels, relative to the
// fixed reward layer. The image's centre follows the path at every scale.
const spriteSize = 28;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));

function center(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function pose(x, y, scale = 1, angle = 0) {
  return `translate3d(${x - spriteSize / 2}px,${y - spriteSize / 2}px,0) scale(${scale}) rotate(${angle}deg)`;
}

function gainFlight(source, wallet, index, count, reduced) {
  const angle = index * goldenAngle - Math.PI / 2;
  const radius = count === 1 ? 0 : (reduced ? 14 : 36) + (index % 3) * 4;
  const x = source.x + Math.cos(angle) * radius;
  const y = source.y + Math.sin(angle) * radius;
  const stagger = Math.min(82, 800 / Math.max(1, count - 1));
  const duration = (reduced ? 540 : 800) + index * stagger;
  const fan = reduced ? 120 : 175;
  const arc = reduced ? 0 : 22 + (index % 4) * 6;
  return {
    duration,
    frames: [
      { offset: 0, transform: pose(source.x, source.y, 0.28), opacity: 0 },
      {
        offset: fan / duration,
        transform: pose(x, y, 0.92),
        opacity: 1,
        easing: "ease-in",
      },
      {
        offset: 0.67,
        transform: pose(
          x + (wallet.x - x) * 0.45,
          y + (wallet.y - y) * 0.53 - arc,
          0.83,
          reduced ? 0 : 16,
        ),
        opacity: 1,
        easing: "ease-out",
      },
      { offset: 1, transform: pose(wallet.x, wallet.y, 0.36), opacity: 0.18 },
    ],
  };
}

function lossFlight(wallet, index, reduced, width, height) {
  const drift = Math.sin(index * goldenAngle - 0.55) * (reduced ? 10 : 45);
  const endX = Math.max(15, Math.min(width - 15, wallet.x + drift - 8));
  const fall = reduced ? 48 : Math.min(height * 0.32, 158 + (index % 4) * 18);
  const spin = reduced ? 0 : (index % 2 ? 1 : -1) * 58;
  return [
    { offset: 0, transform: pose(wallet.x, wallet.y, 0.72), opacity: 0 },
    {
      offset: 0.14,
      transform: pose(wallet.x + drift * 0.3, wallet.y + 3, 0.98),
      opacity: 1,
      easing: "ease-in",
    },
    {
      offset: 0.68,
      transform: pose(endX, wallet.y + fall * 0.55, 0.84, spin * 0.5),
      opacity: 1,
    },
    {
      offset: 1,
      transform: pose(endX, wallet.y + fall, 0.48, spin),
      opacity: 0,
    },
  ];
}

export function animateStarTransfer({
  layer,
  sourceRect,
  walletRect,
  asset,
  delta,
  reduced,
  onStar,
}) {
  const jobs = new Map();
  function play(className, frames, duration, delay, onFinish) {
    const sprite = layer.ownerDocument.createElement("img");
    sprite.src = asset;
    sprite.alt = "";
    sprite.className = className;
    layer.append(sprite);
    const animation = sprite.animate(frames, { duration, delay, fill: "both" });
    jobs.set(sprite, animation);
    animation.onfinish = () => {
      jobs.delete(sprite);
      sprite.remove();
      onFinish?.();
    };
  }
  const wallet = center(walletRect);
  const count = Math.abs(delta);
  if (delta > 0) {
    const source = center(sourceRect);
    const scale = sourceRect.width / spriteSize;
    const shrink = reduced ? 280 : 480;
    play(
      "reward-splitting-star",
      [
        {
          offset: 0,
          transform: pose(source.x, source.y, scale),
          opacity: 1,
          easing: "ease-in-out",
        },
        {
          offset: 0.76,
          transform: pose(source.x, source.y, scale * 0.55),
          opacity: 1,
        },
        { offset: 1, transform: pose(source.x, source.y, 0.35), opacity: 0 },
      ],
      shrink,
      0,
    );
    for (let i = 0; i < count; i++) {
      const { frames, duration } = gainFlight(
        source,
        wallet,
        i,
        count,
        reduced,
      );
      play(
        "reward-flying-star reward-gain-star",
        frames,
        duration,
        shrink * 0.68,
        onStar,
      );
    }
  } else {
    const { clientWidth: width, clientHeight: height } = layer;
    const stagger = Math.min(120, 900 / Math.max(1, count - 1));
    for (let i = 0; i < count; i++) {
      play(
        "reward-flying-star reward-loss-star",
        lossFlight(wallet, i, reduced, width, height),
        reduced ? 400 : 670,
        i * stagger,
        onStar,
      );
    }
  }
  return () => {
    for (const [sprite, animation] of jobs) {
      animation.onfinish = null;
      animation.cancel();
      sprite.remove();
    }
    jobs.clear();
  };
}
