// Shared goal/lab growth visualization.
function goalProgress(g, tasks) {
  const linked = tasks.filter((t) => t.goalId === g.id || (t.goalIds || []).includes(g.id));
  if (!linked.length) return g.progress || 0;
  const done = linked.filter((t) => t.status === 'done').length;
  return Math.round((done / linked.length) * 100);
}


/* ------------------------------------------------------------------------- *
 * Дерево прогресса цели — рисунок тушью, 10 стадий: от семени до цветения.
 * viewBox 96×76, цвета — из тех же CSS-переменных темы.
 *
 * 0–9 % семя · 10–19 проросток · 20–29 саженец · 30–39 деревце ·
 * 40–49 ветви · 50–59 молодая крона · 60–69 крона · 70–79 густая крона ·
 * 80–89 цветение · 90–99 полное цветение · 100 % — плюс лепестки на ветру.
 *
 * Порода: 'oak' — дуб, 'maple' — клён, 'sakura' — сакура.
 * Всё рисуется заливками-мазками: ствол и ветви сужаются к концам, крона —
 * замкнутые пятна с неровным краем, как размывка тушью.
 * ------------------------------------------------------------------------- */

const GOAL_TREE_SPECIES_LIST = ['oak', 'maple', 'sakura'];

function goalTreeStage(progress) {
  return Math.max(0, Math.min(9, Math.floor(progress / 10)));
}

// Порода выбирается по идентификатору цели: по списку выглядит случайно,
// но у каждой цели своё дерево, и оно не меняется при перерисовке.
function goalTreeSpecies(seed) {
  if (TREE_SPECIES[seed]) return seed;
  const str = String(seed == null ? '' : seed);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return GOAL_TREE_SPECIES_LIST[Math.abs(h) % GOAL_TREE_SPECIES_LIST.length];
}

const _tRound = (n) => Math.round(n * 10) / 10;
const _tNoise = (i) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v) - 0.5; };

/* ---------- мазки -------------------------------------------------------- */

function _tBez(p, t) {
  const u = 1 - t;
  const x = u*u*u*p[0] + 3*u*u*t*p[2] + 3*u*t*t*p[4] + t*t*t*p[6];
  const y = u*u*u*p[1] + 3*u*u*t*p[3] + 3*u*t*t*p[5] + t*t*t*p[7];
  const tx = -3*u*u*p[0] + (3*u*u - 6*u*t)*p[2] + (6*u*t - 3*t*t)*p[4] + 3*t*t*p[6];
  const ty = -3*u*u*p[1] + (3*u*u - 6*u*t)*p[3] + (6*u*t - 3*t*t)*p[5] + 3*t*t*p[7];
  return [x, y, tx, ty];
}

// Мазок кистью: осевая кривая, ширина падает к концу (mode 'taper')
// или тонкая на обоих концах (mode 'sweep'). rough — лёгкая неровность края.
function tStroke(p, w0, w1, cls = 'tree-solid grown', tMax = 1, mode = 'taper', rough = 0, seed = 0) {
  const N = 22, L = [], R = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * tMax;
    const [x, y, tx, ty] = _tBez(p, t);
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len, ny = tx / len;
    let w = mode === 'sweep'
      ? w0 * (0.22 + 0.78 * Math.sin(Math.PI * Math.pow(t, 0.8)))
      : w1 + (w0 - w1) * Math.pow(1 - t, 1.6);
    if (rough) w *= 1 + rough * Math.sin(t * 8.5 + seed) * 0.5 + rough * Math.sin(t * 21 + seed * 2) * 0.2;
    w /= 2;
    L.push(`${_tRound(x + nx * w)} ${_tRound(y + ny * w)}`);
    R.push(`${_tRound(x - nx * w)} ${_tRound(y - ny * w)}`);
  }
  const tip = _tBez(p, tMax);
  return `<path class="${cls}" d="M${L.join('L')}L${_tRound(tip[0])} ${_tRound(tip[1])}L${R.reverse().join('L')}Z"/>`;
}

