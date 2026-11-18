/* Headless check: pages render, CSP is quiet, and the chat request is allowed.
   Run from the repo root: node tests/browser-csp.cjs
   Requires puppeteer-core and system Google Chrome. */
var http = require('http');
var fs = require('fs');
var path = require('path');
var puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { puppeteer = require('/tmp/csp-runner/node_modules/puppeteer-core'); }

var ROOT = path.resolve(__dirname, '..');
var CHROME = process.env.CHROME || '/usr/bin/google-chrome';
var XSS_REPLY = '<script>window.__xss=1</script><img src=x onerror="window.__xss=2">' +
  '<svg onload="window.__xss=3"></svg><a href="javascript:alert(1)">bad</a>' +
  '<a href="https://evil.example/phish">ext</a><b>safe bold</b> ' +
  '<a href="mailto:myagentllc2026@inkboxmail.com">mail</a> ' +
  '<a href="https://myagent.company/questionnaire.html">form</a>';

function contentType(file) {
  var ext = path.extname(file);
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.xml') return 'application/xml';
  if (ext === '.txt') return 'text/plain';
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

function fulfill(req, status, body) {
  var headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json'
  };
  if (req.method() === 'OPTIONS') {
    req.respond({ status: 204, headers: headers, body: '' });
    return;
  }
  req.respond({ status: status, headers: headers, body: body });
}

function attach(page, bag) {
  page.on('console', function (msg) { bag.logs.push(msg.type() + ' ' + msg.text()); });
  page.on('pageerror', function (err) { bag.logs.push('PAGEERROR ' + err.message); });
  page.on('request', function (req) { bag.requests.push(req.method() + ' ' + req.url()); });
  page.on('requestfailed', function (req) {
    var fail = req.failure();
    bag.failed.push((fail && fail.errorText) + ' ' + req.url());
  });
}

function cspHits(bag) {
  return bag.logs.concat(bag.failed).filter(function (line) {
    return /content security policy|refused to (load|connect|apply|execute|frame)|ERR_BLOCKED_BY_CSP/i.test(line);
  });
}

async function openPage(browser, url) {
  var page = await browser.newPage();
  var bag = { logs: [], requests: [], failed: [] };
  attach(page, bag);
  page.setDefaultTimeout(20000);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  return { page: page, bag: bag };
}

