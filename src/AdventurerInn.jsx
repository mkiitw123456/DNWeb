import { useEffect, useRef } from "react";

const width = 384,
  height = 156,
  seats = 24;
const tableX = [115, 214, 313],
  tableY = [78, 126];
const coats = [
  "#4e86ae",
  "#a74656",
  "#8176b5",
  "#d28949",
  "#4f8a78",
  "#677ca4",
];
const hair = ["#a76945", "#f0cd88", "#634d55", "#bd8173", "#cfccc2"];
const ink = "#30242e";
const door = { x: 27, y: 58 };
const smooth = (x) => x * x * (3 - 2 * x);
const clamp = (x) => Math.max(0, Math.min(1, x));

function seat(id) {
  const slot = id % seats,
    table = slot % 6,
    place = Math.floor(slot / 6);
  const x = tableX[table % 3],
    y = tableY[Math.floor(table / 3)];
  return {
    x: x + (place % 2 ? 13 : -13),
    y: y + (place < 2 ? -5 : 10),
    side: x + (place % 2 ? 28 : -28),
    aisle: y - 22,
  };
}

function route(id) {
  const s = seat(id);
  const points = [
    door,
    { x: 48, y: 66 },
    { x: 53, y: s.aisle },
    { x: s.side, y: s.aisle },
    { x: s.side, y: s.y },
    s,
  ];
  let distance = 0;
  const legs = points.slice(1).map((end, i) => {
    const start = points[i],
      length = Math.hypot(end.x - start.x, end.y - start.y);
    distance += length;
    return { start, end, length, until: distance };
  });
  return { legs, distance };
}

function position(path, t) {
  const distance = clamp(t) * path.distance;
  const leg = path.legs.find((l) => l.until >= distance) || path.legs.at(-1);
  const f = clamp(1 - (leg.until - distance) / leg.length);
  return {
    x: leg.start.x + f * (leg.end.x - leg.start.x),
    y: leg.start.y + f * (leg.end.y - leg.start.y),
  };
}

function room() {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const ctx = layer.getContext("2d");
  const rect = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  rect(0, 0, width, height, "#86644d");
  for (let y = 51, row = 0; y < height; y += 8, row++) {
    rect(0, y, width, 8, ["#957057", "#9f785c", "#a57d60"][row % 3]);
    rect(0, y + 7, width, 1, "#795941");
    for (let x = (row % 3) * 21; x < width; x += 65)
      rect(x, y, 1, 7, "#856047");
  }
  rect(0, 0, width, 48, "#b08a67");
  for (const x of [0, 53, 149, 240, 377]) {
    rect(x, 0, 6, 50, "#584034");
    rect(x + 1, 1, 2, 47, "#856046");
  }
  rect(0, 0, width, 6, "#533b33");
  rect(0, 44, width, 6, "#5c4438");
  for (const x of [70, 168]) {
    rect(x, 10, 49, 28, "#644a44");
    rect(x + 3, 12, 43, 22, "#394863");
    rect(x + 5, 14, 1, 1, "#ffe2a5");
    rect(x + 32, 17, 2, 1, "#bfd6da");
    rect(x + 5, 28, 38, 5, "#45596a");
    rect(x + 23, 12, 3, 22, "#805d47");
    rect(x + 3, 23, 43, 2, "#805d47");
    rect(x - 2, 36, 53, 3, "#79553e");
  }
  // Back bar, bottles, and the framed inn sign.
  rect(253, 14, 57, 3, "#694935");
  rect(253, 29, 57, 3, "#694935");
  for (let i = 0; i < 12; i++) {
    const x = 256 + (i % 6) * 9,
      y = i < 6 ? 7 : 22;
    rect(x + 1, y - 2, 2, 3, "#d8af7d");
    rect(x, y + 1, 5, 6, ["#698b72", "#a35c45", "#c2a062"][i % 3]);
  }
  rect(251, 38, 63, 12, "#765339");
  rect(249, 36, 67, 4, "#d3a978");
  rect(322, 9, 44, 24, "#614632");
  rect(324, 11, 40, 20, "#735146");
  rect(336, 16, 9, 9, "#e1af64");
  rect(335, 15, 11, 3, "#fff0c3");
  rect(345, 18, 4, 2, "#edc380");
  rect(347, 19, 2, 5, "#edc380");
  rect(345, 23, 4, 2, "#edc380");
  rect(14, 12, 27, 41, "#584034");
  rect(16, 15, 23, 36, "#29384a");
  rect(11, 52, 33, 4, "#cdab80");
  rect(13, 57, 29, 5, "#704e47");
  return layer;
}

