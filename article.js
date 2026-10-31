// Los Santos News — Canonical Permalink Forwarder
(function() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('p') || params.get('id');
  if (id) {
    window.location.replace(`index.html?p=${encodeURIComponent(id)}`);
  } else {
    window.location.replace('index.html');
  }
})();
