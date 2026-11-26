import { fishCatalog, fishById } from "../shared/fish-catalog.js";
// The glass, scenery and swimming paths share a perspective camera.
export const tankWidth = 448;
export const tankHeight = 182;
const surface = 94;
const tau = Math.PI * 2;
const clamp = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => clamp(t) ** 2 * (3 - 2 * clamp(t));
const mix = (a, b, t) => a + (b - a) * t;

function noise(seed) {
  let n = seed >>> 0;
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export const tankHalfLength = 230;
const layoutSpacing = tankHalfLength / 146;
const driftwoodOffset = -54;
const focalDistance = 900;

function viewPoint(camera, x, y, z) {
  const horizontal = camera.sy * x + camera.cy * z;
  const elevation = y - 62;
  const depth = camera.cp * horizontal + camera.sp * elevation;
  const perspective = focalDistance / (focalDistance - depth);
  return [
    (camera.cy * x - camera.sy * z) * perspective,
    (camera.sp * horizontal - camera.cp * elevation) * perspective,
    depth * perspective,
  ];
}

export function tankCamera(yaw = -0.53, pitch = 0.23, width = tankWidth, height = tankHeight,
  { zoom = 1, offsetX = 0, offsetY = 0 } = {}) {
  pitch = Math.max(0.015, Math.min(1.48, pitch));
  yaw %= tau;
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const camera = { yaw, pitch, cy, sy, cp, sp };
  // Fit the bounding box, including headroom for new fish, at each orbit angle.
  const corners = [];
  for (const x of [-tankHalfLength, tankHalfLength])
    for (const z of [-42, 42])
      for (const y of [-4, 135]) corners.push(viewPoint(camera, x, y, z));
  const xs = corners.map((p) => p[0]),
    ys = corners.map((p) => p[1]);
  const left = Math.min(...xs),
    right = Math.max(...xs);
  const top = Math.min(...ys),
    bottom = Math.max(...ys);
  const scale = zoom * Math.min(
    (width * (1 - 16 / tankWidth)) / (right - left),
    (height * (1 - 10 / tankHeight)) / (bottom - top),
  );
  return {
    ...camera,
    width,
    height,
    strokeWidth: Math.max(1, 0.85 * width / tankWidth),
    zoom, offsetX, offsetY, scale,
    centerX: (left + right) / 2 - offsetX * width / scale,
    centerY: (top + bottom) / 2 - offsetY * height / scale,
  };
}

export function zoomTank(camera, factor, focusX = 0.5, focusY = 0.5) {
  const zoom = Math.min(3, Math.max(0.7, camera.zoom * factor));
  if (zoom === camera.zoom) return camera;
  // Keep the point under the cursor still when inspecting a detail. Centre the full-tank overview.
  const ratio = Math.max(1, zoom) / Math.max(1, camera.zoom);
  const offsetX = camera.offsetX * ratio + (clamp(focusX) - 0.5) * (1 - ratio);
  const offsetY = camera.offsetY * ratio + (clamp(focusY) - 0.5) * (1 - ratio);
  const limit = Math.max(0, (zoom - 1) / 2);
  const withinTank = offset => Math.max(-limit, Math.min(limit, offset));
  return tankCamera(camera.yaw, camera.pitch, camera.width, camera.height,
    { zoom, offsetX: withinTank(offsetX), offsetY: withinTank(offsetY) });
}

export function project(camera, [x, y, z]) {
  const [vx, vy, depth] = viewPoint(camera, x, y, z);
  return [
    (camera.width ?? tankWidth) / 2 + camera.scale * (vx - camera.centerX),
    (camera.height ?? tankHeight) / 2 + camera.scale * (vy - camera.centerY),
    depth,
  ];
}

function surfaceBuffer(width = tankWidth, height = tankHeight) {
  const image = new ImageData(width, height);
  const pixels = new Uint32Array(image.data.buffer);
  const depth = new Float32Array(pixels.length);
  depth.fill(-Infinity);
  return { image, pixels, depth };
}

function color(rgb, light = 1) {
  const channel = (v) => Math.min(255, Math.round((v & 255) * light));
  return (
    (0xff000000 |
      (channel(rgb) << 16) |
      (channel(rgb >> 8) << 8) |
      channel(rgb >> 16)) >>>
    0
  );
}

// A small depth buffer lets a fish pass behind the wood, or through the foreground.
function triangle(buf, a, b, c, ink) {
  if (a[1] > b[1]) [a, b] = [b, a];
  if (b[1] > c[1]) [b, c] = [c, b];
  if (a[1] > b[1]) [a, b] = [b, a];
  const ax = b[0] - a[0], ay = b[1] - a[1];
  const bx = c[0] - a[0], by = c[1] - a[1];
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 0.01) return;
  const az = b[2] - a[2], bz = c[2] - a[2];
  const dzdx = (az * by - bz * ay) / det, dzdy = (ax * bz - bx * az) / det;
  const longSlope = bx / by, upperSlope = ay ? ax / ay : 0;
  const lowerSlope = c[1] === b[1] ? 0 : (c[0] - b[0]) / (c[1] - b[1]);
  const { width, height } = buf.image;
  const lastRow = Math.min(height - 1, Math.floor(c[1]));
  // Only visit the covered span of each row. Thin, slanting panes otherwise scan most of the tank.
  for (let y = Math.max(0, Math.ceil(a[1])); y <= lastRow; y++) {
    const row = y - a[1];
    const x1 = a[0] + row * longSlope;
    const x2 = ay && y <= b[1] ? a[0] + row * upperSlope : b[0] + (y - b[1]) * lowerSlope;
    const left = Math.max(0, Math.ceil(Math.min(x1, x2)));
    const right = Math.min(width - 1, Math.floor(Math.max(x1, x2)));
    let z = a[2] + (left - a[0]) * dzdx + row * dzdy;
    const end = y * width + right;
    for (let index = y * width + left; index <= end; index++, z += dzdx) {
      if (z >= buf.depth[index]) {
        buf.depth[index] = z;
        buf.pixels[index] = ink;
      }
    }
  }
}

