/* Static checks for the direct-link referral form.
   Run from the repo root: node tests/referral-partner.test.js */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}
function extractFunction(src, name) {
  var start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, 'missing function ' + name);
  var i = src.indexOf('{', start);
  var depth = 0;
  for (; i < src.length; i++) {
    var ch = src.charAt(i);
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}
function openingTag(html, name) {
  var token = 'name="' + name + '"';
  var at = html.indexOf(token);
  assert.ok(at !== -1, 'missing field ' + name);
  var start = html.lastIndexOf('<', at);
  var end = html.indexOf('>', at);
  assert.ok(start !== -1 && end !== -1, 'broken tag for ' + name);
  return html.slice(start, end + 1);
}

var html = read('referral-partner.html');
var questionnaire = read('questionnaire.html');
var stripped = html.replace(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g, '');

var csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
var qcsp = questionnaire.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
assert.ok(csp && qcsp, 'CSP meta missing');
assert.strictEqual(csp[1], qcsp[1]);
assert.ok(/<meta name="referrer" content="strict-origin-when-cross-origin">/.test(html), 'referrer meta');
assert.ok(/if\(window\.top!==window\.self\)\{window\.top\.location=window\.self\.location;\}/.test(html), 'frame bust');
assert.ok(/<meta name="robots" content="noindex">/.test(html), 'noindex');
assert.ok(/form-action 'self' mailto:/.test(csp[1]), 'CSP form-action');

var required = ['name', 'role', 'email', 'phone', 'biz', 'license_number', 'street', 'city', 'state', 'zip', 'referrals', 'expect_return'];
var optional = ['return_detail', 'heard', 'why_us'];
required.forEach(function (name) {
  var tag = openingTag(html, name);
  assert.ok(/\brequired\b/.test(tag), name + ' is missing the required attribute: ' + tag);
});
optional.forEach(function (name) {
  var tag = openingTag(html, name);
  assert.ok(!/\brequired\b/.test(tag), name + ' should stay optional: ' + tag);
});

var hp = openingTag(html, 'website_hp');
assert.ok(/class="hp"/.test(hp), hp);
assert.ok(/tabindex="-1"/.test(hp), hp);
assert.ok(/data-progress="ignore"/.test(hp), hp);
assert.ok(/aria-hidden="true"/.test(hp), hp);
assert.ok(!/\brequired\b/.test(hp), hp);

var send = extractFunction(html, 'send');
var mailtoAt = send.indexOf('mailto:');
assert.ok(mailtoAt > 0, 'send() does not build a mailto');
assert.ok(send.indexOf('.trim()') !== -1 && send.indexOf('.trim()') < mailtoAt, 'trim check is not before mailto');
assert.ok(send.indexOf('license_number') !== -1 && send.indexOf('license_number') < mailtoAt, 'license check is not in send()');
['street', 'city', 'state', 'zip'].forEach(function (name) {
  var at = send.indexOf("'" + name + "'");
  assert.ok(at !== -1 && at < mailtoAt, name + ' is not checked before mailto');
});
assert.ok(send.lastIndexOf('return false', mailtoAt) !== -1, 'send() can reach mailto while a required field is blank');
assert.ok(send.indexOf('website_hp') !== -1 && send.indexOf('website_hp') < mailtoAt, 'honeypot check is not before mailto');
assert.ok(/myagentllc2026@inkboxmail\.com/.test(html), 'recipient');

var pct = extractFunction(html, 'pct');
assert.ok(pct.indexOf('website_hp') !== -1, 'progress includes the honeypot');
assert.ok(pct.indexOf('data-progress') !== -1, 'progress ignores data-progress');

var body = extractFunction(html, 'buildBody');
assert.ok(body.indexOf('website_hp') === -1, 'email body lists the honeypot');
assert.ok(body.indexOf('license_number') !== -1, 'email body drops the license');
assert.ok(body.indexOf("'street'") !== -1, 'email body drops the street');

assert.ok(/We don't sell your info/.test(html), 'privacy notice');
assert.ok(/Privacy Policy/.test(html), 'privacy link');
assert.ok(/does not store the form/.test(html), 'storage notice');
assert.ok(/<a href="privacy\.html">Privacy Policy<\/a>/.test(html), 'privacy href');

assert.ok(read('sitemap.xml').indexOf('referral-partner') === -1, 'sitemap lists the referral form');
assert.ok(read('index.html').indexOf('referral-partner') === -1, 'home page links the referral form');
assert.ok(questionnaire.indexOf('referral-partner') === -1, 'questionnaire links the referral form');
assert.ok(!/<nav\b[\s\S]*referral-partner\.html/.test(read('index.html')), 'main nav includes the referral form');

assert.ok(!/[\u2014\u2013]/.test(stripped), 'dash that should stay out of the copy');
['audit', 'game-changer', 'gamechanger', 'supercharge', 'cutting-edge', 'cutting edge', 'leverage', 'seamless', 'no fluff', 'commission'].forEach(function (word) {
  assert.ok(stripped.toLowerCase().indexOf(word) === -1, 'banned word: ' + word);
});
assert.ok(!/\bJoshua\b|\bHorvath\b/.test(stripped), 'personal name');
assert.ok(!/tel:/.test(html), 'phone link');
assert.ok(!/\b\d{3}[-.)]\s*\d{3}[-.]\d{4}\b/.test(stripped), 'phone number on the page');
assert.ok(/state license number/i.test(stripped), 'license label');
assert.ok(/contractor license number/i.test(stripped), 'contractor hint');
assert.ok(/How did you hear about MyAgent/.test(stripped), 'heard question');
assert.ok(/What made you choose MyAgent, or reach out to us\?/.test(stripped), 'why question');
assert.ok(/Do you expect anything in return for referrals\?/.test(stripped), 'return question');

console.log('referral-partner checks passed');
