import http from "node:http";
import { ensureProfile, listSessions } from "./core.mjs";

function escape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export async function startGui(profileDir, port = 8787) {
  const server = http.createServer(async (_req, res) => {
    try {
      const profile = await ensureProfile(profileDir);
      const sessions = await listSessions(profileDir);
      const rows = sessions.length ? sessions.map((session) => `<article><div><strong>Сравнение двух файлов</strong><small>${escape(new Date(session.createdAt).toLocaleString("ru-RU"))}</small></div><span>${escape(session.changes)} отличий</span><code>${escape(session.output)}</code></article>`).join("") : "<p class=empty>Сессий пока нет. Выполните задачу в терминале.</p>";
      const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Маняша</title><style>:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#080b13;color:#f5f7fb}*{box-sizing:border-box}body{margin:0}main{max-width:980px;margin:auto;padding:32px 20px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:32px}h1{margin:0;font-size:28px}p{color:#aab3c3}.badge{padding:8px 12px;border-radius:999px;background:#113339;color:#3ee5ec;font-weight:700}section{padding:22px;border:1px solid #263044;border-radius:20px;background:#101622}article{display:grid;grid-template-columns:1fr auto;gap:10px;padding:16px 0;border-bottom:1px solid #263044}article:last-child{border:0}small,code{display:block;color:#aab3c3;margin-top:6px}code{grid-column:1/-1;overflow-wrap:anywhere}.empty{margin:0}@media(max-width:560px){header{align-items:flex-start;flex-direction:column}article{grid-template-columns:1fr}}</style></head><body><main><header><div><h1>Маняша</h1><p>Тот же локальный профиль, что использует терминал</p></div><span class=badge>Источник: ${escape(profile.provider)}</span></header><section><h2>Последние результаты</h2>${rows}</section></main></body></html>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(html);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); res.end(error instanceof Error ? error.message : "gui_failed");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