function rasterFace(buf, vertices, ink) {
  const points = vertices.map((p) => project(buf.camera, p));
  for (let i = 2; i < points.length; i++)
    triangle(buf, points[0], points[i - 1], points[i], ink);
}

function rasterLine(buf, from, to, ink, depthBias = 0.3) {
  const a = project(buf.camera, from),
    b = project(buf.camera, to);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const steep = Math.abs(dy) > Math.abs(dx);
  const major = steep ? 1 : 0, minor = 1 - major;
  const span = b[major] - a[major];
  // Measure thickness perpendicular to the stroke so a sloping rim stays as visible as a vertical one.
  const halfSpan = 0.5 * buf.camera.strokeWidth * (span ? Math.hypot(dx, dy) / Math.abs(span) : 1);
  const { width, height } = buf.image;
  const first = Math.max(0, Math.round(Math.min(a[major], b[major])));
  const last = Math.min((steep ? height : width) - 1, Math.round(Math.max(a[major], b[major])));
  for (let i = first; i <= last; i++) {
    const t = span ? clamp((i - a[major]) / span) : 0;
    const center = mix(a[minor], b[minor], t);
    const z = mix(a[2], b[2], t) + depthBias;
    const end = Math.min((steep ? width : height) - 1, Math.floor(center + halfSpan));
    for (let j = Math.max(0, Math.ceil(center - halfSpan)); j <= end; j++) {
      const index = steep ? i * width + j : j * width + i;
      if (z >= buf.depth[index]) {
        buf.depth[index] = z;
        buf.pixels[index] = ink;
      }
    }
  }
}

function face(buf, rgb, vertices, light = 1) {
  const ink = color(rgb, light);
  if (buf.geometry) buf.geometry.push({ vertices, ink });
  else rasterFace(buf, vertices, ink);
}

function line(buf, rgb, from, to, depthBias = 0.3) {
  const ink = color(rgb);
  if (buf.geometry) buf.geometry.push({ vertices: [from, to], ink, depthBias });
  else rasterLine(buf, from, to, ink, depthBias);
}

function rock(buf, x, y, z, size, h, rgb, rng) {
  const base = [],
    rim = [];
  for (let i = 0; i < 7; i++) {
    const a = (i * tau) / 7,
      r = size * (0.77 + rng() * 0.25);
    base.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r * 0.78]);
    rim.push([
      x + Math.cos(a) * r * 0.73 - 1,
      y + h * (0.69 + rng() * 0.29),
      z + Math.sin(a) * r * 0.57,
    ]);
  }
  for (let i = 0; i < 7; i++) {
    const j = (i + 1) % 7;
    face(
      buf,
      rgb,
      [base[i], base[j], rim[j], rim[i]],
      0.53 + 0.3 * (1 - Math.cos((i * tau) / 7)),
    );
    face(buf, rgb, [rim[i], rim[j], [x - 1, y + h, z]], 1.12 + rng() * 0.21);
  }
}

function branch(buf, a, b, r1, r2) {
  const ring = (p, r, i) => [
    p[0] + Math.cos((i * tau) / 6) * r,
    p[1] - Math.cos((i * tau) / 6) * r * 0.22,
    p[2] + Math.sin((i * tau) / 6) * r,
  ];
  for (let i = 0; i < 6; i++)
    face(buf, [0x8a5838, 0x66432e, 0x503324, 0x34241e, 0x574033, 0x936343][i], [
      ring(a, r1, i),
      ring(a, r1, i + 1),
      ring(b, r2, i + 1),
      ring(b, r2, i),
    ]);
}

// Folded lance-shaped leaves have a bright upper plane and a darker underside.
function rosette(buf, x, y, z, size, rng, palette) {
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4 + rng() * 0.5,
      length = size * (0.52 + 0.58 * rng()),
      c = Math.cos(a),
      s = Math.sin(a);
    const root = [x, y, z],
      tip = [
        x + c * length * 0.82,
        y + length * (0.62 + 0.38 * rng()),
        z + s * length * 0.82,
      ];
    const mid = [
        x + c * length * 0.39,
        y + length * 0.7,
        z + s * length * 0.39,
      ],
      w = length * 0.19;
    const left = [mid[0] - s * w, mid[1] - 2, mid[2] + c * w],
      right = [mid[0] + s * w, mid[1] - 2, mid[2] - c * w];
    face(buf, palette[0], [root, left, mid]);
    face(buf, palette[1], [mid, left, tip]);
    face(buf, palette[2], [root, mid, right]);
    face(buf, palette[0], [mid, tip, right]);
    if (length > 11) line(buf, palette[3], mid, tip);
  }
}