// Пятно кроны: замкнутый контур с неровным радиусом, сглаженный кривыми Безье.
function tBlob(cx, cy, rx, ry, rough = 0.16, seed = 0, n = 13, flat = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const k = 1 + _tNoise(i + seed * 7) * rough * 2;
    const sy = Math.sin(a) > 0 ? flat : 1;                 // низ кроны чуть подрезан
    pts.push([cx + rx * k * Math.cos(a), cy + ry * k * sy * Math.sin(a)]);
  }
  let d = `M${_tRound(pts[0][0])} ${_tRound(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${_tRound(p1[0] + (p2[0]-p0[0])/6)} ${_tRound(p1[1] + (p2[1]-p0[1])/6)}`
       + ` ${_tRound(p2[0] - (p3[0]-p1[0])/6)} ${_tRound(p2[1] - (p3[1]-p1[1])/6)}`
       + ` ${_tRound(p2[0])} ${_tRound(p2[1])}`;
  }
  return d + 'Z';
}

// Фигура в локальных координатах (лист, цветок, семя) — ставится через <g>.
function tPlace(inner, x, y, deg = 0, scale = 1) {
  return `<g transform="translate(${_tRound(x)} ${_tRound(y)}) rotate(${_tRound(deg)}) scale(${_tRound(scale * 100) / 100})">${inner}</g>`;
}

/* ---------- листья и цветы ----------------------------------------------- */

// Контуры листьев в локальных координатах: длина около 11, черешок слева.
const LEAF_D = {
  oak: 'M-5.4 0C-5 -1.3 -3.8 -1.5 -3.1 -2.5C-2.4 -3.4 -1.1 -2.5 -0.5 -3.1C0.2 -3.8 1.4 -2.9 2 -3.3C2.8 -3.8 3.6 -2.3 4.4 -1.5C5 -0.9 5.4 -0.4 5.4 0C5.4 0.4 5 0.9 4.4 1.5C3.6 2.3 2.8 3.8 2 3.3C1.4 2.9 0.2 3.8 -0.5 3.1C-1.1 2.5 -2.4 3.4 -3.1 2.5C-3.8 1.5 -5 1.3 -5.4 0Z',
  maple: 'M5.6 0L2.3 -1.4L2.8 -4.6L0.4 -2.7L-1.2 -4.4L-2.7 -1.7L-5.2 0L-2.7 1.7L-1.2 4.4L0.4 2.7L2.8 4.6L2.3 1.4Z',
  sakura: 'M-4.3 0.3C-4.7 -1.9 -2.4 -3.4 0.5 -3C2.7 -2.7 4.2 -1.6 4.5 -0.6C4.8 0.5 3.2 2.3 0.6 2.7C-2 3.1 -4 2.2 -4.3 0.3Z',
};
const leafShape = (k) => `<path class="tree-leaf grown" d="${LEAF_D[k]}"/>`;

// Цветок сакуры — пять лепестков вокруг сердцевины.
const FLOWER_SAKURA = (() => {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    s += `<ellipse class="tree-bloom grown" cx="${_tRound(2 * Math.cos(a))}" cy="${_tRound(2 * Math.sin(a))}" rx="1.7" ry="1.5"/>`;
  }
  return s;
})();

// Жёлудь — шляпка мазком, тело светлее.
// Жёлудь одним силуэтом: шляпка шире тела, поэтому узнаётся даже в 3 px.
const ACORN = '<path class="tree-solid grown" d="M-2.9 -1.3C-2.9 -3.4 -1.5 -4.4 0 -4.4C1.5 -4.4 2.9 -3.4 2.9 -1.3'
  + 'C2.9 -0.6 2.4 -0.3 2.2 -0.3C2.2 3.2 1.2 5.2 0 5.2C-1.2 5.2 -2.2 3.2 -2.2 -0.3C-2.4 -0.3 -2.9 -0.6 -2.9 -1.3Z"/>';

// Крылатка клёна — две лопасти под углом.
// Крылатка клёна: две лопасти и утолщение семени — тоже одним тоном.
const SAMARA = '<path class="tree-solid grown" d="M0 1.4C1.4 -0.6 4.2 -2.4 6.4 -2.2C5.4 0.2 2.6 1.8 0.9 2.1'
  + 'C0.6 2.9 -0.6 2.9 -0.9 2.1C-2.6 1.8 -5.4 0.2 -6.4 -2.2C-4.2 -2.4 -1.4 -0.6 0 1.4Z"/>';

