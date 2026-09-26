// Resolve a CORS allow-list from a comma-separated env var.
//
// The `cors` package treats an array origin as an EXACT-match allow-list, so a
// wildcard configured as the string "*" becomes the array ["*"], which matches no
// real origin and silently drops every CORS header. The server still boots and
// health checks still pass; only browser requests fail.
//
//   "" | "*"      -> reflect the requesting origin
//   "a.com,b.com" -> exact allow-list
export function buildCorsOptions(raw, { credentials = false } = {}) {
  const list = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length === 0 || list.includes('*')) {
    return { origin: (origin, cb) => cb(null, true), credentials };
  }
  return { origin: list, credentials };
}
