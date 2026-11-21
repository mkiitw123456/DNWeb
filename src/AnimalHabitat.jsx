import { useEffect, useRef } from "react";

const W = 320,
  H = 132,
  tau = 2 * Math.PI;
const ease = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const palettes = {
  pond: ["#fff0ac", "#d9c2a0", "#efda7b", "#bb9072"],
  cats: ["#d48b51", "#525264", "#d4bfaa", "#efd7a3"],
  ice: ["#354d68", "#48576b", "#566780", "#364964"],
};
function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}
function oval(c, x, y, rx, ry, color) {
  for (let row = -ry; row <= ry; row++) {
    const span = Math.round(
      rx * Math.sqrt(Math.max(0, 1 - (row * row) / (ry * ry))),
    );
    rect(c, x - span, y + row, 2 * span + 1, 1, color);
  }
}
function reeds(c, x, y, sway = 0) {
  for (let j = 0; j < 7; j++) {
    const h = 9 + ((j * 11) % 16),
      tip = x + j * 2 + Math.round(Math.sin(j * 2 + sway) * 2);
    rect(c, x + j * 2, y - h, 1, h, "#486c46");
    rect(c, tip, y - h - 3, 2, 6, j % 2 ? "#996d43" : "#739456");
  }
}
function box(c, x, y, front) {
  rect(c, x - 10, y - 5, 21, 7, front ? "#be8b58" : "#6e5145");
  if (front) {
    rect(c, x - 10, y - 6, 21, 2, "#e3b377");
    rect(c, x - 2, y - 4, 3, 5, "#d5a775");
  }
}
function shelfWindow(c, x) {
  rect(c, x, 9, 39, 31, "#936c61");
  rect(c, x + 2, 11, 35, 25, "#779397");
  rect(c, x + 4, 13, 9, 18, "#a9bab2");
  rect(c, x + 19, 11, 2, 25, "#a5816e");
  rect(c, x + 2, 22, 35, 2, "#a5816e");
  rect(c, x - 3, 38, 45, 4, "#f1cfa2");
}
function floe(c, x, y, w) {
  rect(c, x + 3, y + 1, w - 6, 6, "#67a5bf");
  rect(c, x + 1, y - 2, w - 2, 4, "#b0dfe9");
  rect(c, x + 5, y - 4, w - 10, 3, "#f5f6e8");
}
function background(scene) {
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  const c = layer.getContext("2d");
  const g = c.createLinearGradient(0, 0, 0, H);
  const colors =
    scene === "pond"
      ? ["#a9c6a3", "#74ada1", "#4d8f91"]
      : scene === "cats"
        ? ["#e8bca0", "#e8c49c", "#b88870"]
        : ["#91b3d2", "#548cac", "#21516f"];
  colors.forEach((color, i) => g.addColorStop(i / 2, color));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  if (scene === "pond") {
    for (let x = 0; x < W; x += 2) {
      const bank = Math.round(17 + 5 * Math.sin(x / 24) + 4 * Math.cos(x / 40));
      rect(c, x, 0, 2, bank, "#719267");
      rect(c, x, bank, 2, 3, "#b4be82");
    }
    for (let i = 0; i < 8; i++)
      reeds(c, i * 44 - 5, 18 + Math.round(4 * Math.sin(i)));
    for (let i = 0; i < 49; i++) {
      const x = (i * 97) % W,
        y = 34 + ((i * 31) % 92);
      rect(c, x, y, 3 + (i % 8), 1, "#91b9a6");
    }
    for (const [x, y] of [
      [46, 58],
      [56, 65],
      [241, 101],
      [250, 95],
      [271, 103],
      [96, 34],
      [185, 38],
    ]) {
      oval(c, x, y, 8, 3, "#538575");
      oval(c, x, y - 1, 7, 2, "#91b77a");
      rect(c, x, y, 4, 1, "#659a83");
    }
    for (const [x, y] of [
      [54, 60],
      [249, 91],
    ]) {
      rect(c, x - 4, y - 1, 8, 2, "#e2a7ad");
      rect(c, x - 2, y - 4, 4, 4, "#f9cfbf");
      rect(c, x, y - 1, 2, 1, "#f4dc87");
    }
  } else if (scene === "cats") {
    rect(c, 0, 0, W, 44, "#c99780");
    for (let y = 4; y < 42; y += 8)
      for (let x = (y % 16) * 2; x < W; x += 27)
        rect(c, x, y, 18, 1, "#d3a78c");
    for (const x of [23, 109, 218]) shelfWindow(c, x);
    rect(c, 0, 44, W, 3, "#a07868");
    for (let y = 50; y < H; y += 10) {
      rect(c, 0, y, W, 1, "#c99f84");
      for (let x = y % 21; x < W; x += 32) rect(c, x, y, 1, 10, "#d0a58a");
    }
    for (let i = 0; i < 18; i++) rect(c, 34 + i * 2, 48 + i, 48, 1, "#ecd3a9");
    for (const x of [7, 290, 304]) {
      rect(c, x, 39, 9, 8, "#aa715a");
      for (let j = 0; j < 4; j++)
        oval(
          c,
          x + 4 + Math.round(Math.sin(j * 2) * 4),
          37 - j * 2,
          3,
          3,
          "#73876b",
        );
    }
    box(c, 166, 79, false);
  } else {
    rect(c, 0, 0, W, 42, "#bad2df");
    rect(c, 0, 39, W, 4, "#e2e7e6");
    for (let x = 0; x < W; x += 2) {
      const h = Math.round(
        5 + 11 * Math.abs(Math.sin(x / 44)) + 6 * Math.cos(x / 17),
      );
      rect(c, x, 39 - h, 2, h, "#97b6ce");
      rect(c, x, 39 - h, 2, 3, "#e1e8eb");
    }
    for (const [x, y, w] of [
      [14, 54, 87],
      [134, 47, 72],
      [222, 59, 86],
    ])
      floe(c, x, y, w);
    for (let i = 0; i < 43; i++) {
      const x = (i * 79) % W,
        y = 65 + ((i * 23) % 67);
      rect(c, x, y, 2 + (i % 6), 1, "#75a4bc");
    }
    for (let x = 0; x < W; x += 2) {
      const h = 4 + Math.round(3 * Math.sin(x / 19));
      rect(c, x, H - h, 2, h, "#315d70");
    }
  }
  return layer;
}