// Семена: жёлудь, крылатка, вишнёвая косточка.
const SEED_OAK = ACORN;
const SEED_MAPLE = SAMARA;
const SEED_SAKURA = '<path class="tree-leaf grown" d="M0 -3.4C2.4 -2.4 3.2 0 2 2.2C1.2 3.6 -1.2 3.6 -2 2.2C-3.2 0 -2.4 -2.4 0 -3.4Z"/>';

/* ---------- породы ------------------------------------------------------- */

const TREE_SPECIES = {
  oak: {
    name: 'Дуб',
    ground: 1.9,
    trunk: { p: [48, 67, 46.2, 58.5, 49.6, 50.5, 48.4, 41.5], w: [6.2, 2.2] },
    rough: 0.16,
    branches: [
      { p: [47, 54, 43, 52, 39.5, 49.5, 34.5, 45], w: [3.4, 0.5] },
      { p: [49, 50.5, 53, 48.5, 56.5, 45.5, 61.5, 42], w: [3.4, 0.5] },
      { p: [47.4, 48, 44.2, 44.5, 41.5, 40.5, 37.5, 35], w: [2.6, 0.4] },
      { p: [48.8, 45, 52, 42, 55, 38, 59, 33], w: [2.6, 0.4] },
      { p: [47.8, 43.5, 46.2, 39, 45, 34.5, 43.5, 29], w: [2, 0.35] },
      { p: [48.4, 43, 50.2, 38.5, 51.6, 34, 53.5, 28.5], w: [2, 0.35] },
    ],
    crownBox: { dx: 0, dy: 1.4, kx: 1.08, ky: 0.92 },
    clusterK: 1, clusterRough: 0.16, dabScale: 0.66, bloomArc: [-150, -30], bloomF: 1.1,
    key: 'oak', leaf: leafShape('oak'), leafScale: 0.86,
    rim: [[152, 1.08, 26], [24, 1.1, -18], [96, 1.06, 74], [196, 1.04, 8], [-16, 1.08, -8], [62, 1.06, -46]],
    bloomMark: ACORN, bloomScale: 0.58, bloomOn: 'edge',
    bloomAt: [[-148, 0.84], [-32, 0.82], [-104, 0.76], [-62, 0.8], [-170, 0.74], [-8, 0.76], [-124, 0.58],
              [-46, 0.58], [-88, 0.6], [-14, 0.6], [-158, 0.58]],
    seed: SEED_OAK, seedRot: -14,
    flying: leafShape('oak'), flyScale: 0.78,
  },
  maple: {
    name: 'Клён',
    ground: 1.7,
    trunk: { p: [48, 67, 47.2, 57, 48.8, 46.5, 48, 35.5], w: [4.4, 1.5] },
    rough: 0.1,
    branches: [
      { p: [47.4, 50, 44.5, 47, 42, 43.5, 39.5, 38], w: [2.6, 0.4] },
      { p: [48.6, 47.5, 51.5, 44.5, 54, 41, 56.5, 35.5], w: [2.6, 0.4] },
      { p: [47.6, 43, 45.5, 39.5, 44, 36, 42.5, 30.5], w: [2.2, 0.35] },
      { p: [48.4, 40.5, 50.5, 37, 52, 33.5, 53.5, 28], w: [2.2, 0.35] },
      { p: [47.8, 37, 46.6, 33.5, 46.2, 30, 46, 25.5], w: [1.8, 0.3] },
      { p: [48.2, 36, 49.4, 32.5, 49.8, 29, 50, 24.5], w: [1.8, 0.3] },
    ],
    crownBox: { dx: 0, dy: -1.6, kx: 0.9, ky: 1.16 },
    clusterK: 0.92, clusterRough: 0.13, dabScale: 0.62, bloomArc: [-145, -35], bloomF: 1.12,
    key: 'maple', leaf: leafShape('maple'), leafScale: 0.82,
    rim: [[130, 1.06, -34], [50, 1.06, 34], [90, 1.04, 0], [166, 1.04, -8], [14, 1.04, 8], [110, 1.02, -20]],
    bloomMark: SAMARA, bloomScale: 0.62, bloomOn: 'edge',
    bloomAt: [[-142, 0.82], [-38, 0.8], [-106, 0.74], [-70, 0.78], [-168, 0.72], [-12, 0.74], [-120, 0.56],
              [-56, 0.56], [-88, 0.58], [-24, 0.58], [-154, 0.56]],
    seed: SEED_MAPLE, seedRot: 0,
    flying: leafShape('maple'), flyScale: 0.74,
  },
  sakura: {
    name: 'Сакура',
    ground: 1.7,
    trunk: { p: [48, 67, 44.8, 58.5, 51.8, 50.5, 47.8, 41], w: [4.8, 1.7] },
    rough: 0.12,
    branches: [
      { p: [46.8, 52, 42.5, 49.5, 37.5, 46.5, 32, 44.5], w: [2.8, 0.4] },
      { p: [49.2, 49, 53.5, 46.5, 58.5, 43.5, 64, 42], w: [2.8, 0.4] },
      { p: [47.2, 46.5, 43, 43.5, 39, 41, 34, 39], w: [2.2, 0.35] },
      { p: [48.8, 44, 53, 41.5, 57, 39, 62, 37.5], w: [2.2, 0.35] },
      { p: [47.6, 42.5, 45, 38.5, 43.5, 35, 41.5, 31.5], w: [1.8, 0.3] },
      { p: [48.4, 42, 51, 38.5, 53, 35, 55, 31.5], w: [1.8, 0.3] },
    ],
    crownBox: { dx: 0, dy: 0.4, kx: 1.14, ky: 0.88 },
    clusterK: 0.82, clusterRough: 0.16, dabScale: 0.5, dabRound: true, bloomArc: [190, -10], bloomF: 0.66,
    key: 'sakura', leaf: leafShape('sakura'), leafScale: 0.8,
    rim: [[158, 1.1, 20], [22, 1.12, -20], [104, 1.06, 60], [66, 1.06, -60], [190, 1.06, 6], [-10, 1.08, -6]],
    bloomMark: FLOWER_SAKURA, bloomScale: 0.62, bloomOn: 'mass',
    bloomAt: [[150, 0.9], [116, 0.84], [84, 0.9], [48, 0.86], [18, 0.88], [178, 0.84],
              [132, 0.62], [66, 0.6], [100, 0.52], [30, 0.62], [162, 0.6]],
    seed: SEED_SAKURA, seedRot: -12,
    flying: '<path class="tree-bloom grown" d="M-2.8 0C-1.8 -1.9 0.6 -2.6 3 -1.4C1.6 1.4 -0.8 1.8 -2.8 0Z"/>',
    flyScale: 1,
  },
};

