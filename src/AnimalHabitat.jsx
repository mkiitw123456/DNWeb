import { useEffect, useRef } from "react";

const W = 320,
  H = 133,
  tileSize = 32;
const mix = (a, b, f) => a + (b - a) * f;
function smooth(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
// Three spare rows below each sprite leave room for toes under the waterline.
const frameHeight = tileSize + 3;
const strideFrames = [0, 1, 2, 1, 0, -1, -2, -1];
const kickReach = [2, 1, -1, -3, -4, -3, -1, 1];
const kickDepth = [1, 2, 3, 3, 2, 1, 0, 0];

function makeGaitAtlas(image, scene) {
  const sheet = document.createElement("canvas");
  sheet.width = image.width;
  sheet.height = frameHeight * (1 + strideFrames.length);
  const c = sheet.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.drawImage(image, 0, 0); // The first row is the resting pose.
  for (let frame = 0; frame < strideFrames.length; frame++) {
    const top = (frame + 1) * frameHeight;
    for (let tile = 0; tile < 4; tile++) {
      const x = tile * tileSize;
      if (scene === "pond") {
        for (let leg = 0; leg < 2; leg++) {
          const phase = (frame + leg * 4) % 8;
          const hip = x + (leg ? 16 : 11);
          const toe = hip + kickReach[phase];
          const depth = kickDepth[phase];
          c.fillStyle = leg ? "#af8050" : "#79735a";
          c.fillRect(hip, top + 29, 2, 2);
          c.fillRect(Math.min(hip, toe), top + 30, Math.abs(toe - hip) + 2, 1 + Math.min(depth, 1));
          c.fillRect(toe, top + 30, 2, depth + 1);
          c.fillRect(toe - 1, top + 30 + depth, 4, 1);
        }
        c.drawImage(image, x, 0, tileSize, tileSize, x, top, tileSize, tileSize);
        continue;
      }
      const hipRow = scene === "ice" ? 28 : 26;
      const split = scene === "ice" ? [16, 16, 18, 16][tile] : [12, 13, 13, 13][tile];
      c.drawImage(image, x, 0, tileSize, hipRow, x, top, tileSize, hipRow);
      for (let leg = 0; leg < 2; leg++) {
        const phase = (frame + leg * 4) % 8;
        const start = leg ? split : 0;
        const width = leg ? tileSize - split : split;
        const height = tileSize - hipRow;
        const lift = phase >= 2 && phase <= 4 ? 1 : 0;
        for (let row = 0; row < height - lift; row++) {
          const bend = row / (height - lift - 1);
          const dx = Math.round(strideFrames[phase] * bend);
          const sy = hipRow + Math.round(bend * (height - 1));
          c.drawImage(image, x + start, sy, width, 1, x + start + dx, top + hipRow + row, width, 1);
        }
      }
    }
  }
  return sheet;
}

const art = new Map();
function loadArt(scene) {
  if (!art.has(scene)) {
    const images = ["", "-animals"].map(
      (suffix) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(suffix ? makeGaitAtlas(image, scene) : image);
          image.onerror = () => reject(new Error("habitat art unavailable"));
          image.src = `/habitats/${scene}${suffix}.webp?v=pixel-meadow`;
        }),
    );
    art.set(
      scene,
      Promise.all(images).catch((error) => {
        art.delete(scene);
        throw error;
      }),
    );
  }
  return art.get(scene);
}
function space(id, count) {
  // Fill the foreground first, then distribute later visitors into staggered rows.
  const slot = ((id % 24) * 7) % 24;
  const depth = slot % 4;
  const col = Math.floor(slot / 4);
  return {
    x: count < 4 ? [108, 205, 155][id % 3] : 29 + col * 51 + (depth % 2) * 8,
    y: count < 4 ? 94 + ((id % 3) - 1) * 13 : 65 + depth * 16,
    size: count < 6 ? 42 : 25 + depth * 2,
  };
}
function duck(id, time, count) {
  const p = space(id, count),
    phase = id * 2.4,
    angle = time * 0.22 + phase;
  return {
    ...p,
    x: p.x + Math.sin(angle) * (count < 6 ? 34 : 13),
    y: p.y + 4 * Math.cos(angle * 0.8 + phase),
    dir: Math.cos(angle) >= 0 ? 1 : -1,
    tile: id % 4,
    stepping: true,
    size: p.size * (id % 4 === 2 ? 0.78 : 1),
  };
}
function cat(id, time, count) {
  const p = space(id, count),
    cycle = time * 0.32 + id * 1.9;
  const walking = Math.abs(Math.cos(cycle)) > 0.4;
  return {
    ...p,
    x: p.x + (count < 6 ? 24 : 9) * Math.sin(cycle),
    y:
      Math.max(77, p.y) +
      (walking ? 0.85 * Math.abs(Math.sin(time * 8 + id)) : 0),
    size: p.size * 1.08,
    dir: Math.cos(cycle) >= 0 ? 1 : -1,
    tile: id % 3,
    stepping: walking,
  };
}
// Walk and glide along the same snow-covered lane; pause before turning back.
function penguin(id, time, count) {
  const home = space(id, count);
  const lap = time / 7 + id * 0.39;
  const dir = Math.floor(lap) % 2 === 0 ? 1 : -1;
  const f = lap % 1;
  const walk = smooth(f / 0.52);
  const glide = smooth((f - 0.55) / 0.2);
  const progress = 0.74 * walk + 0.26 * glide;
  const radius = count < 5 ? 25 : 10;
  const walking = Math.sin(Math.PI * walk);
  const stride = Math.sin(13 * time + id);
  return {
    x: home.x + dir * radius * (2 * progress - 1),
    y: home.y + 2 * Math.sin(Math.PI * progress) - Math.abs(stride) * walking,
    dir,
    size: home.size,
    tile: id % 4,
    walking,
    stepping: walking > 0.08,
  };
}
function ellipse(c, x, y, rx, ry, color, stroke = false) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (stroke) {
    c.strokeStyle = color;
    c.lineWidth = 0.8;
    c.stroke();
  } else {
    c.fillStyle = color;
    c.fill();
  }
}
function basket(c, front) {
  if (!front) {
    ellipse(c, 176, 100, 22, 6, "#917152");
    ellipse(c, 176, 99, 20, 4, "#514637");
    return;
  }
  c.fillStyle = "#9c6944";
  c.fillRect(157, 101, 38, 5);
  c.fillStyle = "#c59663";
  c.fillRect(155, 100, 42, 2);
  for (let i = 0; i < 9; i++) {
    c.fillStyle = i % 2 ? "#795536" : "#ce9e67";
    c.fillRect(158 + i * 4, 103, 3, 1);
  }
}
function drawAnimal(c, img, a, frame) {
  // Keep the sprite on the pixel grid while its path uses fractional coordinates.
  const size = Math.round(a.size);
  const left = Math.round(a.x - size / 2);
  const top = Math.round(a.y - size);
  c.save();
  c.translate(a.dir < 0 ? left + size : left, top);
  c.scale(a.dir, 1);
  const sourceY = frame * frameHeight;
  c.drawImage(img, a.tile * tileSize, sourceY, tileSize, tileSize, 0, 0, size, size);
  const extra = frameHeight - tileSize;
  c.drawImage(img, a.tile * tileSize, sourceY + tileSize, tileSize, extra, 0, size, size, Math.round(size * extra / tileSize));
  c.restore();
}
function draw(c, [back, atlas], scene, total, cap, time, arrival) {
  c.imageSmoothingEnabled = false;
  c.drawImage(back, 0, 0, W, H);
  const count = Math.min(total, cap);
  const actors = [];
  const pose = scene === "ice" ? penguin : scene === "cats" ? cat : duck;
  for (let id = total - count; id < total; id++)
    actors.push({ ...pose(id, time, count), id });
  // The courtyard has three readable destinations: open paving, a box, and a sunny mat.
  if (scene === "cats") {
    basket(c, false);
    if (actors[0]) {
      const leafX = 85 + 19 * Math.sin(time * 0.57);
      c.save();
      c.translate(leafX + 10, 91 + 2 * Math.sin(time));
      c.rotate(-0.45);
      ellipse(c, 0, 0, 3.5, 1.3, "#a25633");
      c.restore();
      Object.assign(actors[0], {
        x: 85 + 18 * Math.sin((time - 0.6) * 0.57),
        y: 96 + Math.abs(Math.sin(time * 6)),
        tile: 0,
        stepping: Math.abs(Math.cos((time - 0.6) * 0.57)) > 0.15,
        dir: Math.cos((time - 0.6) * 0.57) > 0 ? 1 : -1,
      });
    }
    if (actors[1]) {
      const hop = smooth((Math.cos(time * 0.28) + 0.3) * 1.4);
      Object.assign(actors[1], {
        x: mix(142, 176, hop),
        y: mix(105, 101, hop) - Math.sin(hop * Math.PI) * 10,
        dir: Math.sin(time * 0.28) > 0 ? -1 : 1,
        tile: 1,
        stepping: false,
      });
    }
    if (actors[2])
      Object.assign(actors[2], {
        x: 224,
        y: 113 + Math.sin(time * 1.5) * 0.4,
        tile: 3,
        stepping: false,
      });
  }
  const age = arrival ? time - arrival.time : Infinity;
  if (age < 5.5 && actors.length) {
    const actor = actors.at(-1);
    const start =
      scene === "pond" ? [26, 42] : scene === "cats" ? [252, 77] : [287, 61];
    const land =
      scene === "pond" ? [57, 68] : scene === "cats" ? [232, 89] : [254, 70];
    const jump = smooth((age - 0.25) / 1.1),
      join = smooth((age - 1.35) / 4.15);
    actor.x = mix(mix(start[0], land[0], jump), actor.x, join);
    actor.y =
      mix(mix(start[1], land[1], jump), actor.y, join) -
      (scene === "pond" ? 11 * Math.sin(jump * Math.PI) : 0);
    actor.stepping = age > 0.25 && (scene !== "pond" || age > 1.35);
    if (age < 1.4) {
      actor.dir = scene === "pond" ? 1 : -1;
    }
    if (scene === "pond") {
      if (age > 1.32 && age < 2.42) {
        const f = (age - 1.32) / 1.1;
        for (const r of [9, 17])
          ellipse(
            c,
            57,
            68,
            2 + r * f,
            1 + r * f * 0.3,
            `rgba(232,248,208,${1 - f})`,
            true,
          );
      }
      const buddy = actors.find((a) => a.id === arrival.buddy);
      if (buddy) {
        const f = smooth((age - 0.5) / 1.6) * (1 - smooth((age - 3.2) / 2.3));
        buddy.x = mix(buddy.x, actor.x + 25, f);
        buddy.y = mix(buddy.y, actor.y + 5, f);
      }
    }
  }
  actors.sort((a, b) => a.y - b.y);
  let front = false;
  for (const a of actors) {
    if (scene === "cats" && !front && a.y > 102) {
      basket(c, true);
      front = true;
    }
    if (scene === "pond") {
      ellipse(c, a.x, a.y - 2, a.size * 0.4, 2.7, "#263e4a52");
      for (let i = 0; i < 2; i++) {
        const f = (time * 0.52 + a.id * 0.35 + i * 0.5) % 1;
        ellipse(
          c,
          a.x - a.dir * (4 + 8 * f),
          a.y - 1,
          6 + 13 * f,
          1.4 + 2.4 * f,
          `rgba(220,240,205,${0.52 * (1 - f)})`,
          true,
        );
      }
    } else {
      if (scene === "ice" && !(age < 5.5 && a.id === total - 1)) {
        for (let step = 4; step >= 1; step--) {
          const past = penguin(a.id, Math.max(0, time - step * 0.34), count);
          if (past.walking < 0.18) continue;
          c.fillStyle = "#b9afc1";
          c.fillRect(
            Math.round(past.x + (step % 2 ? 2 : -2)),
            Math.round(past.y),
            2,
            1,
          );
        }
      }
      ellipse(c, a.x, a.y - 1, a.size * 0.3, 2.3, "#36495447");
    }
    const cadence = scene === "pond" ? 8 : scene === "cats" ? 10 : 12;
    const frame = a.stepping ? 1 + (Math.floor(time * cadence + a.id * 3) % strideFrames.length) : 0;
    drawAnimal(c, atlas, a, frame);
  }
  if (scene === "cats" && !front) basket(c, true);
}

