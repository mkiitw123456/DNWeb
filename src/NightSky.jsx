import { useEffect, useRef } from "react";

// The stars form three trails above the ridge, filled in check-in order.
const stars = [
  [20,37],[36,27],[51,31],[60,18],[76,14],[84,22],[103,18],[114,10],
  [130,34],[141,26],[157,30],[166,18],[181,21],[194,12],[206,16],[218,8],
  [236,28],[249,19],[259,24],[270,13],[284,17],[292,27],[307,23],[313,11],
];

export default function NightSky({ count }) {
  const canvas = useRef(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const width = 320, height = 96;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#121a38"); sky.addColorStop(.65, "#474368"); sky.addColorStop(1, "#ce886f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    function block(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
    for (let i = 0; i < 74; i++)
      block((i * 83) % width, (i * 29) % 61, 1, 1, "#79809d");
    stars.slice(0, count).forEach(([x,y], i) => {
      if (i % 8) {
        ctx.strokeStyle = "#777b9e";
        ctx.beginPath(); ctx.moveTo(...stars[i-1]); ctx.lineTo(x,y); ctx.stroke();
      }
      block(x-2,y,5,1,"#ffdc94"); block(x,y-2,1,5,"#ffdc94"); block(x,y,1,1,"#fff6cf");
    });
    for (let x = 0; x < width; x += 2) {
      const ridge = Math.round(65 + 8*Math.sin(x/21) - 5*Math.cos(x/12));
      block(x,ridge,2,height-ridge,"#413d5d");
      const hill = Math.round(79 + 8*Math.cos(x/48) + 2*Math.sin(x/14));
      block(x,hill,2,height-hill,"#242940");
    }
    // Slit dome and lamplit viewing room on the near ridge.
    block(74,62,29,13,"#262a41"); block(78,56,21,7,"#33364e");
    block(82,52,13,5,"#43445d"); block(86,50,6,3,"#53536d");
    block(90,53,2,11,"#202539"); block(72,64,33,2,"#616079");
    block(78,68,4,4,"#ffca82"); block(85,68,4,4,"#dbac78");
    block(74,74,29,12,"#242940");
  }, [count]);
  return <canvas ref={canvas} width="320" height="96" aria-hidden="true" />;
}