/* ---------- рост --------------------------------------------------------- */

const TREE_GROUND = [
  [39, 66.6, 44, 65.4, 52, 65.4, 57, 66.6],
  [37, 66.8, 43, 65.4, 53, 65.4, 59, 66.8],
  [34, 67, 41, 65.2, 55, 65.2, 62, 67],
  [31, 67.2, 40, 65, 56, 65, 65, 67.2],
  [28, 67.4, 39, 64.8, 57, 64.8, 68, 67.4],
  [26, 67.6, 38, 64.6, 58, 64.6, 70, 67.6],
  [24, 67.6, 37, 64.5, 59, 64.5, 72, 67.6],
  [23, 67.8, 36.5, 64.4, 59.5, 64.4, 73, 67.8],
  [22, 67.8, 36, 64.4, 60, 64.4, 74, 67.8],
  [21, 68, 35.5, 64.3, 60.5, 64.3, 75, 68],
];

const TREE_TRUNK_TRIM  = [0, 0.26, 0.46, 0.62, 0.72, 0.81, 0.89, 0.94, 0.97, 1];
const TREE_TRUNK_W     = [0, 0.34, 0.52, 0.66, 0.78, 0.87, 0.93, 0.97, 0.99, 1];
const TREE_BRANCH_N    = [0, 0, 0, 2, 3, 4, 5, 6, 6, 6];
const TREE_BRANCH_TRIM = [0, 0, 0, 0.5, 0.64, 0.78, 0.88, 0.95, 0.98, 1];
const TREE_CANOPY = [null, null, null,
  { bloom: 0 }, { bloom: 0 }, { bloom: 0 }, { bloom: 0 }, { bloom: 0 }, { bloom: 2 }, { bloom: 3 }];