function guest(ctx, id, x, y, step, sitting, reach = 0) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const rect = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const stride = sitting ? 0 : Math.sin(step);
  ctx.fillStyle = "#5d464563";
  ctx.fillRect(-5, -1, 11, 2);
  ctx.translate(0, sitting ? 2 : Math.round(-Math.abs(stride)));
  const coat = coats[id % coats.length],
    skin = id % 3 === 1 ? "#d19873" : "#efbb91";
  if (sitting) {
    rect(-4, -6, 4, 3, ink);
    rect(1, -6, 5, 3, ink);
    rect(-5, -4, 2, 3, ink);
    rect(5, -4, 2, 3, ink);
  } else {
    rect(-4, -6, 3, 5, ink);
    rect(1, -6, 3, 5, ink);
    rect(-5, -2 + (stride > 0.25 ? 1 : 0), 4, 2, ink);
    rect(1, -2 + (stride < -0.25 ? 1 : 0), 4, 2, ink);
  }
  rect(-5, -12, 10, 7, ink);
  rect(-4, -12, 8, 7, coat);
  rect(-3, -7, 7, 1, "#c39261");
  rect(-3, -17, 7, 5, skin);
  rect(2, -15, 1, 1, ink);
  rect(-4, -19, 8, 3, hair[id % 5]);
  rect(-4, -17, 2, 4, hair[id % 5]);
  if (id % 3 === 0) {
    rect(-6, -11, 2, 8, "#b9cad2");
    rect(-7, -6, 4, 1, "#e6b86c");
  }
  if (id % 3 === 1) {
    rect(-4, -12, 3, 6, "#e9e1bb");
    rect(4, -8, 3, 3, "#eac98b");
  }
  if (id % 3 === 2) {
    rect(-5, -19, 10, 2, "#d7a54d");
    rect(-3, -21, 6, 3, "#bc8242");
    rect(0, -16, 4, 2, "#9fd4dc");
  }
  rect(4 + Math.round(reach * 2), -10 - Math.round(reach * 2), 3, 3, skin);
  ctx.restore();
}

function table(ctx, x, y) {
  ctx.fillStyle = "#5e4033";
  ctx.fillRect(x - 22, y - 4, 44, 10);
  ctx.fillRect(x - 19, y + 4, 3, 5);
  ctx.fillRect(x + 16, y + 4, 3, 5);
  ctx.fillStyle = "#c49361";
  ctx.fillRect(x - 22, y - 6, 44, 8);
  ctx.fillStyle = "#e5b681";
  ctx.fillRect(x - 22, y - 6, 44, 1);
  ctx.fillStyle = "#926541";
  ctx.fillRect(x - 21, y - 1, 42, 1);
  ctx.fillStyle = "#edd9aa";
  ctx.fillRect(x - 5, y - 5, 7, 2);
  ctx.fillRect(x + 9, y - 8, 3, 4);
  ctx.fillStyle = "#b87041";
  ctx.fillRect(x - 4, y - 6, 5, 2);
}