// Sprites face right. Transparent cells retain the painted habitat behind them.
const sprites = {
  duck: [
    ".......ooo..",
    "......occso.",
    "......occobb",
    "..o....cco..",
    ".ocoooooco..",
    "occcccccco..",
    ".occaacco...",
    "..oooooo....",
  ],
  dip: [
    "...bb.......",
    "...cc.......",
    "..occco.....",
    ".occcccco...",
    "..ooooooo...",
  ],
  cat: [
    "....o...o...",
    "....co.oco..",
    "....ccccco..",
    "....occsco..",
    "..ooccccob..",
    "oocccccco...",
    "occcaacco...",
    "o.cc..cc....",
  ],
  nap: [
    "............",
    ".......o..o.",
    ".....oocooc.",
    "..ooccccccc.",
    "occccaaccso.",
    "..oooooooo..",
  ],
  bird: [
    "....oooo....",
    "...occcco...",
    "...ocsawob..",
    "...ocwwwo...",
    "..occwwwo...",
    "..ocawwwco..",
    "...ocwwco...",
    "...oboobo...",
  ],
  swim: [
    ".........ooo",
    "..oo...oocso",
    "oocccccccwwb",
    ".occcwwwwwo.",
    "...oooooo...",
  ],
};
const spriteCache = new Map();
function sprite(c, name, id, scene, x, y, dir) {
  const key = scene + ":" + name + ":" + (id % 4);
  let image = spriteCache.get(key);
  if (!image) {
    const map = {
      o: scene === "pond" ? "#625c49" : "#39404b",
      c: palettes[scene][id % 4],
      s: "#292d38",
      w: "#e4edf0",
      a: scene === "cats" ? "#896853" : "#bba87c",
      b: "#e7a450",
    };
    const rows = sprites[name];
    image = document.createElement("canvas");
    image.width = 12;
    image.height = rows.length;
    const brush = image.getContext("2d");
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++)
        if (row[i] !== ".") rect(brush, i, j, 1, 1, map[row[i]]);
    });
    spriteCache.set(key, image);
  }
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(dir, 1);
  c.drawImage(image, -6, -image.height);
  c.restore();
}
function pose(scene, id, t) {
  const phase = id * 2.39996;
  if (scene === "pond") {
    const swim = t * 0.19 + phase,
      rest = ease((Math.sin(t * 0.09 + phase) - 0.79) / 0.13);
    return {
      x: 153 + 115 * Math.sin(swim),
      y: mix(
        71 + 35 * Math.sin(swim * 0.77 + phase),
        17 + 2 * Math.sin(swim),
        rest,
      ),
      dir: Math.cos(swim) >= 0 ? 1 : -1,
      name: rest < 0.15 && Math.sin(t * 0.63 + phase) > 0.91 ? "dip" : "duck",
      water: rest < 0.65,
    };
  }
  if (scene === "cats") {
    const cycle = (t * 0.36 + phase) % tau;
    const home =
      [43, 128, 236, 72, 266, 153][id % 6] + (Math.floor(id / 6) % 4) * 5;
    const base = id % 3 === 0 ? 38 : 64 + ((id * 13) % 52);
    const walk = ease(Math.sin(cycle) * 1.7);
    return {
      x: home + walk * (id % 3 === 0 ? 11 : 27),
      y: base + (walk > 0 && walk < 1 ? Math.abs(Math.sin(t * 8)) : 0),
      dir: Math.cos(cycle) >= 0 ? 1 : -1,
      name: walk === 0 ? "nap" : "cat",
    };
  }
  const route = [
    [22, 92, 54, 140, 195, 47],
    [141, 198, 47, 231, 299, 59],
    [230, 297, 59, 22, 89, 54],
  ][id % 3];
  let f = (t * 0.066 + id * 0.137) % 1;
  const reverse = f >= 0.5;
  f = (f % 0.5) * 2;
  const [left, end, level, next, far, nextLevel] = reverse
    ? [route[3], route[4], route[5], route[0], route[1], route[2]]
    : route;
  const dir = Math.sign(end - left);
  if (f < 0.4)
    return {
      x: mix(left, end, ease(f / 0.4)),
      y: level + (f < 0.24 ? Math.sin(t * 9) * 1.3 : 0),
      dir,
      name: f < 0.24 ? "bird" : "swim",
    };
  const k = (f - 0.4) / 0.6;
  return {
    x: mix(end, next, ease(k)),
    y: mix(level, nextLevel, k) + Math.sin(k * Math.PI) * (35 + (id % 5) * 4),
    dir: next > end ? 1 : -1,
    name: "swim",
  };
}
function ripple(c, x, y, r) {
  c.strokeStyle = "#c8dfc0";
  c.beginPath();
  c.ellipse(Math.round(x), Math.round(y), r, Math.max(1, r * 0.23), 0, 0, tau);
  c.stroke();
}
function paint(c, base, scene, total, cap, t, entry) {
  c.drawImage(base, 0, 0);
  const first = Math.max(0, total - cap),
    animals = [];
  for (let id = first; id < total; id++)
    animals.push({ ...pose(scene, id, t), id });
  const age = entry ? t - entry.time : Infinity;
  if (scene === "pond" && age < 1.3) reeds(c, 16, 25, Math.sin(age * 13) * 2);
  if (scene === "cats") {
    // One cat follows a windblown leaf. Two more share the cardboard box.
    const leaf = 74 + 23 * Math.sin(t * 0.7);
    rect(c, leaf, 69 + Math.sin(t * 1.2) * 2, 4, 2, "#a8673c");
    if (animals.length > 0)
      Object.assign(animals[0], {
        x: 74 + 22 * Math.sin((t - 0.55) * 0.7),
        y: 77,
        name: "cat",
        dir: Math.cos((t - 0.55) * 0.7) > 0 ? 1 : -1,
      });
    if (animals.length > 1) {
      const jump = ease((Math.cos(t * 0.28) + 0.4) * 1.5);
      Object.assign(animals[1], {
        x: mix(140, 166, jump),
        y: mix(86, 77, jump) - Math.sin(jump * Math.PI) * 9,
        name: "cat",
        dir: Math.sin(t * 0.28) > 0 ? -1 : 1,
      });
    }
    if (animals.length > 2) {
      const perch = ease((Math.cos(t * 0.22) + 0.6) * 1.4);
      Object.assign(animals[2], {
        x: mix(194, 168, perch),
        y: mix(84, 68, perch) - Math.sin(perch * Math.PI) * 10,
        name: perch > 0.9 ? "nap" : "cat",
        dir: -1,
      });
    }
  }
  if (entry && age < 6 && animals.length) {
    const a = animals.at(-1);
    const spawn =
      scene === "pond" ? [23, 22] : scene === "cats" ? [-6, 89] : [23, 54];
    const landing =
      scene === "pond" ? [45, 42] : scene === "cats" ? [47, 88] : [57, 54];
    const u = ease((age - 0.35) / 1.15),
      v = ease((age - 1.5) / 4.5);
    a.x = mix(mix(spawn[0], landing[0], u), a.x, v);
    a.y = mix(mix(spawn[1], landing[1], u), a.y, v);
    if (scene === "pond") {
      a.y -= Math.sin(u * Math.PI) * 13;
      a.name = "duck";
      a.water = age > 1.45;
      if (age > 1.45 && age < 2.45) {
        ripple(c, ...landing, 2 + (age - 1.45) * 14);
        ripple(c, ...landing, 1 + (age - 1.45) * 8);
      }
      const buddy = animals.find((p) => p.id === entry.buddy);
      if (buddy) {
        const greeting =
          ease((age - 0.7) / 1.5) * (1 - ease((age - 3.6) / 2.4));
        buddy.x = mix(buddy.x, a.x + 13, greeting);
        buddy.y = mix(buddy.y, a.y + 4, greeting);
        if (greeting > 0.35) {
          buddy.dir = -1;
          buddy.name = "duck";
          buddy.water = true;
        }
      }
    } else {
      a.name = scene === "cats" ? "cat" : "bird";
      a.y -= Math.abs(Math.sin(age * 8)) * (1 - v);
    }
    if (age < 1.6) a.dir = 1;
  }
  animals.sort((a, b) => a.y - b.y);
  let boxFront = false;
  for (const a of animals) {
    if (scene === "cats" && !boxFront && a.y > 79) {
      box(c, 166, 79, true);
      boxFront = true;
    }
    if (scene === "pond" && a.water) {
      rect(c, a.x - 8, a.y, 15, 1, "#b9d2b2");
      rect(c, a.x - 4 - a.dir * 4, a.y + 2, 8, 1, "#8db8a9");
    }
    if (scene === "ice" && a.y > 65) {
      rect(c, a.x - a.dir * 9, a.y - 4, 2, 1, "#a0c6d7");
      rect(
        c,
        a.x - a.dir * 14,
        a.y - 7 + Math.sin(t * 2 + a.id),
        1,
        1,
        "#a0c6d7",
      );
    }
    sprite(c, a.name, a.id, scene, a.x, a.y, a.dir);
  }
  if (scene === "cats" && !boxFront) box(c, 166, 79, true);
}

