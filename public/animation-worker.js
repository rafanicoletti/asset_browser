self.onmessage = (event) => {
    const { id, mode, bitmap, cellWidth, cellHeight, paddingX, paddingY } = event.data;
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        bitmap.close();

        const frames = mode === 'grid'
            ? splitGrid(imageData, Math.max(1, cellWidth || 1), Math.max(1, cellHeight || 1), Math.max(0, paddingX || 0), Math.max(0, paddingY || 0))
            : splitAuto(imageData);

        self.postMessage({ id, frames, width: imageData.width, height: imageData.height });
    } catch (err) {
        self.postMessage({ id, error: err.message || String(err) });
    }
};

function alphaAt(data, width, x, y) {
    return data[((y * width + x) * 4) + 3];
}

function splitGrid(imageData, cellWidth, cellHeight, paddingX, paddingY) {
    const frames = [];

    for (let y = 0, row = 0; y < imageData.height; y += cellHeight + paddingY, row++) {
        for (let x = 0, col = 0; x < imageData.width; x += cellWidth + paddingX, col++) {
            frames.push({
                x,
                y,
                w: Math.min(cellWidth, imageData.width - x),
                h: Math.min(cellHeight, imageData.height - y),
                row,
                col,
                index: frames.length
            });
        }
    }
    return frames;
}

function splitAuto(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const visited = new Uint8Array(width * height);
    const stack = new Int32Array(width * height);
    const frames = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const startIndex = y * width + x;
            if (visited[startIndex] || alphaAt(data, width, x, y) === 0) continue;

            let top = 0;
            let count = 0;
            let left = x;
            let right = x;
            let minY = y;
            let maxY = y;
            stack[top++] = startIndex;
            visited[startIndex] = 1;

            const pushNeighbor = (nx, ny) => {
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
                const next = ny * width + nx;
                if (visited[next] || alphaAt(data, width, nx, ny) === 0) return;
                visited[next] = 1;
                stack[top++] = next;
            };

            while (top > 0) {
                const current = stack[--top];
                count++;
                const cx = current % width;
                const cy = Math.floor(current / width);
                if (cx < left) left = cx;
                if (cx > right) right = cx;
                if (cy < minY) minY = cy;
                if (cy > maxY) maxY = cy;

                pushNeighbor(cx - 1, cy);
                pushNeighbor(cx + 1, cy);
                pushNeighbor(cx, cy - 1);
                pushNeighbor(cx, cy + 1);
            }

            if (count >= 4) {
                frames.push({
                    x: left,
                    y: minY,
                    w: right - left + 1,
                    h: maxY - minY + 1,
                    row: 0,
                    col: frames.length,
                    index: frames.length
                });
            }
        }
    }

    frames.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    frames.forEach((frame, index) => frame.index = index);
    return frames;
}
