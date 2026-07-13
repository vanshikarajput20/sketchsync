/**
 * client/src/lib/exportCanvas.js
 *
 * Canvas export utilities.
 * Exports the board as PNG or SVG by compositing both canvas layers.
 */

/**
 * Exports the whiteboard canvas as a PNG and triggers a browser download.
 *
 * @param {HTMLCanvasElement} committedCanvas  - The layer with all confirmed ops
 * @param {string} [filename]                  - Download filename (without extension)
 */
export function exportAsPNG(committedCanvas, filename = 'whiteboard') {
  // Create a temporary canvas with a white background
  const temp = document.createElement('canvas');
  temp.width  = committedCanvas.width;
  temp.height = committedCanvas.height;

  const ctx = temp.getContext('2d');

  // Fill white background (the committed canvas is transparent by default)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, temp.width, temp.height);

  // Draw the committed layer on top
  ctx.drawImage(committedCanvas, 0, 0);

  // Trigger download
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = temp.toDataURL('image/png');
  link.click();
}

/**
 * Exports the whiteboard canvas as an SVG containing the PNG as a data URI.
 *
 * Note: This is a "raster-in-SVG" export rather than a true vector SVG,
 * because the Canvas API operates on raster pixels. A true vector SVG
 * would require re-rendering all ops through an SVG serializer (future work).
 *
 * @param {HTMLCanvasElement} committedCanvas
 * @param {string} [filename]
 */
export function exportAsSVG(committedCanvas, filename = 'whiteboard') {
  const pngDataUrl = committedCanvas.toDataURL('image/png');
  const { width, height } = committedCanvas;

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <image width="${width}" height="${height}" xlink:href="${pngDataUrl}"/>
</svg>`;

  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.download = `${filename}.svg`;
  link.href = url;
  link.click();

  // Release the object URL to free memory
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