// Rows of paired leaves form soft silhouettes behind the angular foreground plants.
const greenStem = [0x355a47, 0x2c564b, 0x4c7359, 0x759169];
const copperStem = [0x634d42, 0x794f44, 0xa96550, 0xca8965];

function stemPlant(buf, x, z, height, rng, palette = greenStem) {
  const lean = (rng() - 0.5) * 14;
  const nodes = Math.round(height / 5);
  const point = (t) => [
    x + lean * t * t + Math.sin(t * 4) * 2,
    2 + height * t,
    z + t * 3,
  ];
  for (let i = 1; i <= nodes; i++) {
    const t = i / nodes,
      base = point(t);
    line(buf, palette[0], point((i - 1) / nodes), base);
    for (const side of [-1, 1]) {
      const w = side * (3 + 4 * Math.sin(Math.PI * t)) * (0.8 + 0.3 * rng());
      const [px, py, pz] = base;
      const tip = [px + w, py + 3.5, pz + side * 1.2];
      const fold = [px + w * 0.55, py + 2, pz + 1];
      face(buf, palette[1], [base, [px + w * 0.36, py + 4, pz], tip, fold]);
      face(buf, t > 0.7 ? palette[3] : palette[2], [
        base,
        fold,
        tip,
        [px + w * 0.6, py + 0.2, pz],
      ]);
    }
  }
}

function ribbonGrass(buf, x, z, height, rng) {
  for (let blade = 0; blade < 6; blade++) {
    const bend = (rng() - 0.5) * 22,
      sweep = rng() * tau;
    const h = height * (0.55 + 0.45 * rng());
    const bladeWidth = 1 + rng() * 1.25,
      start = x + (rng() - 0.5) * 7;
    const edge = (t, side) => [
      start +
        bend * t +
        Math.sin(t * 5 + sweep) * 4 * t +
        side * bladeWidth * (1 - t),
      2 + h * t,
      z + Math.sin(sweep) * 6 * t + side * 0.8 * (1 - t),
    ];
    for (let j = 0; j < 5; j++) {
      const a = j / 5,
        b = (j + 1) / 5;
      face(buf, blade % 2 ? 0x285947 : 0x33624f, [
        edge(a, -1),
        edge(a, 1),
        edge(b, 1),
        edge(b, -1),
      ]);
      line(buf, blade % 2 ? 0x406d57 : 0x4c8165, edge(a, 1), edge(b, 1));
    }
  }
}

// Broad, folded leaves on short stalks give the lower banks a different silhouette.
function anubias(buf, x, y, z, size, rng) {
  const turn = rng() * tau;
  for (let leaf = 0; leaf < 6; leaf++) {
    const angle = turn + leaf * 2.4, dx = Math.cos(angle), dz = Math.sin(angle);
    const length = size * (0.6 + rng() * 0.45);
    const leafPoint = (along, up, across = 0) => [
      x + length * (along * dx - across * dz),
      y + length * up,
      z + length * (along * dz + across * dx),
    ];
    const base = leafPoint(0.26, 0.49), ridge = leafPoint(0.61, 0.81), tip = leafPoint(0.98, 0.7);
    line(buf, 0x476447, [x, y, z], base);
    for (const side of [-1, 1]) {
      const shoulder = leafPoint(0.43, 0.58, side * 0.2);
      const edge = leafPoint(0.72, 0.67, side * 0.22);
      face(buf, side < 0 ? 0x3d7960 : 0x295a4b, [base, shoulder, ridge]);
      face(buf, side < 0 ? 0x60976a : 0x447953, [shoulder, edge, tip, ridge]);
    }
  }
}

