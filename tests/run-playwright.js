const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.ASSET_BROWSER_TEST_URL || 'http://localhost:3130';
const RESULTS_DIR = path.join(ROOT, 'test-results');

function requirePlaywright() {
    try {
        return require('playwright');
    } catch (err) {
        const candidates = [
            process.env.PLAYWRIGHT_NODE_MODULES,
            process.env.NODE_PATH,
            path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules')
        ].filter(Boolean).flatMap(value => value.split(path.delimiter));

        for (const candidate of candidates) {
            try {
                return createRequire(path.join(candidate, 'package.json'))('playwright');
            } catch (candidateErr) {
                // Try next candidate.
            }
        }
        throw err;
    }
}

function checkServer(url) {
    return new Promise(resolve => {
        const req = http.get(url, res => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(750, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function waitForServer(url, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await checkServer(url)) return true;
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
}

async function ensureServer() {
    if (await checkServer(BASE_URL)) return null;
    const port = new URL(BASE_URL).port || '80';
    const child = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, ASSET_BROWSER_DEBUG: '1', PORT: port },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => process.stdout.write(`[server] ${chunk}`));
    child.stderr.on('data', chunk => process.stderr.write(`[server] ${chunk}`));
    if (!(await waitForServer(BASE_URL))) {
        child.kill();
        throw new Error(`Server did not become ready at ${BASE_URL}`);
    }
    return child;
}

async function launchBrowser(playwright) {
    const attempts = [
        () => playwright.chromium.launch({ headless: true }),
        () => playwright.chromium.launch({ headless: true, channel: 'msedge' }),
        () => playwright.chromium.launch({ headless: true, channel: 'chrome' })
    ];
    let lastError = null;
    for (const attempt of attempts) {
        try {
            return await attempt();
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError;
}

function makeAssert(testName) {
    const fail = message => {
        throw new Error(`${testName}: ${message}`);
    };
    return {
        ok(value, message) {
            if (!value) fail(message);
        },
        equal(actual, expected, message) {
            if (actual !== expected) fail(`${message} (expected ${expected}, got ${actual})`);
        },
        close(actual, expected, tolerance, message) {
            if (Math.abs(actual - expected) > tolerance) {
                fail(`${message} (expected ${expected} +/- ${tolerance}, got ${actual})`);
            }
        },
        gte(actual, expected, message) {
            if (actual < expected) fail(`${message} (expected >= ${expected}, got ${actual})`);
        },
        gt(actual, expected, message) {
            if (actual <= expected) fail(`${message} (expected > ${expected}, got ${actual})`);
        }
    };
}

function loadSpecs() {
    const specDir = path.join(__dirname, 'e2e');
    return fs.readdirSync(specDir)
        .filter(file => file.endsWith('.spec.js'))
        .sort()
        .flatMap(file => require(path.join(specDir, file)).tests);
}

async function run() {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const server = await ensureServer();
    const playwright = requirePlaywright();
    const browser = await launchBrowser(playwright);
    const tests = loadSpecs();
    const failures = [];

    for (const test of tests) {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            deviceScaleFactor: 1,
            locale: 'en-US'
        });
        const page = await context.newPage();
        const diagnostics = [];
        const missingResources = [];
        page.on('console', msg => {
            const text = msg.text();
            if (msg.type() === 'error' && !text.includes('Failed to load resource: the server responded with a status of 404')) {
                diagnostics.push(`console error: ${text}`);
            }
        });
        page.on('pageerror', err => diagnostics.push(`page error: ${err.message}`));
        page.on('requestfailed', req => {
            if (!req.url().includes('/favicon')) diagnostics.push(`request failed: ${req.url()} ${req.failure()?.errorText || ''}`);
        });
        page.on('response', res => {
            if (res.status() === 404 && !res.url().includes('/favicon')) missingResources.push(res.url());
        });

        try {
            await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.__ASSET_BROWSER_TEST__ && window.__ASSET_BROWSER_TEST__.ready);
            await test.run({ page, assert: makeAssert(test.name), baseURL: BASE_URL });
            diagnostics.push(...missingResources.map(url => `404 response: ${url}`));
            if (diagnostics.length > 0) throw new Error(diagnostics.join('\n'));
            console.log(`PASS ${test.name}`);
        } catch (err) {
            const safeName = test.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
            const screenshotPath = path.join(RESULTS_DIR, `${safeName}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
            failures.push({ name: test.name, err, screenshotPath, diagnostics });
            console.error(`FAIL ${test.name}`);
            console.error(err.stack || err.message);
        } finally {
            await context.close();
        }
    }

    await browser.close();
    if (server) server.kill();

    if (failures.length > 0) {
        console.error(`\n${failures.length} test(s) failed. Screenshots in ${RESULTS_DIR}`);
        process.exitCode = 1;
    } else {
        console.log(`\n${tests.length} test(s) passed.`);
    }
}

run().catch(err => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
});