export default function AnimalHabitat({ scene, total, capacity, playing }) {
  const node = useRef(null),
    elapsed = useRef(0),
    previous = useRef(total),
    arrival = useRef(null);
  useEffect(() => {
    const canvas = node.current,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (playing && total > previous.current) {
      let buddy = null,
        best = Infinity;
      for (
        let id = Math.max(0, total - capacity);
        scene === "pond" && id < total - 1;
        id++
      ) {
        const a = duck(id, elapsed.current, Math.min(total, capacity)),
          d = Math.hypot(a.x - 57, a.y - 68);
        if (d < best) {
          buddy = id;
          best = d;
        }
      }
      arrival.current = { time: elapsed.current, buddy };
    } else if (!playing || total < previous.current) arrival.current = null;
    previous.current = total;
    let cancelled = false,
      frame = 0,
      visible = false,
      last = null,
      images = null;
    function paint() {
      draw(
        ctx,
        images,
        scene,
        total,
        capacity,
        elapsed.current,
        arrival.current,
      );
    }
    function tick(now) {
      if (last === null || now - last >= 1000 / 30) {
        elapsed.current +=
          last === null ? 0 : Math.min((now - last) / 1000, 0.1);
        last = now;
        paint();
      }
      frame = requestAnimationFrame(tick);
    }
    function resume() {
      cancelAnimationFrame(frame);
      last = null;
      if (images && playing && visible && !document.hidden)
        frame = requestAnimationFrame(tick);
    }
    const observer = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      resume();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", resume);
    loadArt(scene)
      .then((loaded) => {
        if (!cancelled) {
          images = loaded;
          paint();
          resume();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [scene, total, capacity, playing]);
  return <canvas ref={node} width={W} height={H} aria-hidden="true" />;
}