async function main() {
  var srv = await startServer();
  var port = srv.address().port;
  var base = 'http://127.0.0.1:' + port;
  var browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  var problems = [];
  function check(cond, msg) { if (!cond) problems.push(msg); }

  try {
    var home = await openPage(browser, base + '/');
    var h1 = await home.page.$eval('h1', function (el) { return el.innerText; });
    check(/A helper that picks up/i.test(h1), 'home h1 did not render: ' + h1);
    await home.page.setViewport({ width: 390, height: 800 });
    var narrow = await home.page.evaluate(function () {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
    });
    check(narrow, 'home has horizontal overflow at 390px');
    await home.page.setViewport({ width: 1280, height: 900 });
    await new Promise(function (r) { setTimeout(r, 800); });
    check(home.bag.requests.some(function (u) { return u.indexOf('https://fonts.googleapis.com/') !== -1; }), 'Google Fonts CSS was not requested');
    check(home.bag.requests.some(function (u) { return u.indexOf('https://fonts.gstatic.com/') !== -1; }), 'font files were not requested');
    check(home.bag.requests.some(function (u) { return u.indexOf('https://nova-proxy.myagentllc2026.workers.dev/visits') !== -1; }), 'visit counter request did not go out');
    check(cspHits(home.bag).length === 0, 'CSP errors on home load:\n' + cspHits(home.bag).join('\n'));

    await home.page.waitForSelector('#nova-panel.open');
    try {
      await home.page.waitForFunction(function () {
        return document.querySelector('#nova-msgs b');
      }, { timeout: 5000 });
    } catch (err) {
      var greetDump = await home.page.evaluate(function () {
        return document.getElementById('nova-msgs').innerHTML.slice(0, 500);
      });
      check(false, 'trusted greeting lost its bold text: ' + greetDump);
    }
    var greetBold = await home.page.$eval('#nova-msgs', function (el) { return el.querySelectorAll('b').length; });
    check(greetBold > 0, 'trusted greeting lost its bold text');

    await home.page.click('#nova-text');
    await home.page.type('#nova-text', 'hello from the local check');
    var typed = await home.page.$eval('#nova-text', function (el) { return el.value; });
    await home.page.click('#nova-send');
    await new Promise(function (r) { setTimeout(r, 1500); });
    var chatLines = home.bag.requests.filter(function (u) { return u.indexOf('nova-proxy.myagentllc2026.workers.dev/chat') !== -1; });
    check(chatLines.some(function (u) { return u.indexOf('POST ') === 0; }), 'chat POST did not go out (typed "' + typed + '"). requests:\n' + chatLines.join('\n'));
    var afterChat = cspHits(home.bag);
    check(afterChat.length === 0, 'CSP errors after chat send:\n' + afterChat.join('\n'));
    await home.page.close();

    var xssPage = await browser.newPage();
    var xssBag = { logs: [], requests: [], failed: [], bodies: [] };
    attach(xssPage, xssBag);
    await xssPage.setRequestInterception(true);
    xssPage.on('request', function (req) {
      if (req.url().indexOf('/chat') !== -1) {
        if (req.method() === 'POST' && req.postData()) xssBag.bodies.push(req.postData());
        fulfill(req, 200, JSON.stringify({ reply: XSS_REPLY }));
      } else req.continue();
    });
    await xssPage.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await xssPage.waitForSelector('#nova-panel.open');
    await xssPage.type('#nova-text', 'tell me something unusual about turtles');
    await xssPage.click('#nova-send');
    try {
      await xssPage.waitForFunction(function () {
        return Array.prototype.some.call(document.querySelectorAll('#nova-msgs .msg.bot'), function (b) {
          return b.textContent.indexOf('safe bold') !== -1;
        });
      }, { timeout: 10000 });
    } catch (err) {
      var dump = await xssPage.evaluate(function () {
        return Array.prototype.map.call(document.querySelectorAll('#nova-msgs .msg'), function (b) {
          return b.className + ' ' + b.innerHTML.slice(0, 400);
        }).join('\n');
      });
      throw new Error(err.message + '\nmessages:\n' + dump + '\nlogs:\n' + xssBag.logs.join('\n') + '\nfailed:\n' + xssBag.failed.join('\n'));
    }
    var xss = await xssPage.evaluate(function () {
      var msg = Array.prototype.find.call(document.querySelectorAll('#nova-msgs .msg.bot'), function (b) {
        return b.textContent.indexOf('safe bold') !== -1;
      });
      return {
        flag: window.__xss || null,
        active: msg.querySelectorAll('script,img,svg,iframe').length,
        bold: msg.querySelectorAll('b').length,
        hrefs: Array.prototype.map.call(msg.querySelectorAll('a'), function (a) { return a.getAttribute('href'); }),
        textHasScript: msg.textContent.indexOf('<script>') !== -1
      };
    });
    check(!xss.flag, 'malicious reply executed: ' + xss.flag);
    check(xss.active === 0, 'malicious reply created active elements');
    check(xss.bold === 1, 'allowed bold was stripped');
    check(xss.hrefs.indexOf('mailto:myagentllc2026@inkboxmail.com') !== -1, 'mailto link was stripped: ' + xss.hrefs.join(','));
    check(xss.hrefs.indexOf('https://myagent.company/questionnaire.html') !== -1, 'same-site link was stripped: ' + xss.hrefs.join(','));
    check(xss.hrefs.every(function (h) { return h.indexOf('javascript:') !== 0 && h.indexOf('https://evil.example') !== 0; }), 'disallowed link was kept: ' + xss.hrefs.join(','));
    check(xss.textHasScript, 'script markup was not shown as text');
    check(cspHits(xssBag).length === 0, 'CSP errors during xss fixture:\n' + cspHits(xssBag).join('\n'));
    var firstBody = JSON.parse(xssBag.bodies[0] || '{"messages":[]}');
    var firstHits = firstBody.messages.filter(function (m) { return m.content === 'tell me something unusual about turtles'; });
    check(firstHits.length === 1, 'latest question was sent ' + firstHits.length + ' times');
    await xssPage.type('#nova-text', 'and one more question about turtles');
    await xssPage.click('#nova-send');
    await xssPage.waitForFunction(function () {
      return document.querySelectorAll('#nova-msgs .msg.user').length >= 2;
    }, { timeout: 10000 });
    await new Promise(function (r) { setTimeout(r, 500); });
    var secondBody = JSON.parse(xssBag.bodies[xssBag.bodies.length - 1] || '{"messages":[]}');
    function countRole(body, content) {
      return body.messages.filter(function (m) { return m.content === content; }).length;
    }
    check(countRole(secondBody, 'tell me something unusual about turtles') === 1, 'first question duplicated in later history');
    check(countRole(secondBody, 'and one more question about turtles') === 1, 'second question duplicated');
    await xssPage.close();

    var fb = await browser.newPage();
    await fb.setRequestInterception(true);
    fb.on('request', function (req) {
      if (req.url().indexOf('/chat') !== -1) fulfill(req, 500, '{}');
      else req.continue();
    });
    await fb.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await fb.waitForSelector('#nova-panel.open');
    await fb.type('#nova-text', 'how much does the build sprint cost');
    await fb.click('#nova-send');
    await fb.waitForFunction(function () {
      return Array.prototype.some.call(document.querySelectorAll('#nova-msgs .msg.bot'), function (b) {
        return b.textContent.indexOf('Chat is temporarily unavailable') !== -1 && b.textContent.indexOf('myagentllc2026@inkboxmail.com') !== -1;
      });
    }, { timeout: 10000 });
    var fallback = await fb.evaluate(function () {
      var msg = Array.prototype.find.call(document.querySelectorAll('#nova-msgs .msg.bot'), function (b) {
        return b.textContent.indexOf('Chat is temporarily unavailable') !== -1;
      });
      return { html: msg.innerHTML, paypal: !!msg.querySelector('a[href*="paypal.com"]') };
    });
    check(fallback.html.indexOf('<') === -1, 'error message was inserted as HTML');
    check(!fallback.paypal, 'worker failure still showed a canned PayPal answer');
    await fb.close();

    var q = await openPage(browser, base + '/questionnaire.html');
    var qh = await q.page.$eval('h1', function (el) { return el.innerText; });
    check(/your business/i.test(qh), 'questionnaire h1 did not render: ' + qh);
    await q.page.setViewport({ width: 390, height: 800 });
    var qNarrow = await q.page.evaluate(function () {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
    });
    check(qNarrow, 'questionnaire has horizontal overflow at 390px');
    check(q.bag.requests.some(function (u) { return u.indexOf('https://fonts.googleapis.com/') !== -1; }), 'questionnaire did not load fonts');
    check(cspHits(q.bag).length === 0, 'CSP errors on questionnaire:\n' + cspHits(q.bag).join('\n'));
    var hp = await q.page.evaluate(function () {
      var field = document.querySelector('[name="website_hp"]');
      var box = field.getBoundingClientRect();
      field.value = 'http://spam.example';
      document.querySelector('[name="name"]').value = 'Test Person';
      document.querySelector('[name="role"]').value = 'Owner';
      document.querySelector('[name="email"]').value = 'a@example.com';
      document.querySelector('[name="phone"]').value = '5550100';
      document.querySelector('[name="biz"]').value = 'Oak Care';
      document.querySelector('[name="industry"]').value = 'Plumbing';
      document.querySelector('[name="area"]').value = 'Redding';
      document.querySelector('[name="first_fix"]').value = 'Text back';
      var ev = document.createEvent('Event');
      ev.initEvent('submit', true, true);
      var blocked = document.getElementById('q').dispatchEvent(ev) === false || true;
      document.getElementById('q').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      return {
        offscreen: box.right < 0 || box.width <= 2,
        copyShown: document.getElementById('copywrap').style.display === 'block',
        tab: field.getAttribute('tabindex'),
        sendHasCheck: String(window.send).indexOf('website_hp') !== -1
      };
    });
    check(hp.offscreen, 'honeypot is visible');
    check(hp.tab === '-1', 'honeypot is in tab order');
    check(hp.sendHasCheck, 'send() does not check the honeypot');
    check(!hp.copyShown, 'honeypot still built the mailto');
    await q.page.close();

    var ref = await openPage(browser, base + '/referral-partner.html');
    var robots = await ref.page.$eval('meta[name="robots"]', function (el) { return el.getAttribute('content') || ''; });
    check(/noindex/i.test(robots), 'referral page missing noindex: ' + robots);
    var rh = await ref.page.$eval('h1', function (el) { return el.innerText; });
    check(/want to refer/i.test(rh), 'referral h1 did not render: ' + rh);
    await ref.page.setViewport({ width: 1280, height: 900 });
    var refWide = await ref.page.evaluate(function () {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
    });
    check(refWide, 'referral page has horizontal overflow at 1280px');
    check(ref.bag.requests.some(function (u) { return u.indexOf('https://fonts.googleapis.com/') !== -1; }), 'referral page did not load fonts');
    check(cspHits(ref.bag).length === 0, 'CSP errors on referral page:\n' + cspHits(ref.bag).join('\n'));
    try { fs.mkdirSync('/opt/cursor/artifacts', { recursive: true }); } catch (e) {}
    await ref.page.screenshot({ path: '/opt/cursor/artifacts/referral_partner_desktop.png', fullPage: true });
    await ref.page.setViewport({ width: 390, height: 844 });
    var refNarrowEarly = await ref.page.evaluate(function () {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
    });
    check(refNarrowEarly, 'referral page has horizontal overflow at 390px');
    await ref.page.screenshot({ path: '/opt/cursor/artifacts/referral_partner_mobile.png', fullPage: true });
    await ref.page.setViewport({ width: 1280, height: 900 });
    var refFlow = await ref.page.evaluate(function () {
      function set(name, value) {
        var el = document.querySelector('[name="' + name + '"]');
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      var form = document.getElementById('refer');
      var hp = document.querySelector('[name="website_hp"]');
      var box = hp.getBoundingClientRect();
      var before = document.getElementById('plabel').textContent;
      hp.value = 'http://spam.example';
      form.dispatchEvent(new Event('input', { bubbles: true }));
      var afterHp = document.getElementById('plabel').textContent;
      hp.value = '';
      set('name', 'Ada Example');
      set('role', 'Administrator');
      set('email', 'ada@example.com');
      set('phone', '5550100');
      set('biz', 'North Facility');
      set('license_number', '   ');
      set('street', '   ');
      set('city', '   ');
      set('state', '   ');
      set('zip', '   ');
      set('referrals', 'Two care homes I have visited');
      set('expect_return', 'No');
      form.noValidate = true;
      form.requestSubmit();
      var whitespaceBlocked = document.getElementById('copywrap').style.display !== 'block';
      set('license_number', '');
      set('street', '');
      set('city', '');
      set('state', '');
      set('zip', '');
      form.requestSubmit();
      var emptyBlocked = document.getElementById('copywrap').style.display !== 'block';
      set('license_number', 'FAC-100');
      set('street', '10 Care Lane');
      set('city', 'Redding');
      set('state', 'CA');
      set('zip', '96001');
      var body = window.buildBody();
      form.requestSubmit();
      var opened = document.getElementById('copywrap').style.display === 'block';
      document.getElementById('copywrap').style.display = 'none';
      hp.value = 'http://spam.example';
      form.requestSubmit();
      var hpBlocked = document.getElementById('copywrap').style.display !== 'block';
      hp.value = '';
      form.noValidate = false;
      ['license_number', 'street', 'city', 'state', 'zip'].forEach(function (name) {
        document.querySelector('[name="' + name + '"]').setCustomValidity('');
      });
      set('license_number', '');
      set('street', '');
      set('city', '');
      set('state', '');
      set('zip', '');
      var htmlBlocksEmpty = form.checkValidity() === false;
      set('street', '10 Care Lane');
      set('city', 'Redding');
      set('state', 'CA');
      set('zip', '96001');
      set('license_number', '   ');
      document.querySelector('[name="license_number"]').setCustomValidity('');
      document.getElementById('copywrap').style.display = 'none';
      form.requestSubmit();
      var jsBlocksWhitespace = document.getElementById('copywrap').style.display !== 'block';
      var license = document.querySelector('[name="license_number"]');
      var street = document.querySelector('[name="street"]');
      return {
        offscreen: box.right < 0 || box.width <= 2,
        tab: hp.getAttribute('tabindex'),
        progressSame: before === afterHp,
        whitespaceBlocked: whitespaceBlocked,
        emptyBlocked: emptyBlocked,
        opened: opened,
        hpBlocked: hpBlocked,
        htmlBlocksEmpty: htmlBlocksEmpty,
        jsBlocksWhitespace: jsBlocksWhitespace,
        licenseRequired: license.required,
        streetRequired: street.required,
        cityRequired: document.querySelector('[name="city"]').required,
        stateRequired: document.querySelector('[name="state"]').required,
        zipRequired: document.querySelector('[name="zip"]').required,
        bodyHasLicense: body.indexOf('State license number: FAC-100') !== -1,
        bodyHidesHp: body.indexOf('spam.example') === -1 && body.indexOf('website_hp') === -1,
        sendSrc: String(window.send)
      };
    });
    check(refFlow.offscreen, 'referral honeypot is visible');
    check(refFlow.tab === '-1', 'referral honeypot is in tab order');
    check(refFlow.progressSame, 'referral progress counts the honeypot');
    check(refFlow.whitespaceBlocked, 'whitespace license or address still built the mailto');
    check(refFlow.emptyBlocked, 'empty license or address still built the mailto');
    check(refFlow.opened, 'completed referral form did not open the email draft');
    check(refFlow.hpBlocked, 'referral honeypot still built the mailto');
    check(refFlow.htmlBlocksEmpty, 'HTML required did not block an empty license or address');
    check(refFlow.jsBlocksWhitespace, 'submit handler did not block a whitespace-only license number');
    check(refFlow.licenseRequired && refFlow.streetRequired && refFlow.cityRequired && refFlow.stateRequired && refFlow.zipRequired, 'license or address inputs are missing required');
    check(refFlow.bodyHasLicense, 'mailto body dropped the license number');
    check(refFlow.bodyHidesHp, 'mailto body included the honeypot');
    var sendSrc = refFlow.sendSrc;
    var mailtoAt = sendSrc.indexOf('mailto:');
    check(mailtoAt > 0, 'send() does not build a mailto');
    check(sendSrc.indexOf('.trim()') !== -1 && sendSrc.indexOf('.trim()') < mailtoAt, 'send() does not trim before the mailto');
    check(sendSrc.indexOf('license_number') !== -1 && sendSrc.indexOf('license_number') < mailtoAt, 'send() does not check the license number');
    ['street', 'city', 'state', 'zip'].forEach(function (name) {
      check(sendSrc.indexOf("'" + name + "'") !== -1 && sendSrc.indexOf("'" + name + "'") < mailtoAt, 'send() does not check ' + name);
    });
    check(sendSrc.lastIndexOf('return false', mailtoAt) !== -1, 'send() does not return before the mailto');
    await ref.page.close();

    var contact = await openPage(browser, base + '/#contact');
    var contactHp = await contact.page.evaluate(function () {
      document.getElementById('c-name').value = 'Test';
      document.getElementById('c-email').value = 'a@example.com';
      document.getElementById('c-biz').value = 'Oak';
      document.getElementById('c-msg').value = 'Hello';
      document.getElementById('contact-hp').value = 'http://spam.example';
      document.getElementById('contact-form').requestSubmit();
      var done = document.getElementById('contact-done');
      var shown = window.getComputedStyle(done).display !== 'none';
      document.getElementById('contact-hp').value = '';
      document.getElementById('contact-form').requestSubmit();
      var shownAfter = window.getComputedStyle(done).display !== 'none';
      var href = document.getElementById('contact-mailto').getAttribute('href') || '';
      return { shown: shown, shownAfter: shownAfter, href: href };
    });
    check(!contactHp.shown, 'contact honeypot still revealed the email draft');
    check(contactHp.shownAfter, 'empty honeypot blocked a real contact submit');
    check(contactHp.href.indexOf('mailto:myagentllc2026@inkboxmail.com') === 0, 'contact mailto was not built: ' + contactHp.href);
    check(cspHits(contact.bag).length === 0, 'CSP errors on contact flow:\n' + cspHits(contact.bag).join('\n'));
    await contact.page.close();
  } finally {
    await browser.close();
    srv.close();
  }

  if (problems.length) {
    console.error('BROWSER CHECK FAILED\n- ' + problems.join('\n- '));
    process.exit(1);
  }
  console.log('browser CSP check passed');
  process.exit(0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