// Молодые стадии: семя, семядоли, первые листья породы.
const TREE_COTYL = [[43.4, 55.6, 16], [52.6, 55.6, -16]];
const TREE_SAPLING_LEAVES = [[41.8, 51.6, 18, 0.82], [54.2, 49.4, -18, 0.82], [48.6, 44.4, -6, 0.72]];

// Лепестки и листья на ветру — только при 100 %.
const TREE_FLY = [[71.5, 30.5, -18, 1], [78.5, 24.5, -38, 0.9], [85, 31, -12, 0.8],
                  [75.5, 37.5, -52, 0.85], [88.5, 20.5, -26, 0.7], [67.5, 22, -6, 0.75]];

/* ---------- сборка ------------------------------------------------------- */

// Листва растёт пучками на концах ветвей: между пучками остаются просветы,
// сквозь которые читается рисунок ветвей — как в рисунке тушью.
const TREE_CLUSTER = [null, null, null,
  { r: 5.4, dabs: 4 }, { r: 6, dabs: 5 }, { r: 6.8, dabs: 5 },
  { r: 7.4, dabs: 6 }, { r: 8, dabs: 6 }, { r: 8.3, dabs: 6 }, { r: 8.6, dabs: 7 }];

function _tAnchors(sp, stage) {
  const out = [];
  const tt = _tBez(sp.trunk.p, TREE_TRUNK_TRIM[stage]);
  out.push([tt[0], tt[1] - 1.4, 1]);
  for (let i = 0; i < TREE_BRANCH_N[stage]; i++) {
    const b = _tBez(sp.branches[i].p, TREE_BRANCH_TRIM[stage]);
    const len = Math.hypot(b[2], b[3]) || 1;
    out.push([b[0] + (b[2] / len) * 1.6, b[1] + (b[3] / len) * 1.6, i < 2 ? 1.06 : 0.94]);
  }
  return out;
}

function _tCrown(sp, stage) {
  const g = TREE_CLUSTER[stage], anchors = _tAnchors(sp, stage);
  let mass = '';
  anchors.forEach(([x, y, k], i) => {
    const r = g.r * sp.clusterK * k;
    const rx = r * 1.16, ry = r * 0.84;
    mass += `<path d="${tBlob(x, y, rx, ry, sp.clusterRough, i * 3 + stage, 12)}"/>`;
    for (let j = 0; j < g.dabs; j++) {
      const deg = 200 - (232 * j) / (g.dabs - 1) + _tNoise(i * 5 + j) * 20;
      const a = deg * Math.PI / 180;
      const f = 0.78 + _tNoise(i + j * 3) * 0.2;
      const px = x + rx * f * Math.cos(a), py = y - ry * f * Math.sin(a);
      if (sp.dabRound) {                                   // округлые пучки без острых концов
        const rr = r * sp.dabScale * (0.9 + _tNoise(i * 9 + j) * 0.24);
        mass += `<path d="${tBlob(px, py, rr * 1.12, rr * 0.9, 0.13, i * 4 + j, 10)}"/>`;
      } else {
        mass += tPlace(`<path d="${LEAF_D[sp.key]}"/>`, px, py,
          -deg + _tNoise(i * 7 + j) * 18, sp.dabScale * (0.9 + 0.3 * (r / 9)));
      }
    }
  });
  return `<g class="tree-leaf grown">${mass}</g>`;
}

function _tSkeleton(sp, stage) {
  let s = '';
  if (TREE_TRUNK_TRIM[stage]) {
    s += tStroke(sp.trunk.p, sp.trunk.w[0] * TREE_TRUNK_W[stage], sp.trunk.w[1] * TREE_TRUNK_W[stage],
                 'tree-solid grown', TREE_TRUNK_TRIM[stage], 'taper', sp.rough, 1.4);
  }
  for (let i = 0; i < TREE_BRANCH_N[stage]; i++) {
    const b = sp.branches[i];
    s += tStroke(b.p, b.w[0], b.w[1], 'tree-solid branch grown', TREE_BRANCH_TRIM[stage], 'taper', sp.rough * 0.8, i + 2);
  }
  return s;
}