export default function AdventurerInn({ total, playing }) {
  const canvas = useRef(null),
    seen = useRef(total),
    trip = useRef(null),
    clock = useRef(0);
  const background = useRef(null);
  useEffect(() => {
    const node = canvas.current,
      ctx = node.getContext("2d");
    if (!ctx) return;
    background.current ??= room();
    if (total > seen.current && playing) {
      const id = total - 1;
      trip.current = {
        id,
        path: route(id),
        start: clock.current,
        turnover: id >= seats,
      };
    } else if (!playing || total < seen.current) trip.current = null;
    seen.current = total;
    function draw() {
      ctx.drawImage(background.current, 0, 0);
      const now = clock.current,
        active = trip.current;
      let openness = 0,
        actor = null,
        outgoing = null;
      if (active) {
        const elapsed = now - active.start;
        // When all stools are occupied, the previous guest leaves via the same aisle.
        const leave = active.turnover ? 2.2 : 0;
        if (elapsed < leave) {
          const p = position(active.path, 1 - smooth(clamp(elapsed / 1.95)));
          outgoing = {
            id: active.id - seats,
            ...p,
            step: elapsed * 13,
            sitting: false,
          };
          openness = smooth(clamp((elapsed - 1.45) / 0.4));
        } else {
          const t = elapsed - leave,
            walk = 1.25 + active.path.distance / 115;
          openness =
            active.turnover && t < 0.48
              ? 1
              : t < 0.48
                ? smooth(clamp(t / 0.48))
                : 1 - smooth(clamp((t - 0.72) / 0.65));
          const progress = clamp((t - 0.4) / walk);
          const p = position(active.path, smooth(progress));
          const settle = smooth(clamp((t - 0.4 - walk) / 0.36));
          actor = {
            id: active.id,
            ...p,
            y: p.y + settle * 2,
            step: progress < 1 ? t * 12 : 0,
            sitting: false,
            reach: 1 - smooth(clamp(t / 0.65)),
          };
          if (settle === 1) {
            trip.current = null;
            actor = null;
          }
        }
      }
      const leaf = Math.round(22 * (1 - openness));
      const drawDoor = () => {
        ctx.fillStyle = "#795039";
        ctx.fillRect(16, 15, leaf, 36);
        ctx.fillStyle = "#ad7950";
        for (let x = 1; x < leaf; x += 5) ctx.fillRect(16 + x, 16, 1, 34);
        if (leaf > 3) {
          ctx.fillStyle = "#f1c677";
          ctx.fillRect(13 + leaf, 32, 2, 2);
        }
      };
      if (actor && actor.reach > 0.8) {
        guest(ctx, actor.id, actor.x, actor.y, 0, false, 1);
        actor = null;
      }
      drawDoor();
      guest(ctx, 9, 282, 45, 0, true, (1 + Math.sin(now * 2)) * 0.5);
      ctx.fillStyle = "#cc9b69";
      ctx.fillRect(249, 37, 67, 5);
      const objects = [];
      for (let id = 0; id < seats; id++) {
        const s = seat(id);
        ctx.fillStyle = "#694a38";
        ctx.fillRect(s.x - 5, s.y - 2, 10, 4);
      }
      for (const y of tableY)
        for (const x of tableX)
          objects.push({ y, paint: () => table(ctx, x, y) });
      for (let id = Math.max(0, total - seats); id < total; id++) {
        if (trip.current?.id === id) continue;
        const s = seat(id);
        objects.push({
          y: s.y,
          paint: () =>
            guest(
              ctx,
              id,
              s.x,
              s.y,
              0,
              true,
              (1 + Math.sin(now * 1.4 + id)) * 0.5,
            ),
        });
      }
      for (const a of [actor, outgoing])
        if (a)
          objects.push({
            y: a.y,
            paint: () => guest(ctx, a.id, a.x, a.y, a.step, a.sitting, a.reach),
          });
      objects.sort((a, b) => a.y - b.y).forEach((item) => item.paint());
      if (total >= 3) {
        const x = Math.round(125 + 12 * Math.sin(now * 0.7)),
          y = 92 + Math.round(Math.sin(now * 3) * 0.7);
        ctx.fillStyle = "#363540";
        ctx.fillRect(x, y, 7, 4);
        ctx.fillRect(x + 4, y - 3, 4, 4);
        ctx.fillStyle = "#e6b458";
        ctx.fillRect(x + 7, y - 1, 3, 2);
        ctx.fillRect(x + 1, y + 4, 2, 1);
        ctx.fillStyle = "#9ed4d9";
        ctx.fillRect(x + 6, y - 2, 1, 1);
      }
    }
    draw();
    if (!playing) return;
    let frame = 0,
      last = null,
      visible = false;
    function tick(ts) {
      clock.current += last === null ? 0 : Math.min((ts - last) / 1000, 0.08);
      last = ts;
      draw();
      frame = requestAnimationFrame(tick);
    }
    function resume() {
      cancelAnimationFrame(frame);
      last = null;
      if (visible && !document.hidden) frame = requestAnimationFrame(tick);
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", resume);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
      cancelAnimationFrame(frame);
    };
  }, [total, playing]);
  return (
    <canvas ref={canvas} width={width} height={height} aria-hidden="true" />
  );
}
