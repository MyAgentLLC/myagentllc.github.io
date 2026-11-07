var assert = require('assert');
var safeHTML = require('../js/safe-html.js').safeHTML;

function anchors(html) {
  var out = [];
  var re = /<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = re.exec(html))) out.push({ href: m[1], html: m[0] });
  return out;
}
function decodeAttr(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|lt|gt|apos);/gi, function (all, ent) {
    var e = ent.toLowerCase();
    if (e === 'amp') return '&';
    if (e === 'quot') return '"';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'apos') return "'";
    return all;
  });
}
function assertNoActiveMarkup(html) {
  assert.ok(!/<(script|img|svg|iframe|object|embed|link|style|meta|form|video|audio|math)\b/i.test(html), html);
  assert.ok(!/<\s*(b|i|br|a)\b[^>]*\son[a-z]+\s*=/i.test(html), html);
  anchors(html).forEach(function (a) {
    var href = decodeAttr(a.href);
    assert.ok(!/^\s*(javascript|data|vbscript|blob|file):/i.test(href), href);
    assert.ok(href.indexOf('"') === -1 && href.indexOf('<') === -1, href);
    assert.ok(
      /^mailto:/i.test(href) ||
      /^https:\/\/(?:www\.)?myagent\.company(?:[\/?#]|$)/i.test(href) ||
      /^\//.test(href) ||
      /^(\.\/)?[A-Za-z0-9]/.test(href),
      href
    );
  });
}

var cases = [
  ['plain text', 'Hello there', 'Hello there'],
  ['ampersand', 'a & b', 'a &amp; b'],
  ['bold italic break', 'Hi <b>bold</b> <i>it</i><br>next', 'Hi <b>bold</b> <i>it</i><br>next'],
  ['script', '<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['script mixed with bold', 'Hi <b>ok</b><script>alert(1)</script>', 'Hi <b>ok</b>&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['img handler', '<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
  ['svg onload', '<svg onload=alert(1)></svg>', '&lt;svg onload=alert(1)&gt;&lt;/svg&gt;'],
  ['b with handler', '<b onclick="alert(1)">x</b>', '&lt;b onclick="alert(1)"&gt;x</b>'],
  ['javascript url', '<a href="javascript:alert(1)">click</a>', '&lt;a href="javascript:alert(1)"&gt;click&lt;/a&gt;'],
  ['javascript single quote', "<a href='javascript:alert(1)'>click</a>", "&lt;a href='javascript:alert(1)'&gt;click&lt;/a&gt;"],
  ['data url', '<a href="data:text/html,<script>alert(1)</script>">x</a>', null],
  ['vbscript', '<a href="vbscript:msgbox(1)">x</a>', '&lt;a href="vbscript:msgbox(1)"&gt;x&lt;/a&gt;'],
  ['protocol relative', '<a href="//evil.example/">x</a>', '&lt;a href="//evil.example/"&gt;x&lt;/a&gt;'],
  ['external https', '<a href="https://evil.example/">x</a>', '&lt;a href="https://evil.example/"&gt;x&lt;/a&gt;'],
  ['lookalike host', '<a href="https://myagent.company.evil.example/">x</a>', '&lt;a href="https://myagent.company.evil.example/"&gt;x&lt;/a&gt;'],
  ['userinfo host', '<a href="https://evil.example@myagent.company/">x</a>', '&lt;a href="https://evil.example@myagent.company/"&gt;x&lt;/a&gt;'],
  ['http same host', '<a href="http://myagent.company/">x</a>', '&lt;a href="http://myagent.company/"&gt;x&lt;/a&gt;'],
  ['mailto', '<a href="mailto:myagentllc2026@inkboxmail.com">email</a>', '<a href="mailto:myagentllc2026@inkboxmail.com" rel="noopener">email</a>'],
  ['mailto single quotes', "<a href='mailto:myagentllc2026@inkboxmail.com'>email</a>", '<a href="mailto:myagentllc2026@inkboxmail.com" rel="noopener">email</a>'],
  ['same site', '<a href="https://myagent.company/questionnaire.html">form</a>', '<a href="https://myagent.company/questionnaire.html" rel="noopener">form</a>'],
  ['apex no path', '<a href="https://myagent.company">home</a>', '<a href="https://myagent.company" rel="noopener">home</a>'],
  ['www', '<a href="https://www.myagent.company/privacy.html">privacy</a>', '<a href="https://www.myagent.company/privacy.html" rel="noopener">privacy</a>'],
  ['relative file', '<a href="questionnaire.html">form</a>', '<a href="questionnaire.html" rel="noopener">form</a>'],
  ['root relative', '<a href="/privacy.html">privacy</a>', '<a href="/privacy.html" rel="noopener">privacy</a>'],
  ['dot relative', '<a href="./terms.html">terms</a>', '<a href="./terms.html" rel="noopener">terms</a>'],
  ['query amp', '<a href="https://myagent.company/a?b=1&c=2">q</a>', '<a href="https://myagent.company/a?b=1&amp;c=2" rel="noopener">q</a>'],
  ['link text escaped', '<a href="https://myagent.company/">hi <script>alert(1)</script></a>', '<a href="https://myagent.company/" rel="noopener">hi &lt;script&gt;alert(1)&lt;/script&gt;</a>'],
  ['link with bold', '<a href="mailto:myagentllc2026@inkboxmail.com"><b>email</b></a>', '<a href="mailto:myagentllc2026@inkboxmail.com" rel="noopener"><b>email</b></a>'],
  ['extra attr', '<a href="https://myagent.company/" onclick="alert(1)">x</a>', '&lt;a href="https://myagent.company/" onclick="alert(1)"&gt;x&lt;/a&gt;'],
  ['entity breakout', '<a href="https://myagent.company/&quot;onclick=&quot;alert(1)">x</a>', '<a href="https://myagent.company/&amp;quot;onclick=&amp;quot;alert(1)" rel="noopener">x</a>'],
  ['unquoted href', '<a href=https://myagent.company/>x</a>', '&lt;a href=https://myagent.company/&gt;x&lt;/a&gt;'],
  ['unclosed anchor', '<a href="https://myagent.company/">no close', '&lt;a href="https://myagent.company/"&gt;no close'],
  ['br variants', 'a<br>b<br/>c<br />d', 'a<br>b<br>c<br>d'],
  ['closing tags', '<b>x</b><i>y</i>', '<b>x</b><i>y</i>'],
  ['malformed nest', '<b><i>x</b></i>', '<b><i>x</b></i>'],
  ['comment script', '<!--<script>alert(1)</script>-->', '&lt;!--&lt;script&gt;alert(1)&lt;/script&gt;--&gt;'],
  ['null bytes in tag', '<scr\u0000ipt>alert(1)</scr\u0000ipt>', null]
];

cases.forEach(function (row) {
  var out = safeHTML(row[1]);
  assertNoActiveMarkup(out);
  if (row[2] != null) assert.strictEqual(out, row[2], row[0] + '\n' + out);
});

var breakout = safeHTML('<a href="https://myagent.company/&quot;onclick=&quot;alert(1)">x</a>');
assert.ok(!/<a\b[^>]*\son[a-z]+=/i.test(breakout), breakout);
assert.ok(decodeAttr(anchors(breakout)[0].href).indexOf('"') === -1, breakout);

var parent = safeHTML('<a href="https://notmyagent.company/">x</a>');
assert.ok(parent.indexOf('<a ') === -1, parent);

console.log('safe-html tests passed (' + cases.length + ' cases)');