function goalTreeArt(stage, species, full) {
  const sp = TREE_SPECIES[goalTreeSpecies(species)];
  let s = tStroke(TREE_GROUND[stage], sp.ground, sp.ground, 'tree-wash grown', 1, 'sweep');

  // Семя при 0 % рисуется в масштабе 1 — в 96-юнитном viewBox это буквально
  // несколько пикселей, и вместо узнаваемого жёлудя/крылатки/косточки видна
  // просто тёмная клякса. Увеличиваем в 2.2 раза, чтобы форма читалась.
  if (stage === 0) return s + _tSkeleton(sp, stage) + tPlace(sp.seed, 48, 63.8, sp.seedRot, 2.2);
  if (stage === 1) return s + _tSkeleton(sp, stage) + TREE_COTYL.map(([x, y, r]) => tPlace(sp.leaf, x, y, r, 0.62)).join('');
  if (stage === 2) return s + _tSkeleton(sp, stage) + TREE_SAPLING_LEAVES.map(([x, y, r, k]) => tPlace(sp.leaf, x, y, r, k * sp.leafScale)).join('');

  // Листва снизу, ствол и ветви поверх — как в рисунке тушью, где ветви ведут через крону.

  s += _tCrown(sp, stage) + _tSkeleton(sp, stage);

  // Цветение: жёлуди и крылатки висят под пучками, цветы сакуры — на них.
  const per = TREE_CANOPY[stage].bloom;
  if (per) {
    const g = TREE_CLUSTER[stage], anchors = _tAnchors(sp, stage);
    if (sp.bloomOn === 'edge') {
      // Жёлуди и крылатки свисают из-под пучков — читаются на просвет.
      const list = anchors.slice(1);
      const count = Math.min(list.length, per === 2 ? 2 : 3);
      for (let i = 0; i < count; i++) {
        const [x, y, k] = list[i];
        const r = g.r * sp.clusterK * k;
        const deg = -90 + _tNoise(i * 3 + stage) * 54;
        const a = deg * Math.PI / 180;
        s += tPlace(sp.bloomMark, x + r * 1.16 * 1.02 * Math.cos(a), y - r * 0.84 * 1.3 * Math.sin(a), 0, sp.bloomScale);
      }
    } else {
      // Цветы сакуры ложатся прямо на пучки.
      anchors.forEach(([x, y, k], i) => {
        const r = g.r * sp.clusterK * k;
        for (let j = 0; j < per; j++) {
          const deg = 190 - (200 * (j + 0.5)) / per + _tNoise(i * 4 + j) * 26;
          const a = deg * Math.PI / 180;
          const f = 0.6 + _tNoise(i * 6 + j) * 0.3;
          s += tPlace(sp.bloomMark, x + r * 1.16 * f * Math.cos(a), y - r * 0.84 * f * Math.sin(a), 0, sp.bloomScale);
        }
      });
    }
  }

  // Лепестки на ветру — награда за 100 %.
  if (full) {
    const n = species === 'sakura' ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const [x, y, rot, k] = TREE_FLY[i];
      s += `<g style="opacity:${(0.9 - i * 0.09).toFixed(2)}">${tPlace(sp.flying, x, y, rot, k * sp.flyScale)}</g>`;
    }
  }
  return s;
}

// seed — id цели (тогда порода закреплена за ней) либо прямо 'oak' / 'maple' / 'sakura'.
function goalTreeHtml(value, size = 'regular', seed) {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  const stage = goalTreeStage(progress);
  return `<div class="goal-tree ${size === 'compact' ? 'compact' : ''}" role="img" aria-label="Прогресс цели ${progress}%">
    <svg viewBox="0 0 96 76" aria-hidden="true">${goalTreeArt(stage, goalTreeSpecies(seed), progress >= 100)}</svg>
  </div>`;
}