// Joined wedge stones form an open tunnel, with a front, back and shaded underside.
function mossyArch(buf, x, z, rng) {
  const angle = -0.46, c = Math.cos(angle), s = Math.sin(angle);
  const place = (u, h, depth) => [x + c * u + s * depth, h, z - s * u + c * depth];
  for (const side of [-1, 1]) {
    const [px, , pz] = place(side * 25, 1, 0);
    rock(buf, px, 1, pz, 11, 10, 0x646a61, rng);
  }
  const stoneCount = 9;
  const rim = Array.from({length: stoneCount + 1}, (_, i) => {
    const a = Math.PI * i / stoneCount;
    const radius = 30 + rng() * 2;
    return { inner: [20 * Math.cos(a), 8 + 20 * Math.sin(a)],
      outer: [radius * Math.cos(a), 8 + (radius - 1) * Math.sin(a)] };
  });
  const stones = [0x879084, 0x747d75, 0x82877a, 0x949789];
  const moss = [0x536e40, 0x809753, 0x3a553b, 0xa4ad68];
  for (let i = 0; i < stoneCount; i++) {
    const a = rim[i], b = rim[i + 1], front = 6 + rng() * 1.5, back = -7 - rng() * 2;
    const stone = stones[i % stones.length];
    const outline = [a.inner, a.outer, b.outer, b.inner];
    face(buf, stone, outline.map(([u,h]) => place(u,h,back)), 0.71);
    face(buf, stone, outline.map(([u,h]) => place(u,h,front)), 0.92);
    face(buf, stone, [place(...a.outer,back), place(...b.outer,back), place(...b.outer,front), place(...a.outer,front)], 1.14);
    face(buf, stone, [place(...a.inner,back), place(...b.inner,back), place(...b.inner,front), place(...a.inner,front)], 0.49);
    for (const end of [a,b])
      face(buf, stone, [place(...end.inner,front), place(...end.outer,front), place(...end.outer,back), place(...end.inner,back)], 0.78);
    line(buf, 0x556057, place(...a.inner,front), place(...a.outer,front));
    if (i > 0 && i < 6) {
      const [mx, my, mz] = place((a.outer[0] + b.outer[0]) / 2, (a.outer[1] + b.outer[1]) / 2, 2);
      rock(buf, mx, my - 1.8, mz, 4 + rng() * 2, 2.6, 0x6c804c, rng);
      if (i % 2) rosette(buf, mx, my, mz, 4 + rng() * 2, rng, moss);
    }
    if (i === 2 || i === 6) {
      // Moss wraps over the lip in two patches, leaving the centre keystone visible.
      const u = (a.outer[0] + b.outer[0]) / 2, top = (a.outer[1] + b.outer[1]) / 2;
      for (let tuft = -2; tuft <= 2; tuft++) {
        const start = place(u + tuft * 1.6, top + 1 - Math.abs(tuft) * 0.7, front - 0.5);
        const fold = place(u + tuft * 1.7, start[1] - 2, front + 0.8);
        const tip = place(u + tuft * 1.8 - 0.8, fold[1] - (tuft % 2 ? 3 : 5), front + 1);
        face(buf, tuft % 2 ? 0x78905a : 0x557747, [start, [fold[0] + 1.6, fold[1], fold[2]], tip, fold]);
      }
    }
  }
  // A small scatter of worn stones leads out of the arch towards the front glass.
  for (let i = 0; i < 23; i++) {
    const t = rng(), depth = -18 + t * 52;
    const [px, , pz] = place(Math.sin(t * 4) * 5 + (rng() - 0.5) * 17, 0, depth);
    rock(buf, px, 1.3, pz, 1.2 + rng() * 2.4, 0.8 + rng() * 1.5, i % 3 ? 0x555b54 : 0x76796a, rng);
  }
}

