// Draw at sprite resolution. The display scales the finished frame with nearest-neighbour pixels.
export const tankWidth = 264;
export const tankHeight = 117;

function polygon(ctx, color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

function rect(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), width, height);
}

function line(ctx, color, x, y, endX, endY) {
  const steps = Math.max(Math.abs(endX - x), Math.abs(endY - y), 1);
  for (let i = 0; i <= steps; i++) {
    rect(ctx, color, x + (endX - x) * i / steps, y + (endY - y) * i / steps, 1, 1);
  }
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function rock(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  polygon(ctx, "#305362", [[-11,0],[-9,-6],[-4,-13],[2,-15],[7,-11],[11,-2],[8,1]]);
  polygon(ctx, "#729592", [[-11,0],[-9,-6],[-4,-13],[2,-15],[1,-11],[-4,-7],[-6,0]]);
  polygon(ctx, "#9ebbb0", [[-5,-12],[2,-15],[7,-11],[2,-11],[-1,-9]]);
  polygon(ctx, "#507479", [[-5,0],[-4,-6],[0,-10],[3,-9],[2,-1]]);
  ctx.restore();
}

function kelp(ctx, x, y, height, phase, dark = false) {
  let lastX = x;
  for (let i = 0; i < height; i += 2) {
    const stem = x + Math.round(Math.sin(i / 5 + phase) * (1 + i / 12));
    line(ctx, dark ? "#29565a" : "#467c63", lastX, y - i + 2, stem, y - i);
    if (i % 6 === 0) {
      const side = i % 12 === 0 ? 1 : -1;
      rect(ctx, dark ? "#347073" : "#68a880", stem + (side < 0 ? -3 : 0), y - i - 1, 4, 2);
      rect(ctx, dark ? "#408785" : "#a3ca95", stem + side * 3, y - i - 2, 2, 1);
    }
    lastX = stem;
  }
}

export function makeSeabed() {
  const layer = document.createElement("canvas");
  layer.width = tankWidth;
  layer.height = tankHeight;
  const ctx = layer.getContext("2d");
  const rand = randomSource(902);
  // The glass front, visible water surface and right face share one projection.
  polygon(ctx, "#152e3a", [[10,101],[48,83],[249,84],[251,95],[215,115],[25,115]]);
  polygon(ctx, "#314959", [[19,95],[205,95],[244,80],[244,89],[205,108],[19,108]]);
  rect(ctx, "#608080", 19, 100, 186, 4);
  rect(ctx, "#9ab9a6", 20, 100, 185, 1);
  rect(ctx, "#263e4d", 23, 108, 13, 3);
  rect(ctx, "#263e4d", 189, 108, 13, 3);
  polygon(ctx, "#497071", [[205,100],[244,82],[244,87],[205,105]]);
  polygon(ctx, "#6eaaa7", [[19,21],[57,5],[244,5],[205,21]]);
  polygon(ctx, "#306672", [[205,21],[244,5],[244,82],[205,100]]);
  polygon(ctx, "#2a7985", [[205,30],[242,14],[242,76],[205,94]]);
  polygon(ctx, "#589b9b", [[206,29],[242,13],[241,16],[206,32]]);
  const water = ctx.createLinearGradient(0, 24, 0, 94);
  water.addColorStop(0, "#66babb");
  water.addColorStop(0.38, "#439fa7");
  water.addColorStop(1, "#22677b");
  rect(ctx, water, 20, 23, 185, 76);
  polygon(ctx, "#84cfca", [[21,29],[58,13],[241,13],[204,29]]);
  polygon(ctx, "#9addcd", [[24,28],[56,14],[66,14],[36,28]]);
  polygon(ctx, "#98d8ca", [[97,28],[131,14],[150,14],[117,28]]);
  polygon(ctx, "#b4e2cd", [[136,28],[146,24],[164,24],[154,28]]);
  polygon(ctx, "#ffffff12", [[40,30],[61,30],[37,72],[22,79]]);
  polygon(ctx, "#ffffff10", [[76,30],[86,30],[54,80],[49,80]]);
  polygon(ctx, "#ffffff0c", [[157,30],[180,30],[149,83],[133,83]]);
  for (let i = 0; i < 24; i++) {
    const y = 15 + Math.floor(rand() * 12);
    const x = 58 - (y - 15) * 2.1 + rand() * 164;
    rect(ctx, i % 3 ? "#c4e6d2" : "#69b7b5", x, y, 2 + Math.floor(rand() * 9), 1);
  }
  // Submerged rocks, an old doorway and a low bed of sand.
  polygon(ctx, "#498a89", [[20,81],[38,72],[60,73],[76,79],[106,75],[129,80],[155,72],[180,78],[193,70],[204,70],[204,98],[20,98]]);
  polygon(ctx, "#70a597", [[20,92],[56,79],[87,84],[117,80],[151,84],[176,78],[205,81],[205,99],[20,99]]);
  polygon(ctx, "#a4b79d", [[20,93],[53,84],[79,90],[122,83],[157,90],[183,83],[205,86],[205,99],[20,99]]);
  polygon(ctx, "#c4c7a0", [[20,95],[43,92],[71,94],[109,88],[149,93],[181,88],[205,90],[205,99],[20,99]]);
  polygon(ctx, "#71968c", [[205,86],[241,71],[241,80],[205,98]]);
  for (let i = 0; i < 100; i++) {
    rect(ctx, ["#d7d2a8","#90a58d","#aab699"][i % 3], 22 + rand() * 179, 93 + rand() * 5, 1 + Math.floor(rand() * 3), 1);
  }
  kelp(ctx, 28, 89, 28, 2, true);
  kelp(ctx, 36, 92, 26, 1);
  rock(ctx, 54, 90, 1.55);
  rock(ctx, 69, 93, 0.8);
  kelp(ctx, 44, 94, 21, 0);
  kelp(ctx, 51, 94, 13, 1);
  kelp(ctx, 92, 88, 14, 1, true);
  // Warm stones make the arch legible against the cool water.
  for (const x of [152, 170]) {
    rect(ctx, "#547879", x, 69, 6, 17);
    rect(ctx, "#aac0a2", x, 70, 3, 15);
    rect(ctx, "#738e81", x - 1, 74, 7, 1);
    rect(ctx, "#738e81", x - 1, 80, 7, 1);
    rect(ctx, "#b8c6a7", x - 2, 84, 9, 2);
  }
  polygon(ctx, "#79988b", [[150,70],[150,67],[157,61],[173,61],[178,65],[178,70]]);
  polygon(ctx, "#c5cba6", [[150,68],[157,61],[173,61],[168,65],[156,65],[154,68]]);
  kelp(ctx, 181, 89, 28, 4, true);
  rock(ctx, 188, 90, 1);
  kelp(ctx, 196, 92, 22, 3);
  rock(ctx, 115, 96, 0.35);
  for (const [x,y,side] of [[78,94,1],[83,93,-1],[151,91,-1]]) {
    rect(ctx, "#a87568", x, y - 2, 2, 3);
    rect(ctx, "#dcaa87", x + side * 2, y - 3, 2, 3);
  }
  line(ctx, "#b8e6d9", 19, 21, 57, 5);
  line(ctx, "#a3d6ce", 57, 5, 244, 5);
  line(ctx, "#b8e6d9", 205, 21, 244, 5);
  line(ctx, "#b8e6d9", 19, 21, 205, 21);
  line(ctx, "#91c4bc", 19, 22, 19, 98);
  line(ctx, "#8fc5bd", 205, 22, 205, 98);
  line(ctx, "#729ea0", 244, 6, 244, 81);
  line(ctx, "#aedde0", 21, 29, 203, 29);
  rect(ctx, "#cdece0", 22, 33, 1, 11);
  rect(ctx, "#d5f0da", 197, 22, 7, 1);
  line(ctx, "#d5efdb", 205, 20, 210, 18);
  return layer;
}

const fishPalettes = [
  ["#ef925e", "#ffe2a2", "#bc6251"], ["#9fc9ff", "#f0f3df", "#477da2"],
  ["#dcc6f7", "#fff2de", "#94699e"], ["#edbd53", "#fff3a7", "#b38349"],
  ["#6dd3ad", "#e8f3b4", "#4b9a8c"],
];

export function makeSchool(count, month) {
  const rand = randomSource(Number(month.replace("-", "")) || 1);
  return Array.from({ length: count }, (_, index) => ({
    phase: rand() * Math.PI * 2,
    height: 41 + rand() * 33,
    center: 94 + rand() * 37,
    radius: 36 + rand() * 32,
    speed: 0.095 + rand() * 0.11,
    size: index % 3 === 1 ? 0.8 : 1,
    colors: fishPalettes[Math.floor(rand() * fishPalettes.length)],
  }));
}

export function paintTank(ctx, seabed, school, time) {
  ctx.clearRect(0, 0, tankWidth, tankHeight);
  ctx.drawImage(seabed, 0, 0);
  for (const fish of school) {
    const phase = fish.phase + time * fish.speed;
    const x = fish.center + fish.radius * Math.sin(phase);
    const y = fish.height + Math.sin(phase * 1.8 + fish.phase) * 4;
    const cos = Math.cos(phase);
    const [body, light, dark] = fish.colors;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale((cos >= 0 ? 1 : -1) * fish.size * (0.6 + 0.4 * Math.abs(cos)), fish.size);
    const tail = Math.sin(time * 7 + fish.phase) > 0 ? 1 : 0;
    rect(ctx, dark, -8 + tail, -2, 2, 5);
    rect(ctx, light, -6 + tail, -1, 2, 3);
    rect(ctx, dark, -3, -2, 7, 5);
    rect(ctx, body, -4, -1, 10, 3);
    rect(ctx, body, -2, -3, 5, 2);
    rect(ctx, light, -2, -2, 2, 4);
    rect(ctx, light, 2, 1, 3, 1);
    rect(ctx, "#153846", 4, -1, 1, 1);
    ctx.restore();
  }
  for (let i = 0; i < 9; i++) {
    const rise = (time * (4 + i % 4) + i * 19) % 56;
    const x = [35, 80, 187][i % 3] + Math.sin(rise / 9 + i) * 2 + (i % 2) * 2;
    const y = 88 - rise;
    rect(ctx, "#d2ebdb", x, y, i % 3 === 1 ? 2 : 1, 1);
    if (i % 3 === 1) rect(ctx, "#95d2c8", x - 1, y + 1, 1, 1);
  }
}
