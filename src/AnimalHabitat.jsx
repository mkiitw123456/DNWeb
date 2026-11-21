import { useEffect, useRef } from "react";

const W = 320,
  H = 133,
  resolution = 2;
const mix = (a, b, f) => a + (b - a) * f;
function smooth(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
const art = new Map();
function loadArt(scene) {
  if (!art.has(scene)) {
    const images = ["", "-animals"].map(
      (suffix) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("habitat art unavailable"));
          image.src = `/habitats/${scene}${suffix}.webp`;
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
    size: p.size * (id % 4 === 2 ? 0.78 : 1),
    tilt:
      0.035 * Math.sin(angle * 3) +
      0.24 * Math.pow(Math.max(0, Math.sin(time * 0.63 + phase)), 14),
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
    tilt: walking ? 0.022 * Math.sin(time * 8) : 0,
  };
}
// Each trip starts on one floe and ends on the other. Walk, dive, and climb
// all use the same sprite, pivot and scale. Only its position and angle change.
const floes = [
  [34, 91, 62],
  [139, 195, 62],
  [243, 286, 65],
];
function penguin(id, time, count) {
  const trip = time / 10.5 + id * 0.347;
  const reverse = Math.floor(trip) % 2 === 1;
  const pair = id % 2;
  const a = floes[pair + (reverse ? 1 : 0)],
    b = floes[pair + (reverse ? 0 : 1)];
  const dir = reverse ? -1 : 1,
    f = trip % 1;
  const start = (a[0] + a[1]) / 2,
    edge = reverse ? a[0] : a[1],
    land = reverse ? b[1] : b[0];
  const lane = (id % 4) * 1.2;
  const size = count < 5 ? 40 : 26 + (id % 3) * 2;
  const stride = Math.sin(time * 8 + id);
  let x, y, tilt;
  if (f < 0.26) {
    const k = smooth(f / 0.26);
    x = mix(start, edge, k);
    y = a[2] + lane - Math.abs(stride) * Math.sin(Math.PI * k) * 1.1;
    tilt = stride * 0.085 * Math.sin(Math.PI * k);
  } else if (f < 0.8) {
    const k = (f - 0.26) / 0.54;
    x = mix(edge, land, smooth(k));
    const depth = 37 + (id % 4) * 4;
    y =
      mix(a[2], b[2], k) +
      lane +
      depth * Math.sin(Math.PI * k) ** 2 -
      5 * Math.sin(2 * Math.PI * k);
    tilt = 1.1 * smooth(k / 0.23) * (1 - smooth((k - 0.72) / 0.28));
  } else {
    const k = smooth((f - 0.8) / 0.2);
    x = mix(land, (b[0] + b[1]) / 2, k);
    y = b[2] + lane - Math.abs(stride) * Math.sin(Math.PI * k);
    tilt = stride * 0.07 * Math.sin(Math.PI * k);
  }
  return { x, y, dir, size, tile: id % 4, tilt, underwater: y > 76 };
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
function drawAnimal(c, img, a) {
  c.save();
  c.translate(a.x, a.y - a.size * 0.47);
  c.scale(a.dir, 1);
  c.rotate(a.tilt || 0);
  c.drawImage(
    img,
    a.tile * 128,
    0,
    128,
    128,
    -a.size / 2,
    -a.size * 0.53,
    a.size,
    a.size,
  );
  c.restore();
}
function draw(c, [back, atlas], scene, total, cap, time, arrival) {
  c.setTransform(resolution, 0, 0, resolution, 0, 0);
  c.imageSmoothingEnabled = true;
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
      });
    }
    if (actors[2])
      Object.assign(actors[2], {
        x: 224,
        y: 113 + Math.sin(time * 1.5) * 0.4,
        tile: 3,
        tilt: 0,
      });
  }
  const age = arrival ? time - arrival.time : Infinity;
  if (age < 5.5 && actors.length) {
    const actor = actors.at(-1);
    const start =
      scene === "pond" ? [26, 42] : scene === "cats" ? [252, 77] : [36, 62];
    const land =
      scene === "pond" ? [57, 68] : scene === "cats" ? [232, 89] : [65, 62];
    const jump = smooth((age - 0.25) / 1.1),
      join = smooth((age - 1.35) / 4.15);
    actor.x = mix(mix(start[0], land[0], jump), actor.x, join);
    actor.y =
      mix(mix(start[1], land[1], jump), actor.y, join) -
      (scene === "pond" ? 11 * Math.sin(jump * Math.PI) : 0);
    if (age < 1.4) {
      actor.dir = scene === "cats" ? -1 : 1;
      actor.tilt = scene === "ice" ? 0.06 * Math.sin(age * 8) : 0;
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
    } else if (scene === "cats" || !a.underwater) {
      ellipse(c, a.x, a.y - 1, a.size * 0.3, 2.3, "#36495447");
    }
    drawAnimal(c, atlas, a);
    if (scene === "ice" && a.underwater) {
      for (let i = 0; i < 3; i++) {
        const k = (time * 0.9 + i * 0.33) % 1;
        ellipse(
          c,
          a.x - a.dir * (5 + k * 15),
          a.y - a.size * 0.29 - k * 8,
          1 + k,
          1 + k,
          "#c3e7ed99",
          true,
        );
      }
    }
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
  return (
    <canvas
      ref={node}
      width={W * resolution}
      height={H * resolution}
      aria-hidden="true"
    />
  );
}
