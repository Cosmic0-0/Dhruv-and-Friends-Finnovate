// Final error-handling middleware (4-arg, registered after every route it
// catches - see src/index.js). Without it, a body that fails express.json()
// parsing falls through to Express's default handler, which returns an HTML
// stack trace with absolute filesystem paths (a regression caught during the
// first QA pass). Kept in its own module so route tests can mount it.

// Express only treats a 4-argument function as error middleware, so `next`
// stays in the signature although it is unused.
export function jsonErrorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "invalid JSON body" });
  }
  // A body over a route's express.json() limit (e.g. an oversized document
  // upload). Generic on purpose: the limit itself is documented per route.
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "request body is too large" });
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}