export function makeSeabed() {
  const buf = { geometry: [] },
    rng = noise(845234);
  const plane = (y) => [
    [-tankHalfLength, y, -42],
    [tankHalfLength, y, -42],
    [tankHalfLength, y, 42],
    [-tankHalfLength, y, 42],
  ];
  const base = plane(-4),
    bed = plane(1);
  face(buf, 0x0c1014, base);
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    face(buf, i % 2 ? 0x151a1d : 0x101316, [
      base[i],
      base[next],
      bed[next],
      bed[i],
    ]);
  }
  face(buf, 0x090b0c, bed);
  // Charcoal grains are sparse enough that the substrate reads as black.
  for (let i = 0; i < 1500; i++) {
    const x = (rng() - 0.5) * (2 * tankHalfLength - 4),
      z = (rng() - 0.5) * 82;
    const rgb = [0x101214, 0x181b1e, 0x070809, 0x141618][i % 4];
    line(buf, rgb, [x, 1.35, z], [x + rng() * 0.7, 1.35, z]);
  }
  for (let i = 0; i < 39; i++) {
    const side = i % 2 ? -1 : 1,
      x = side * (51 + rng() * 78) * layoutSpacing,
      z = (rng() - 0.5) * 60;
    rock(
      buf,
      x,
      1.3,
      z,
      4 + rng() * 14,
      3 + rng() * 10,
      [0x38474a, 0x475552, 0x42454a][i % 3],
      rng,
    );
  }
  const flora = noise(78621);
  for (const [x, z, h] of [
    [-129, -24, 50],
    [-113, -31, 64],
    [-95, -29, 42],
    [88, -32, 43],
    [106, -25, 61],
    [126, -27, 49],
  ]) {
    ribbonGrass(buf, x * layoutSpacing, z, h, flora);
  }
  for (let i = 0; i < 20; i++) {
    const x = i % 3 ? 73 + flora() * 61 : -132 + flora() * 65;
    const z = -36 + flora() * 19;
    stemPlant(buf, x * layoutSpacing, z, 19 + 37 * flora(), flora);
  }
  const limb = (points) => {
    for (const point of points) point[0] += driftwoodOffset;
    for (let i = 1; i < points.length; i++)
      branch(buf, points[i - 1], points[i], points[i - 1][3], points[i][3]);
  };
  limb([
    [-110, 2, 8, 12],
    [-95, 19, 6, 11],
    [-85, 37, 0, 7],
    [-69, 53, -4, 5],
    [-64, 68, -10, 3],
    [-54, 79, -14, 0.6],
  ]);
  limb([
    [-87, 34, 1, 7],
    [-66, 40, 7, 5],
    [-49, 39, 11, 3],
    [-34, 48, 15, 0.5],
  ]);
  limb([
    [-95, 17, 6, 8],
    [-115, 31, 0, 6],
    [-125, 46, -4, 3],
    [-123, 58, -7, 0.8],
  ]);
  limb([
    [-94, 17, 7, 9],
    [-78, 9, 17, 6],
    [-56, 4, 24, 4],
    [-37, 2, 30, 0.9],
  ]);
  const green = [0x397052, 0x63944f, 0x234d44, 0x86ae65],
    olive = [0x697840, 0x8f9a55, 0x445a37, 0xb3b666];
  for (const [x, y, z, h] of [
    [-85, 32, 1, 17],
    [-67, 51, -5, 13],
    [-116, 31, -2, 14],
    [-82, 7, 18, 11],
    [-128, 5, 18, 20],
    [103, 4, -12, 32],
    [122, 7, 2, 22],
    [91, 6, 12, 17],
    [73, 8, 23, 10],
  ])
    rosette(
      buf,
      x < 0 ? x + driftwoodOffset : x * layoutSpacing,
      y,
      z,
      h,
      rng,
      x > 0 ? green : olive,
    );
  for (let i = 0; i < 38; i++) {
    const x = (i % 2 ? -1 : 1) * (45 + rng() * 91),
      z = (rng() - 0.5) * 72;
    rosette(
      buf,
      x * layoutSpacing,
      3,
      z,
      3 + rng() * 6,
      rng,
      i % 3 ? green : olive,
    );
  }
  const planting = noise(25468);
  // Plant in stands, with taller stems near the back and open water between the islands.
  for (const [x, z, height, count, palette] of [
    [-179, -28, 58, 6, greenStem], [-112, -30, 59, 8, copperStem],
    [-57, -29, 34, 5, greenStem], [98, -29, 48, 7, greenStem],
    [164, -27, 62, 7, copperStem], [199, -24, 45, 5, greenStem],
  ]) {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      stemPlant(buf, x + (t - 0.5) * 27, z + (planting() - 0.5) * 10,
        height * (0.48 + 0.4 * Math.sin(t * Math.PI) + planting() * 0.15), planting, palette);
    }
  }
  for (const [x, z, height] of [[-201, -15, 70], [-73, -32, 57], [75, -31, 46], [188, -21, 72]])
    ribbonGrass(buf, x, z, height, planting);
  mossyArch(buf, 39, -2, planting);
  const carpet = [0x426c44, 0x739b55, 0x31563f, 0x96ad66];
  for (const [x, z, size] of [[-184, 14, 19], [-153, 26, 14], [-88, 10, 20], [-46, 18, 12],
    [8, -8, 12], [72, 11, 17], [113, 16, 21], [175, 18, 17]]) {
    anubias(buf, x, 2, z, size, planting);
    anubias(buf, x + 8, 2, z - 9, size * 0.68, planting);
    for (let i = 0; i < 8; i++) {
      const px = x + (planting() - 0.5) * 33, pz = z + (planting() - 0.5) * 18;
      rosette(buf, px, 2, pz, 3.5 + planting() * 4.5, planting, carpet);
    }
  }
  // The depth buffer keeps the near and far glass edges at their proper depths.
  for (const [h, rgb] of [
    [surface, 0x213436],
    [99, 0x405858],
  ]) {
    const p = plane(h);
    for (let i = 0; i < 4; i++) line(buf, rgb, p[i], p[(i + 1) % 4]);
  }
  for (const [x, z] of [
    [-tankHalfLength, -42],
    [tankHalfLength, -42],
    [-tankHalfLength, 42],
    [tankHalfLength, 42],
  ])
    line(buf, 0x354949, [x, 1, z], [x, 99, z]);
  line(
    buf,
    0x91a79b,
    [1 - tankHalfLength, 99, 42],
    [26 - tankHalfLength, 99, 42],
    0.8,
  );
  line(
    buf,
    0x91a79b,
    [tankHalfLength - 23, 99, -42],
    [tankHalfLength - 1, 99, -42],
    0.8,
  );
  return buf.geometry;
}

export function renderSeabed(frame, geometry, camera, light = 0x8b7cf8) {
  frame.camera = camera;
  frame.pixels.fill(0); // Let the theme's pool of light show through around the glass.
  frame.depth.fill(-Infinity);
  // Tint only the two far panes so that even a rear view stays transparent.
  const wallX = camera.sy >= 0 ? -tankHalfLength : tankHalfLength;
  const wallZ = camera.cy >= 0 ? -42 : 42;
  const bands = 32;
  for (let band = 0; band < bands; band++) {
    const y = (surface * band) / bands,
      top = (surface * (band + 1)) / bands;
    const brightness = 0.09 + (band / bands) * 0.19;
    const water =
      (Math.round((light >> 16) * brightness + 4) << 16) |
      (Math.round(((light >> 8) & 255) * brightness + 9) << 8) |
      Math.round((light & 255) * brightness + 13);
    rasterFace(
      frame,
      [
        [-tankHalfLength, y, wallZ],
        [tankHalfLength, y, wallZ],
        [tankHalfLength, top, wallZ],
        [-tankHalfLength, top, wallZ],
      ],
      (color(water) & 0xffffff) | 0xdb000000,
    );
    rasterFace(
      frame,
      [
        [wallX, y, -42],
        [wallX, y, 42],
        [wallX, top, 42],
        [wallX, top, -42],
      ],
      (color(water, 0.74) & 0xffffff) | 0xe2000000,
    );
  }
  for (const { vertices, ink, depthBias } of geometry) {
    if (vertices.length === 2) rasterLine(frame, vertices[0], vertices[1], ink, depthBias);
    else rasterFace(frame, vertices, ink);
  }
}

