import test from "node:test";
import assert from "node:assert/strict";
import { animateStarTransfer } from "../src/star-motion.js";

function transfer(delta, reduced = false) {
  const sprites = [];
  const layer = {
    clientWidth: 800,
    clientHeight: 600,
    ownerDocument: {
      createElement() {
        return {
          animate(frames, timing) {
            this.frames = frames;
            this.timing = timing;
            this.animation = { cancel() {} };
            return this.animation;
          },
          remove() {
            this.removed = true;
          },
        };
      },
    },
    append(sprite) {
      sprites.push(sprite);
    },
  };
  let steps = 0;
  const cancel = animateStarTransfer({
    layer,
    asset: "star.png",
    delta,
    reduced,
    sourceRect: { left: 200, top: 150, width: 126, height: 126 },
    walletRect: { left: 700, top: 20, width: 28, height: 28 },
    onStar: () => steps++,
  });
  return { sprites, steps: () => steps, cancel };
}

test("seven awarded stars split from the emblem and advance the counter once per arrival", () => {
  const { sprites, steps } = transfer(7);
  const [emblem, ...particles] = sprites;
  assert.equal(particles.length, 7);
  assert.match(
    emblem.frames[0].transform,
    /translate3d\(249px,199px,0\) scale\(4.5\)/,
  );
  assert.ok(emblem.timing.duration > 0);
  emblem.animation.onfinish();
  assert.equal(steps(), 0);
  particles.forEach((sprite, i) => {
    assert.match(sprite.frames[0].transform, /translate3d\(249px,199px,0\)/);
    assert.match(sprite.frames.at(-1).transform, /translate3d\(700px,20px,0\)/);
    sprite.animation.onfinish();
    assert.equal(steps(), i + 1);
  });
});

test("lost stars fall from the wallet in both motion modes and canceled particles cannot change the counter", () => {
  for (const reduced of [false, true]) {
    const { sprites, steps, cancel } = transfer(-3, reduced);
    assert.equal(sprites.length, 3);
    for (const sprite of sprites) {
      assert.match(sprite.frames[0].transform, /translate3d\(700px,20px,0\)/);
      const landing = /translate3d\([^,]+,([\d.]+)px,0\)/.exec(
        sprite.frames.at(-1).transform,
      );
      assert.ok(Number(landing[1]) > 20);
    }
    sprites[0].animation.onfinish();
    cancel();
    assert.equal(steps(), 1);
    assert.ok(sprites.every((sprite) => sprite.removed));
    assert.equal(sprites[1].animation.onfinish, null);
  }
  assert.equal(transfer(0).sprites.length, 0);
});
