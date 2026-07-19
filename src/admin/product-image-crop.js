function clampPercent(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 50;
  }

  return Math.min(100, Math.max(0, numeric));
}

export function getCoverCropRect({
  outputHeight,
  outputWidth,
  positionX = 50,
  positionY = 50,
  sourceHeight,
  sourceWidth,
  zoom = 1
}) {
  const dimensions = [outputHeight, outputWidth, sourceHeight, sourceWidth];

  if (dimensions.some((dimension) => !Number.isFinite(dimension) || dimension <= 0)) {
    throw new Error("Dimensoes invalidas para recortar a imagem.");
  }

  const normalizedZoom = Math.max(1, Number(zoom) || 1);
  const scale =
    Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight) * normalizedZoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const horizontalShift = ((drawWidth - outputWidth) * clampPercent(positionX)) / 100;
  const verticalShift = ((drawHeight - outputHeight) * clampPercent(positionY)) / 100;
  const offsetX = horizontalShift === 0 ? 0 : -horizontalShift;
  const offsetY = verticalShift === 0 ? 0 : -verticalShift;

  return {
    drawHeight,
    drawWidth,
    offsetX,
    offsetY
  };
}