export function makeSchool(total, day, capacity = total, species = []) {
  let seed = 13;
  for (const c of day) seed = Math.imul(seed, 31) + c.charCodeAt(0);
  return Array.from({ length: Math.min(total, capacity) }, (_, slot) => {
    const ordinal = slot + capacity * Math.floor((total - 1 - slot) / capacity);
    const rand = noise(seed ^ Math.imul(ordinal + 1, 0x9e3779b1));
    return {
      ordinal,
      species: fishById.get(species[slot]) ?? fishCatalog[ordinal % 4],
      phase: rand() * tau,
      speed: 0.13 + rand() * 0.09,
      range: (70 + rand() * 46) * layoutSpacing,
      y: 25 + rand() * 48,
      z: (rand() - 0.5) * 46,
      scale: 1.02 + rand() * 0.38,
    };
  });
}

const landing = 1.85,
  impact = 0.58;
export function fishPose(f, t, enteredAt) {
  const tier = f.species.tier,
    beat = t * 0.83 + f.phase;
  const surge = tier === 3 ? 0.1 * Math.sin(beat) : 0;
  const a = f.phase + f.speed * t + surge,
    x = f.range * Math.sin(a),
    y = f.y + 2.2 * Math.sin(a * 3) + (tier >= 2 ? 5 * Math.sin(beat) : 0),
    z = f.z + 7 * Math.cos(a),
    heading = Math.atan2(-7 * Math.sin(a), f.range * Math.cos(a));
  if (enteredAt == null || t - enteredAt >= landing)
    return { x, y, z, heading, tilt: tier >= 2 ? 0.13 * Math.cos(beat) : 0 };
  const age = t - enteredAt;
  const entryX = fishPose(f, enteredAt + landing).x;
  if (age < impact)
    return {
      x: entryX,
      y: surface + 35 * (1 - clamp(age / impact) ** 2),
      z,
      heading,
      tilt: -0.53,
    };
  const p = clamp((age - impact) / (landing - impact));
  return {
    x: mix(entryX, x, smooth(p)),
    y: mix(surface, y, 1 - (1 - p) ** 3) - 5 * Math.sin(Math.PI * p),
    z,
    heading,
    tilt: mix(-0.53, tier >= 2 ? 0.13 * Math.cos(beat) : 0, smooth(p)),
  };
}

