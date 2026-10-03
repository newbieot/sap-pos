'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function main() {
  const [sourcePath, sheetjsPath, legacyPath] = process.argv.slice(2);
  if (!sourcePath || !sheetjsPath || !process.env.PLAYWRIGHT_NODE_PATH) {
    throw new Error('Provide <source.xlsx> <sheetjs.js> and PLAYWRIGHT_NODE_PATH pointing to the bundled playwright package.');
  }
  const { chromium } = require(process.env.PLAYWRIGHT_NODE_PATH);
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    try { res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream'); res.end(fs.readFileSync(target)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://cdn.sheetjs.com/**', (route) => route.fulfill({ path: path.resolve(sheetjsPath), contentType: 'application/javascript' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelector('#activityLog').textContent.includes('Converter ready'));
    await page.locator('#fileInput').setInputFiles(path.resolve(sourcePath));
    await page.waitForFunction(() => document.querySelector('#metricCod').textContent === '198');
    assert.equal(await page.locator('#metricNonCod').innerText(), '527');
    assert.equal(await page.locator('#metricSheets').innerText(), '10');
    assert.equal(await page.locator('#metricSkipped').innerText(), '0');
    assert.equal(await page.locator('#shipmentSheetList .sheet-item').count(), 10);
    assert.equal(await page.locator('#metricWarnings').innerText(), '363');
    const unusualPhone = page.locator('#issueList .issue-item').filter({ hasText: '270 KARDUS · Non-COD records with unusual phone value' });
    await unusualPhone.locator('.issue-details summary').click();
    assert.equal(await unusualPhone.locator('tbody tr').count(), 25);
    assert.equal(await unusualPhone.locator('.issue-detail-pager > span').innerText(), '1–25 of 270');
    await unusualPhone.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await unusualPhone.locator('.issue-detail-pager > span').innerText(), '26–50 of 270');
    await unusualPhone.locator('input').fill('row:14');
    assert.equal(await unusualPhone.locator('tbody tr').count(), 1);
    assert.equal(await unusualPhone.locator('tbody td').nth(1).innerText(), '14');
    assert.equal(await unusualPhone.locator('tbody td').nth(4).innerText(), 'Q · Tlp1');
    assert.equal(await unusualPhone.locator('tbody td').nth(6).innerText(), '0');
    await unusualPhone.locator('.issue-details summary').click();
    const headerIssue = page.locator('#issueList .issue-item').filter({ hasText: 'karung A · Non-COD has unrecognized columns' });
    await headerIssue.locator('.issue-details summary').click();
    assert.equal(await headerIssue.locator('tbody td').nth(1).innerText(), '2');
    assert.equal(await headerIssue.locator('tbody td').nth(2).innerText(), 'Not applicable');
    assert.equal(await headerIssue.locator('tbody td').nth(6).innerText(), 'SAP Batam');
    await headerIssue.locator('.issue-details summary').click();
    const blankPhone = page.locator('#issueList .issue-item').filter({ hasText: '22 KARDUS · Non-COD records with recipient phone' });
    await blankPhone.locator('.issue-details summary').click();
    await blankPhone.locator('input').fill('row:223');
    assert.equal(await blankPhone.locator('tbody tr').count(), 1);
    assert.equal(await blankPhone.locator('tbody td').nth(1).innerText(), '223');
    assert.equal(await blankPhone.locator('tbody td').nth(5).innerText(), '(empty)');
    assert.equal(await blankPhone.locator('tbody td').nth(6).innerText(), '0');
    await page.locator('#nonCodTab').click();
    await page.locator('#previewSheetSelect').selectOption('KARDUS');
    assert.match(await page.locator('#previewCountText').innerText(), /346 matching/);
    assert.equal(await page.locator('#previewTable tbody tr').count(), 10);
    const files = await page.evaluate(() => {
      const captured = [];
      const create = SAPXExport.createWorkbookFile;
      SAPXExport.createWorkbookFile = (options) => { const file = create(options); captured.push(file); return file; };
      window.__testOutputs = captured;
      SAPXExport.downloadFile = () => {};
      return captured.length;
    });
    assert.equal(files, 0);
    await page.locator('#processButton').click();
    await page.waitForFunction(() => document.querySelectorAll('.generated-file').length === 17);
    const outputStats = await page.evaluate(() => window.__testOutputs.map((file) => {
      const rows = XLSX.utils.sheet_to_json(file.workbook.Sheets[file.sheetName], { header: 1, raw: true });
      return { filename: file.filename, sheetName: file.sheetName, sourceSheetName: file.sourceSheetName, records: file.records, hasIns: rows[0].includes('INS'), invalidText: rows.slice(1).some((row) => row.some((value) => typeof value === 'string' && /[^\p{L}\p{N} .\-,()]/u.test(value))) };
    }));
    assert.equal(outputStats.reduce((sum, file) => sum + file.records, 0), 725);
    assert.ok(outputStats.every((file) => !file.hasIns && !file.invalidText && file.sheetName === file.sourceSheetName));
    assert.equal(outputStats.filter((file) => file.sourceSheetName === 'KARDUS').length, 1);
    assert.equal(new Set(outputStats.map((file) => file.filename)).size, 17);
    if (await page.locator('#deliverySummaryContent').count()) {
      assert.ok(await page.locator('#deliverySummaryContent').isVisible());
      assert.match(await page.locator('#deliverySummaryText').innerText(), /346/);
      await page.locator('#previewSheetSelect').selectOption('');
      assert.match(await page.locator('#deliverySummaryText').innerText(), /725/);
      const detail = page.locator('#deliveryDistrictList details').first();
      await detail.locator('summary').click();
      assert.ok(await detail.getAttribute('open') !== null);
    }
    const screenshotPath = process.env.BROWSER_SCREENSHOT_PATH;
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    if (process.env.BROWSER_DETAILS_SCREENSHOT_PATH) await blankPhone.screenshot({ path: process.env.BROWSER_DETAILS_SCREENSHOT_PATH });
    await page.locator('#removeFileButton').click();
    assert.equal(await page.locator('#metricSheets').innerText(), '0');
    assert.ok(await page.locator('#processButton').isDisabled());
    assert.equal(await page.locator('.generated-file').count(), 0);
    if (legacyPath) {
      await page.locator('#fileInput').setInputFiles(path.resolve(legacyPath));
      await page.waitForFunction(() => document.querySelector('#metricCod').textContent === '3');
      assert.equal(await page.locator('#metricNonCod').innerText(), '2');
      assert.equal(await page.locator('#metricSheets').innerText(), '2');
      await page.locator('#processButton').click();
      await page.waitForFunction(() => document.querySelectorAll('.generated-file').length === 2);
      await page.locator('#removeFileButton').click();
    }
    assert.deepEqual(errors, []);
    console.log('Actual workbook browser regression passed: 10 sheets, 725 records, 17 files; filtering, exports, mobile layout and clear.');
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
