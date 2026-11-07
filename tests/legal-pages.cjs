/* Headless check for the privacy, terms, and SMS pages plus the collection-point links. */
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { puppeteer = require('/tmp/csp-runner/node_modules/puppeteer-core'); }

var ROOT = path.resolve(__dirname, '..');
var CHROME = process.env.CHROME || '/usr/bin/google-chrome';
var ART = '/opt/cursor/artifacts';

function contentType(file) {
  var ext = path.extname(file);
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.xml') return 'application/xml';
  return 'application/octet-stream';
}
function startServer() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      var file = path.normalize(path.join(ROOT, urlPath));
      if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, function (err, data) {
        if (err) { res.writeHead(404); res.end('missing'); return; }
        res.writeHead(200, { 'content-type': contentType(file) });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', function () { resolve(srv); });
  });
}
function cspHits(logs) {
  return logs.filter(function (line) {
    return /content security policy|refused to (load|connect|apply|execute|frame)|ERR_BLOCKED_BY_CSP/i.test(line);
  });
}

async function main() {
  fs.mkdirSync(ART, { recursive: true });
  var srv = await startServer();
  var base = 'http://127.0.0.1:' + srv.address().port;
  var browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  var problems = [];
  function check(cond, msg) { if (!cond) problems.push(msg); }
  try {
    var pages = [
      ['/privacy.html', 'Privacy Policy', 'privacy'],
      ['/terms.html', 'Terms of Service', 'terms'],
      ['/sms-terms.html', 'SMS Terms', 'sms']
    ];
    for (var i = 0; i < pages.length; i++) {
      var spec = pages[i];
      var page = await browser.newPage();
      var logs = [];
      var requests = [];
      page.on('console', function (msg) { logs.push(msg.type() + ' ' + msg.text()); });
      page.on('pageerror', function (err) { logs.push('PAGEERROR ' + err.message); });
      page.on('request', function (req) { requests.push(req.url()); });
      await page.setViewport({ width: 1280, height: 900 });
      var res = await page.goto(base + spec[0], { waitUntil: 'networkidle0', timeout: 20000 });
      check(res.status() === 200, spec[0] + ' status ' + res.status());
      var h1 = await page.$eval('h1', function (el) { return el.innerText; });
      check(h1 === spec[1], spec[0] + ' h1 was ' + h1);
      var text = await page.evaluate(function () { return document.body.innerText; });
      check(/myagentllc2026@inkboxmail\.com/.test(text), spec[0] + ' missing contact email');
      check(!/never shared/i.test(text), spec[0] + ' still says never shared');
      check(!/\bJoshua\b|\bHorvath\b/i.test(text), spec[0] + ' includes a personal name');
      check(!/\d+\s+\w+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/i.test(text), spec[0] + ' looks like a street address');
      check(requests.some(function (u) { return u.indexOf('https://fonts.googleapis.com/') !== -1; }), spec[0] + ' did not load fonts');
      check(cspHits(logs).length === 0, spec[0] + ' CSP errors:\n' + cspHits(logs).join('\n'));
      var wide = await page.evaluate(function () {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
      });
      check(wide, spec[0] + ' overflows at 1280px');
      await page.screenshot({ path: path.join(ART, spec[2] + '-desktop.png'), fullPage: true });
      await page.setViewport({ width: 390, height: 844 });
      var narrow = await page.evaluate(function () {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
      });
      check(narrow, spec[0] + ' overflows at 390px');
      await page.screenshot({ path: path.join(ART, spec[2] + '-mobile.png'), fullPage: true });
      await page.close();
    }

    var privacy = await browser.newPage();
    await privacy.goto(base + '/privacy.html', { waitUntil: 'domcontentloaded' });
    var privacyText = await privacy.evaluate(function () { return document.body.innerText; });
    check(/Chat conversations are sent to an AI service to generate replies/.test(privacyText), 'privacy chat sentence missing');
    check(/Carriers and messaging providers/.test(privacyText), 'privacy SMS sharing exception missing');
    await privacy.close();

    var terms = await browser.newPage();
    await terms.goto(base + '/terms.html', { waitUntil: 'domcontentloaded' });
    var termsText = await terms.evaluate(function () { return document.body.innerText; });
    check(/Refund and cancellation terms are set out in each client's written Build Sprint agreement/.test(termsText), 'refund sentence missing');
    check(/not, by itself, permission to text/.test(termsText), 'missed-call consent caveat missing');
    await terms.close();

    var home = await browser.newPage();
    await home.setViewport({ width: 1280, height: 900 });
    await home.goto(base + '/', { waitUntil: 'domcontentloaded' });
    var hint = await home.$eval('#nova-hint', function (el) { return el.innerText; });
    check(/sent to an AI service/i.test(hint), 'chat hint missing AI disclosure: ' + hint);
    var foot = await home.$eval('footer .legal', function (el) { return el.innerText; });
    check(/Privacy/.test(foot) && /Terms/.test(foot) && /SMS terms/.test(foot), 'home footer links missing');
    var notice = await home.$eval('#contact-form .fine', function (el) { return el.innerText; });
    check(/Privacy Policy/.test(notice) && /don't sell/i.test(notice), 'contact notice missing');
    await home.click('footer .legal a[href="privacy.html"]');
    await home.waitForSelector('h1');
    var landed = await home.$eval('h1', function (el) { return el.innerText; });
    check(landed === 'Privacy Policy', 'footer privacy link landed on ' + landed);
    await home.close();

    var q = await browser.newPage();
    await q.setViewport({ width: 1280, height: 900 });
    await q.goto(base + '/questionnaire.html', { waitUntil: 'networkidle0' });
    var sms = await q.evaluate(function () {
      var box = document.querySelector('[name="sms_ok"]');
      var before = document.getElementById('plabel').textContent;
      box.checked = true;
      document.getElementById('q').dispatchEvent(new Event('change', { bubbles: true }));
      var after = document.getElementById('plabel').textContent;
      box.checked = false;
      document.querySelector('[name="name"]').value = 'Test Person';
      document.querySelector('[name="role"]').value = 'Owner';
      document.querySelector('[name="email"]').value = 'a@example.com';
      document.querySelector('[name="phone"]').value = '5550100';
      document.querySelector('[name="biz"]').value = 'Oak Care';
      document.querySelector('[name="industry"]').value = 'Plumbing';
      document.querySelector('[name="area"]').value = 'Redding';
      document.querySelector('[name="first_fix"]').value = 'Text back';
      var body = window.buildBody();
      return {
        checked: box.checked,
        required: box.required,
        valid: document.getElementById('q').checkValidity(),
        progressSame: before === after,
        bodyHasNo: body.indexOf('SMS opt-in: no') !== -1,
        badge: document.querySelector('.meta').innerText,
        notice: document.querySelector('.submit-sec .fine').innerText
      };
    });
    check(sms.checked === false, 'SMS box started checked or stayed checked');
    check(sms.required === false, 'SMS box is required');
    check(sms.valid, 'form invalid without the SMS box');
    check(sms.progressSame, 'progress bar treats the SMS box as required');
    check(sms.bodyHasNo, 'mailto body does not record SMS opt-in no');
    check(!/never shared/i.test(sms.badge), 'questionnaire badge still says never shared: ' + sms.badge);
    check(/Privacy Policy/.test(sms.notice), 'questionnaire notice missing');
    await q.screenshot({ path: path.join(ART, 'questionnaire-form.png'), fullPage: true });
    await q.setViewport({ width: 390, height: 844 });
    var qNarrow = await q.evaluate(function () {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
    });
    check(qNarrow, 'questionnaire overflows at 390px');
    await q.close();
  } finally {
    await browser.close();
    srv.close();
  }
  if (problems.length) {
    console.error('LEGAL CHECK FAILED\n- ' + problems.join('\n- '));
    process.exit(1);
  }
  console.log('legal pages check passed');
}
main().catch(function (err) { console.error(err); process.exit(1); });
