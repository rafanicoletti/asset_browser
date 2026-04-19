async function readTimeline(page) {
    return page.evaluate(() => window.__ASSET_BROWSER_TEST__.readTimeline());
}

async function setupTimeline(page, options) {
    await page.evaluate(opts => window.__ASSET_BROWSER_TEST__.setupTimeline(opts), options);
    await page.waitForFunction(() => window.__ASSET_BROWSER_TEST__.readTimeline().chips.length > 0);
    return readTimeline(page);
}

function assertNoChipOverlap(assert, chips) {
    for (let index = 1; index < chips.length; index += 1) {
        const previous = chips[index - 1];
        const current = chips[index];
        assert.gte(current.left, previous.left + previous.width, `chip ${index + 1} does not overlap previous chip`);
    }
}

exports.tests = [
    {
        name: 'animation timeline starts frames on exact time positions',
        async run({ page, assert }) {
            const state = await setupTimeline(page, { frameCount: 2, fps: 2, panelWidth: 420, zoom: 1 });
            assert.equal(state.durationValue, '1.00', '2 frames at 2fps produce 1 second duration');
            assert.close(state.chips[0].left, 0, 1, 'first chip starts at 0s');
            assert.close(state.markers[0].left, 0, 1, 'first marker starts at 0s');
            assert.close(state.chips[1].left, state.contentWidth / 2, 1, 'second chip starts at 0.5s');
            assert.close(state.markers[1].left, state.contentWidth / 2, 1, 'second marker starts at 0.5s');
            assertNoChipOverlap(assert, state.chips);
        }
    },
    {
        name: 'timeline zoom expands content and enables horizontal scroll',
        async run({ page, assert }) {
            const before = await setupTimeline(page, { frameCount: 2, fps: 2, panelWidth: 360, zoom: 1 });
            await page.locator('#animation-timeline-zoom').evaluate(input => {
                input.value = '2';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            const after = await readTimeline(page);
            assert.equal(after.zoomLabel, '2x', 'zoom value label updates');
            assert.gte(after.contentWidth, before.contentWidth * 1.8, '2x zoom grows timeline content');
            assert.gt(after.timelineScrollWidth, after.timelineClientWidth, 'zoomed timeline can scroll horizontally');
            assert.close(after.chips[1].left, after.contentWidth / 2, 1, 'frame position scales with zoomed timeline');
        }
    },
    {
        name: 'timeline zoom label stays stable while value changes',
        async run({ page, assert }) {
            await setupTimeline(page, { frameCount: 2, fps: 2, panelWidth: 260, zoom: 1 });
            const before = await page.evaluate(() => {
                const input = document.getElementById('animation-timeline-zoom');
                const label = document.querySelector('.animation-zoom-label-row span:first-child');
                const value = document.getElementById('animation-timeline-zoom-value');
                const inputRect = input.getBoundingClientRect();
                const labelRect = label.getBoundingClientRect();
                const valueRect = value.getBoundingClientRect();
                return {
                    inputTop: inputRect.top,
                    labelRight: labelRect.right,
                    valueLeft: valueRect.left
                };
            });
            await page.locator('#animation-timeline-zoom').evaluate(input => {
                input.value = '2.5';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            const after = await page.evaluate(() => {
                const input = document.getElementById('animation-timeline-zoom');
                const label = document.querySelector('.animation-zoom-label-row span:first-child');
                const value = document.getElementById('animation-timeline-zoom-value');
                const inputRect = input.getBoundingClientRect();
                const labelRect = label.getBoundingClientRect();
                const valueRect = value.getBoundingClientRect();
                return {
                    inputTop: inputRect.top,
                    labelRight: labelRect.right,
                    valueLeft: valueRect.left,
                    zoomValue: value.textContent
                };
            });
            assert.equal(after.zoomValue, '2.5x', 'zoom value text updates');
            assert.gte(after.valueLeft, after.labelRight + 2, 'zoom value does not overlap label text');
            assert.close(after.inputTop, before.inputTop, 1, 'slider vertical position remains stable');
        }
    },
    {
        name: 'many timeline frames grow width instead of overlapping',
        async run({ page, assert }) {
            const state = await setupTimeline(page, { frameCount: 20, fps: 10, panelWidth: 360, zoom: 1 });
            assert.gte(state.contentWidth, 20 * 66, 'timeline grows to at least one chip plus gap per frame');
            assert.gt(state.timelineScrollWidth, state.timelineClientWidth, 'many frames create horizontal scroll');
            assertNoChipOverlap(assert, state.chips);
            assert.gte(state.chips[1].left - (state.chips[0].left + state.chips[0].width), 8, 'dense timeline keeps an 8px click gap between frames');
        }
    },
    {
        name: 'timeline paste zone fills the space between frame chips',
        async run({ page, assert }) {
            const state = await setupTimeline(page, { frameCount: 2, fps: 2, panelWidth: 420, zoom: 1 });
            const gap = state.gaps[1];
            assert.close(gap.left, state.chips[0].left + state.chips[0].width, 1, 'paste zone starts after previous chip');
            assert.close(gap.width, state.chips[1].left - gap.left, 1, 'paste zone fills space up to next chip');
            assert.gte(gap.width, 8, 'paste zone gives a visible clickable target');
            await page.locator('.animation-insert-gap').nth(1).click();
            const afterClick = await readTimeline(page);
            assert.equal(afterClick.insertionIndex, 1, 'clicking between chips selects paste point before next frame');
        }
    },
    {
        name: 'paused preview frame matches green timeline cursor slot',
        async run({ page, assert }) {
            await setupTimeline(page, { frameCount: 4, fps: 4, panelWidth: 420, zoom: 1 });
            await page.evaluate(() => window.__ASSET_BROWSER_TEST__.setPreviewSlot(0.5));
            const state = await readTimeline(page);
            assert.equal(state.previewFrameIndex, 2, '0.5s cursor points at third frame for 4fps timeline');
            assert.close(state.cursorX, state.chips[2].left, 1, 'green cursor aligns with selected frame start');
        }
    },
    {
        name: 'fps controls increment in whole units',
        async run({ page, assert }) {
            const state = await setupTimeline(page, { frameCount: 2, fps: 2, panelWidth: 360, zoom: 1 });
            assert.equal(state.fpsInputStep, '1', 'main FPS input uses integer step');
            assert.equal(state.trackFpsInputStep, '1', 'track-row FPS input uses integer step');
        }
    },
    {
        name: 'timeline frame hover shows large preview tooltip',
        async run({ page, assert }) {
            await setupTimeline(page, { frameCount: 2, fps: 2, panelWidth: 360, zoom: 1 });
            await page.locator('.animation-frame-chip').first().hover();
            await page.waitForFunction(() => {
                const tooltip = document.getElementById('animation-frame-tooltip');
                return tooltip && getComputedStyle(tooltip).display !== 'none';
            });
            const tooltip = await page.evaluate(() => {
                const root = document.getElementById('animation-frame-tooltip');
                const canvas = root.querySelector('canvas');
                const rect = canvas.getBoundingClientRect();
                return {
                    title: root.querySelector('.animation-frame-tooltip-title').textContent,
                    meta: root.querySelector('.animation-frame-tooltip-meta').textContent,
                    canvasWidth: Math.round(rect.width),
                    canvasHeight: Math.round(rect.height),
                    display: getComputedStyle(root).display
                };
            });
            assert.equal(tooltip.display, 'block', 'tooltip is visible');
            assert.equal(tooltip.title, '#1 - sheet.png', 'tooltip keeps frame number and image name');
            assert.equal(tooltip.meta, '(0, 0, 16, 16)', 'tooltip keeps frame bounds');
            assert.gte(tooltip.canvasWidth, 150, 'tooltip uses a large preview canvas');
            assert.gte(tooltip.canvasHeight, 150, 'tooltip preview canvas is large vertically');
        }
    }
];
