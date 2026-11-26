// Resolve four depth-tested samples into each displayed pixel, including alpha at the glass edge.
export function observeAquariumCanvas(canvas, aspect, maxWidth, onResize) {
  const display = canvas.getContext("2d");
  const samples = document.createElement("canvas");
  const raster = samples.getContext("2d");
  if (!display || !raster) return () => {};

  let previousWidth = 0;
  function resize() {
    const cssWidth = canvas.getBoundingClientRect().width;
    if (!cssWidth) return;
    const width = Math.min(maxWidth, Math.max(1, Math.round(cssWidth * window.devicePixelRatio)));
    if (width === previousWidth) return;
    previousWidth = width;
    canvas.width = width;
    canvas.height = Math.max(1, Math.round(width / aspect));
    samples.width = width * 2;
    samples.height = canvas.height * 2;
    display.globalCompositeOperation = "copy";
    display.imageSmoothingEnabled = true;
    onResize(samples.width, samples.height, image => {
      raster.putImageData(image, 0, 0);
      display.drawImage(samples, 0, 0, canvas.width, canvas.height);
    });
  }

  resize();
  const observer = new ResizeObserver(resize);
  const box = "devicePixelContentBoxSize" in ResizeObserverEntry.prototype ? "device-pixel-content-box" : "content-box";
  observer.observe(canvas, { box });
  window.addEventListener("resize", resize);
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", resize);
  };
}