function drawBody(buf, f, t, { x, y, z, heading, tilt }) {
  const {
    form,
    tier,
    palette: [body, shine, mark, shade],
  } = f.species;
  const wave = t * 3.4 + f.phase,
    pulse = Math.sin(wave);
  const length =
    form === "ribbon" ? 1.4 : form === "slim" || form === "koi" ? 1.16 : 1;
  const cos = Math.cos(heading),
    sin = Math.sin(heading),
    lean = Math.sin(tilt),
    level = Math.cos(tilt);
  const point = ([u, v, w]) => {
    if (form === "ribbon" && u < 0)
      w += Math.sin(wave + u * 0.23) * (-u * 0.19);
    u *= f.scale * length;
    v *= f.scale;
    w *= f.scale;
    const dx = u * level - v * lean;
    return [
      x + cos * dx - sin * w,
      y + u * lean + v * level,
      z + sin * dx + cos * w,
    ];
  };
  const facet = (rgb, ...vertices) => face(buf, rgb, vertices.map(point));
  const stroke = (rgb, a, b) => line(buf, rgb, point(a), point(b));
  if (form === "ray") {
    const nose = [7.4, 0.1, 0],
      crown = [1, 2.5, 0],
      stern = [-6, -0.1, 0],
      belly = [0.4, -1.8, 0];
    const wingspan = tier === 3 ? 10.8 : 8.6;
    for (const side of [-1, 1]) {
      const wing = [-1, 2.7 * Math.sin(wave + side * 0.28), wingspan * side];
      const shoulder = [3.3, 1.3, 3.8 * side],
        hip = [-4, 0.7, 3.2 * side];
      facet(body, nose, shoulder, crown);
      facet(shine, nose, shoulder, wing);
      facet(body, crown, shoulder, wing, hip);
      facet(shade, crown, hip, stern);
      facet(mark, wing, hip, stern);
      facet(shade, nose, belly, wing, stern);
      for (let i = 0; i < 5; i++) {
        const u = (i % 3) * 1.8 - 2,
          w = (2.6 + Math.floor(i / 3) * 2.3) * side;
        const h = 2 - 0.12 * Math.abs(w) + wing[1] * 0.32;
        stroke(shine, [u, h, w], [u + 0.6, h, w + 0.3]);
      }
      stroke(shade, [4.3, 1.65, side * 1.3], [4.95, 1.4, side * 1.5]);
      if (tier === 3)
        stroke(
          shine,
          [0, wing[1] * 0.6 + 1, side * 5],
          [-2.7, wing[1] * 0.7 + 0.9, side * 6.2],
        );
    }
    let tail = stern;
    for (let i = 1; i <= 9; i++) {
      const next = [
        -6 - i * 1.4,
        Math.sin(wave * 0.8 - i * 0.3) * i * 0.17,
        Math.sin(wave - i * 0.4) * i * 0.34,
      ];
      stroke(i < 5 ? mark : shine, tail, next);
      if (i < 4)
        stroke(
          body,
          [tail[0], tail[1] + 0.55, tail[2]],
          [next[0], next[1] + 0.45, next[2]],
        );
      tail = next;
    }
  } else {
    const belly =
        form === "round" || form === "sail"
          ? -4.7
          : form === "ray"
            ? -1.25
            : -2.7,
      top =
        form === "round" ? 5 : form === "sail" ? 6 : form === "ray" ? 1.9 : 3,
      flap = 2 * Math.sin(t * 9 + f.phase);
    for (const side of [-1, 1]) {
      const cheek = [3, 0, 2.1 * side],
        hip = [-3, 0, 1.55 * side],
        head = [7, 0.25, 0],
        root = [-6, 0, 0],
        fin = [-11, 3.8, flap];
      facet(shade, root, fin, [-9, 0, flap]);
      facet(mark, root, [-9, 0, flap], [-11, -3.6, flap]);
      facet(body, head, [1, top, 0], cheek);
      facet(shine, [1, top, 0], [-3, top * 0.75, 0], hip, cheek);
      facet(body, root, hip, [-3, top * 0.75, 0]);
      facet(mark, root, [-1, belly, 0], hip);
      facet(shade, hip, [-1, belly, 0], cheek);
      facet(body, cheek, [-1, belly, 0], head);
      line(
        buf,
        shine,
        point([-4, 0.3, side * 1.6]),
        point([2, 0.6, side * 2.1]),
      );
      if (form === "round" || form === "sail" || form === "koi") {
        for (const u of [-2.8, 0.4]) {
          line(
            buf,
            shade,
            point([u, top * 0.67, side * 1.25]),
            point([u + 0.7, -0.2, side * 2.05]),
          );
        }
      }
      facet(
        shade,
        [1, -0.4, side * 2],
        [-1.5, -1.9 + (tier >= 1 ? Math.sin(wave + side) : 0), side * 3.2],
        [-1, -0.2, side * 2],
      );
      line(
        buf,
        0x161f25,
        point([4, 1, side * 1.85]),
        point([4.5, 1, side * 1.7]),
      );
      if (form === "koi") {
        facet(
          shine,
          [1.5, top * 0.9, side * 0.4],
          [2.5, 1, side * 2],
          [0.8, -0.4, side * 2],
          [-0.5, 1.2, side * 2],
        );
        stroke(
          mark,
          [6, -0.1, side * 0.5],
          [8, -1.7 + pulse * 0.35, side * 1.3],
        );
        if (tier === 3)
          stroke(
            shine,
            [7, -0.1, side * 0.6],
            [9.5, -2 + pulse * 0.7, side * 1.5],
          );
      }
    }
    facet(shade, [-2, top * 0.8, 0], [-3, top + 2, 0], [1, top, 0]);
    if (form === "veil" || form === "sail") {
      const tail = form === "veil";
      const root = tail ? [-5.6, 0, 0] : [1, top - 0.5, 0];
      const rays = tier >= 2 ? 10 : 5;
      let last = null;
      for (let i = 0; i <= rays; i++) {
        const p = i / rays,
          angle = (p - 0.5) * 2.35;
        const spread = 1 + 0.16 * Math.sin(wave * 0.8 + p * 2);
        const scallop = tier >= 2 && i % 2 === 0 ? 1.3 : 1;
        const tip = tail
          ? [
              -6 - 7.5 * Math.cos(angle) * scallop,
              7 * Math.sin(angle) * spread * scallop,
              1.4 * Math.sin(wave + p * 3),
            ]
          : [
              2 - 9 * p,
              top + 6.5 * (1 - p * 0.7) * spread,
              Math.sin(wave + p * 3),
            ];
        if (last) facet(i % 2 ? mark : body, root, last, tip);
        if (tier >= 2 && i % 2 === 0) line(buf, shine, point(root), point(tip));
        last = tip;
      }
    }
    if (form === "ribbon") {
      for (let i = -8; i < 4; i += 2) {
        const crest = (u) => [
          u - 1.3,
          3 + (2.9 + 1.7 * Math.sin(wave + u * 0.38)),
          0.4 * Math.sin(wave + u * 0.32),
        ];
        facet(i % 4 ? mark : shine, [i, 2, 0], crest(i), crest(i + 2), [
          i + 2,
          2,
          0,
        ]);
      }
    }
    if (tier >= 2) {
      for (const side of [-1, 1])
        for (let i = 0; i < 5; i++) {
          const u = -3 + i * 1.25;
          line(
            buf,
            i % 2 ? mark : shine,
            point([u, 1 + (i % 2) * 0.5, side * 1.9]),
            point([u + 0.4, 1.5, side * 1.9]),
          );
        }
    }
    if (tier === 3) {
      for (const side of [-1, 1]) {
        let last = [-5, 0, side];
        for (let i = 1; i <= 6; i++) {
          const next = [
            -5 - i * 1.85,
            side * (1 + i * 0.42) + Math.sin(wave - i * 0.5) * i * 0.44,
            side * 1.6,
          ];
          line(buf, i % 2 ? shine : mark, point(last), point(next));
          last = next;
        }
      }
    }
  }
  if (tier === 3) {
    for (let i = 0; i < 4; i++) {
      const drift = (t * 0.65 + i * 0.25 + f.phase) % 1;
      const u = -10 - 10 * drift,
        v = 2.8 * Math.sin(wave * 0.4 + i * 2.3);
      line(
        buf,
        drift < 0.5 ? shine : mark,
        point([u, v, 0]),
        point([u + 0.45, v + 0.35, 0]),
      );
    }
  }
}

