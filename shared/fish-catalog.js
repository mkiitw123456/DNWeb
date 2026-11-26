// IDs are stored in daily tanks and permanent member collections.
export const fishTiers = [
  { name: "普通", rate: 55, color: "#8bbba5" },
  { name: "稀有", rate: 30, color: "#71c4ed" },
  { name: "史詩", rate: 12, color: "#bd9bf3" },
  { name: "傳說", rate: 3, color: "#edbd65" },
];

function fish(id, name, tier, form, palette, note) {
  return { id, name, tier, form, palette, note };
}
export const fishCatalog = [
  fish(
    "mint",
    "薄荷燈魚",
    0,
    "dart",
    [0x318a88, 0xa6efcd, 0xdf674a, 0x225a60],
    "一線薄荷綠從眼後亮到尾根，小尾鰭不停輕擺。",
  ),
  fish(
    "honey",
    "蜜橘金魚",
    0,
    "round",
    [0xd58930, 0xffdf85, 0xeb7649, 0x955129],
    "圓肚子一晃一晃，像顆剛剝好的橘子。",
  ),
  fish(
    "rice",
    "月白青鱂",
    0,
    "slim",
    [0x9fb8b6, 0xe8f0d4, 0xbfd39c, 0x596e7c],
    "細長的身體貼著水光游過，背上留著一道銀線。",
  ),
  fish(
    "cherry",
    "櫻桃鯽",
    0,
    "dart",
    [0xc35457, 0xffafa0, 0xd58b50, 0x673b47],
    "尾尖染著櫻桃紅，轉身時可見深色的側線。",
  ),
  fish(
    "tux",
    "燕尾孔雀",
    1,
    "veil",
    [0x385788, 0x8bdddc, 0xe18d57, 0x27344f],
    "扇尾一收一放，轉彎時像抖開一把彩扇。",
  ),
  fish(
    "tiger",
    "琥珀虎皮",
    1,
    "round",
    [0xd09c4f, 0xffde86, 0xeb9351, 0x493f45],
    "短身披著深色虎斑，胸鰭會交替划水。",
  ),
  fish(
    "pennant",
    "青帆神仙",
    1,
    "sail",
    [0x4197a2, 0xa6e8c5, 0x66c5b4, 0x385069],
    "豎起的背鰭像小帆，懸停時仍輕輕起伏。",
  ),
  fish(
    "cobalt",
    "鈷藍彩虹",
    1,
    "slim",
    [0x386bbd, 0x84daec, 0xe98b52, 0x31466c],
    "藍背與橙尾在側身時交替迎光。",
  ),
  fish(
    "orchid",
    "蘭瓣鬥魚",
    2,
    "veil",
    [0x9859ae, 0xf5b5df, 0x87a6e8, 0x51375e],
    "俯衝後緩緩展開層疊尾鰭，像一朵在水裡開的蘭花。",
  ),
  fish(
    "leopard",
    "星斑魟",
    2,
    "ray",
    [0x477a86, 0xffdc97, 0x83c0b2, 0x274959],
    "雙翼交替掀起水流，背上的金斑隨起伏顯現。",
  ),
  fish(
    "maple",
    "紅楓錦鯉",
    2,
    "koi",
    [0xce6240, 0xffe3b4, 0xee8b49, 0x733f42],
    "楓紅斑紋沿著脊背散開，會下潛再抬頭滑行。",
  ),
  fish(
    "plume",
    "翠羽帆魚",
    2,
    "sail",
    [0x338d74, 0xc4e79c, 0x5dc7a4, 0x28535a],
    "帆鰭間生著細細的鰭條，滑行時一根根舒展。",
  ),
  fish(
    "aurora",
    "極光絲帶魚",
    3,
    "ribbon",
    [0x558bb6, 0xc4fff2, 0xbf8af5, 0x34466c],
    "絲帶般的長身掠過水面，尾端灑下短暫的冷光。",
  ),
  fish(
    "solstice",
    "日冕龍鯉",
    3,
    "koi",
    [0xe39432, 0xffedac, 0xf58b55, 0x8b4538],
    "金鬚向後飄，長尾在加速時拖出一串金色光點。",
  ),
  fish(
    "lunar",
    "月蝕飛魟",
    3,
    "ray",
    [0x4e618e, 0xe8e1ff, 0xaf9df1, 0x2b355c],
    "張開寬翼轉動身體，背上的星點像掠過夜空。",
  ),
  fish(
    "corona",
    "曙光冠尾",
    3,
    "veil",
    [0xaa586d, 0xffdbac, 0xec99c3, 0x693956],
    "冠尾的長鰭條各自飄動，急游時閃過晨曦色的微光。",
  ),
];
export const fishById = new Map(fishCatalog.map((s) => [s.id, s]));
const pools = fishTiers.map((_, tier) =>
  fishCatalog.filter((s) => s.tier === tier),
);

export function drawFishSpecies(randomInt) {
  let roll = randomInt(100);
  for (const [tier, { rate }] of fishTiers.entries()) {
    if (roll < rate) return pools[tier][randomInt(pools[tier].length)].id;
    roll -= rate;
  }
  throw new RangeError("Invalid rarity roll");
}