export default function AnimalHabitat({ scene, total, capacity, playing }) {
  const node = useRef(null),
    elapsed = useRef(0),
    previous = useRef(total),
    entry = useRef(null),
    base = useRef(null);
  useEffect(() => {
    const canvas = node.current,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    base.current ??= background(scene);
    if (playing && total > previous.current) {
      let buddy = null,
        best = Infinity;
      for (
        let id = Math.max(0, total - capacity);
        scene === "pond" && id < total - 1;
        id++
      ) {
        const p = pose(scene, id, elapsed.current),
          dist = Math.hypot(p.x - 45, p.y - 42);
        if (dist < best) {
          best = dist;
          buddy = id;
        }
      }
      entry.current = { time: elapsed.current, buddy };
    } else if (!playing || total < previous.current) entry.current = null;
    previous.current = total;
    function draw() {
      paint(
        ctx,
        base.current,
        scene,
        total,
        capacity,
        elapsed.current,
        entry.current,
      );
    }
    draw();
    if (!playing) return;
    let frame = 0,
      last = null,
      visible = false;
    function tick(now) {
      if (last === null || now - last >= 1000 / 30) {
        elapsed.current +=
          last === null ? 0 : Math.min((now - last) / 1000, 0.1);
        last = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function resume() {
      cancelAnimationFrame(frame);
      last = null;
      if (visible && !document.hidden) frame = requestAnimationFrame(tick);
    }
    const observer = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      resume();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", resume);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [scene, total, capacity, playing]);
  return <canvas ref={node} width={W} height={H} aria-hidden="true" />;
}
