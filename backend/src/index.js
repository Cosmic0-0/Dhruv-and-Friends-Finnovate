import express from "express";

const app = express();
app.use(express.json());

// Owned by the backend owner — see ../../CLAUDE.md#role-gating
// Route handlers live in ./routes, business logic in ./services, wire them up here.

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`fraudlens-backend listening on :${port}`);
});