// Catalogue illustrations and swimming fish use exactly the same model and fin motion.
export function paintFishPortrait(frame, species, seconds) {
  const width = frame.image.width,
    height = frame.image.height;
  const elevation = species.form === "ray" ? 0.92 : 0.18;
  frame.camera = {
    cy: 1,
    sy: 0,
    cp: Math.cos(elevation),
    sp: Math.sin(elevation),
    centerX: -2,
    centerY: 0,
    width,
    height,
    strokeWidth: Math.max(1, width / 152),
    scale: Math.min(width / 36, height / 21),
  };
  frame.pixels.fill(0);
  frame.depth.fill(-Infinity);
  drawBody(frame, { species, scale: 1, phase: 0 }, seconds, {
    x: 0,
    y: 62 + Math.sin(seconds * 1.4) * 0.55,
    z: 0,
    heading: 0.23 * Math.sin(seconds * 0.7 + 0.5),
    tilt: species.tier >= 2 ? 0.1 * Math.cos(seconds * 1.3) : 0,
  });
}

function drawFish(buf, f, t, enteredAt) {
  if (enteredAt != null && t < enteredAt) return;
  const pose = fishPose(f, t, enteredAt);
  drawBody(buf, f, t, pose);
  const { z } = pose;
  const age = t - enteredAt - impact;
  if (enteredAt != null && age >= 0 && age < 0.92) {
    const radius = 1 + 15 * age;
    const cx = fishPose(f, enteredAt + landing).x;
    for (let i = 0; i < 18; i++) {
      const a = (tau * i) / 18,
        b = (tau * (i + 1)) / 18;
      if (age < 0.55 || i % 3)
        line(
          buf,
          age < 0.36 ? 0xb4f6e4 : 0x508e8f,
          [cx + radius * Math.cos(a), surface, z + radius * Math.sin(a)],
          [cx + radius * Math.cos(b), surface, z + radius * Math.sin(b)],
        );
    }
    for (let i = 0; i < 6; i++) {
      const a = (i * tau) / 6,
        bx = cx + Math.cos(a) * age * 17,
        bz = z + Math.sin(a) * age * 17;
      const by = surface + Math.sin((Math.PI * age) / 0.92) * (5 + (i % 3));
      line(buf, 0xc9eee3, [bx, by, bz], [bx + 0.5, by + 1, bz]);
    }
  }
  // Tiny bubbles peel away from the fish on its first dive and rise to the surface.
  if (enteredAt != null && age >= 0 && age < 1.6) {
    for (let i = 0; i < 4; i++) {
      const released = 0.13 + i * 0.14,
        drift = age - released;
      if (drift < 0) continue;
      const origin = fishPose(f, enteredAt + impact + released, enteredAt);
      const by = origin.y + 2 + drift * 32;
      if (by >= surface) continue;
      const bx =
        origin.x - Math.cos(origin.heading) * 5 + Math.sin(drift * 7 + i) * 2;
      line(
        buf,
        0x95c8c2,
        [bx, by, origin.z + 2],
        [bx + 0.6, by + 1, origin.z + 2],
      );
    }
  }
}

export function paintTank(bed, frame, school, seconds, arrivals) {
  frame.camera = bed.camera;
  frame.pixels.set(bed.pixels);
  frame.depth.set(bed.depth);
  for (let i = 0; i < school.length; i++)
    drawFish(frame, school[i], seconds, arrivals.get(i));
  for (let i = 0; i < 10; i++) {
    const h = (seconds * (8 + (i % 3)) + i * 13) % surface;
    const x = 113 * layoutSpacing + 3 * Math.sin(h * 0.14 + i),
      z = -17 + (i % 3) * 2;
    line(frame, 0x649b9d, [x, h, z], [x + 0.6, h + 1, z]);
  }
}
export const makeFrame = surfaceBuffer;

// First view is a snapshot. Later increments animate; failed optimistic writes
// remove their fish. At capacity new fish replace the oldest occupants in order.
export function reconcileSchool(
  previous,
  total,
  day,
  capacity,
  seconds,
  playing,
  species,
) {
  const fish = makeSchool(total, day, capacity, species),
    arrivals = new Map();
  if (previous?.day === day && playing) {
    for (const [index, start] of previous.arrivals)
      if (
        fish[index]?.ordinal === previous.fish[index].ordinal &&
        start + landing > seconds
      )
        arrivals.set(index, start);
    if (total > previous.total) {
      const first = Math.max(previous.total, total - capacity);
      for (let i = first; i < total; i++)
        arrivals.set(i % capacity, seconds + (i - first) * 0.18);
    }
  }
  return { fish, arrivals, total, day };
}
