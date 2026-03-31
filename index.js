const WebSocket = require("ws");
const http = require("http");
const TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK = "http://n8n.mobilocdev.com/webhook/discord-reaction";
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
let heartbeatInterval;
let sequence = null;

function send(ws, data) {
  ws.send(JSON.stringify(data));
}

function startHeartbeat(ws, interval) {
  heartbeatInterval = setInterval(() => {
    send(ws, { op: 1, d: sequence });
  }, interval);
}

function callWebhook(data) {
  const body = JSON.stringify(data);
  const url = new URL(N8N_WEBHOOK);
  const req = http.request({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body)
    }
  }, (res) => console.log("n8n status:", res.statusCode));
  req.on("error", (e) => console.error("Webhook error:", e));
  req.write(body);
  req.end();
}

function connect() {
  const ws = new WebSocket(GATEWAY_URL);
  ws.on("open", () => console.log("Conectado ao Gateway Discord"));
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);
    if (msg.s) sequence = msg.s;
    console.log("Evento recebido:", msg.t, msg.op);
    switch (msg.op) {
      case 10:
        startHeartbeat(ws, msg.d.heartbeat_interval);
        send(ws, {
          op: 2,
          d: {
            token: TOKEN,
            intents: (1 << 0) | (1 << 9) | (1 << 13),
            properties: {
              os: "linux",
              browser: "mobibot",
              device: "mobibot"
            }
          }
        });
        break;
      case 0:
        if (msg.t === "MESSAGE_REACTION_ADD" && msg.d.emoji?.name === "✅") {
          console.log("Reação ✅ detectada:", msg.d);
          callWebhook(msg.d);
        }
        break;
      case 7:
        ws.close();
        connect();
        break;
    }
  });
  ws.on("close", () => {
    clearInterval(heartbeatInterval);
    console.log("Desconectado, reconectando em 5s...");
    setTimeout(connect, 5000);
  });
  ws.on("error", (e) => console.error("WS error:", e));
}

connect();
