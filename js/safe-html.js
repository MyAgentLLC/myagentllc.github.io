/* Remote chat replies are untrusted. Allow only <b>, <i>, <br>, and links
   whose href is mailto or a same-site URL. Everything else stays escaped. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.safeHTML = api.safeHTML;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|lt|gt|apos);/gi, function (all, ent) {
      var e = ent.toLowerCase();
      if (e === 'amp') return '&';
      if (e === 'quot') return '"';
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'apos') return "'";
      var cp;
      if (e.charAt(1) === 'x') cp = parseInt(e.slice(2), 16);
      else cp = parseInt(e.slice(1), 10);
      if (!(cp >= 0 && cp <= 0x10FFFF)) return all;
      try { return String.fromCodePoint(cp); } catch (err) { return all; }
    });
  }
  function encodeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escapeText(h) {
    return String(h == null ? '' : h)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function safeHref(raw) {
    var href = decodeEntities(String(raw || ''));
    if (!href) return false;
    if (/[\u0000-\u001F\u007F\s<>"'`\\]/.test(href)) return false;
    if (/^mailto:/i.test(href)) return href.length > 'mailto:'.length;
    if (/^https:\/\/(?:www\.)?myagent\.company(?:[\/?#][A-Za-z0-9\-._~%!$&()*+,;=:@/?]*)?$/i.test(href)) return true;
    if (href.indexOf(':') !== -1 || href.indexOf('//') !== -1) return false;
    if (href.charAt(0) === '/') return true;
    if (href.indexOf('./') === 0) {
      var rest = href.replace(/^\.\/+/, '');
      return rest.length > 0 && rest.indexOf('..') !== 0 && rest.indexOf(':') === -1 && rest.indexOf('//') === -1;
    }
    return /^[A-Za-z0-9]/.test(href);
  }
  function safeHTML(h) {
    var s = escapeText(h);
    s = s.replace(/&lt;(\/?)(b|i|br)\s*\/?&gt;/gi, function (_, slash, tag) {
      return '<' + slash + tag.toLowerCase() + '>';
    });
    s = s.replace(/&lt;a\s+href=(?:"|&quot;|')([^"'<>]*?)(?:"|&quot;|')\s*&gt;([\s\S]*?)&lt;\/a&gt;/gi, function (full, href, text) {
      var decoded = decodeEntities(href);
      if (!safeHref(href)) return full;
      return '<a href="' + encodeAttr(decoded) + '" rel="noopener">' + text + '</a>';
    });
    return s;
  }
  return { safeHTML: safeHTML, safeHref: safeHref };
});
