const WebSocket = require("ws");
const http = require("http");

const TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK = "http://n8n.mobilocdev.com/webhook/discord-reaction";
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

let ws = null;
let heartbeatInterval = null;
let sequence = null;
let sessionId = null;

let isConnecting = false;
let reconnectAttempts = 0;

// ========================
// Utils
// ========================
function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function startHeartbeat(interval) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  heartbeatInterval = setInterval(() => {
    send({ op: 1, d: sequence });
  }, interval);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
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
      "Content-Length": Buffer.byteLength(body),
    },
  }, (res) => {
    console.log("n8n status:", res.statusCode);
  });

  req.on("error", (e) => console.error("Webhook error:", e));
  req.write(body);
  req.end();
}

// ========================
// Gateway Logic
// ========================
function identify() {
  send({
    op: 2,
    d: {
      token: TOKEN,
      intents: (1 << 0) | (1 << 9) | (1 << 10),
      properties: {
        $os: "linux",
        $browser: "mobibot",
        $device: "mobibot",
      },
    },
  });
}

function resume() {
  send({
    op: 6,
    d: {
      token: TOKEN,
      session_id: sessionId,
      seq: sequence,
    },
  });
}

// ========================
// Conexão
// ========================
function connect() {
  if (isConnecting) return;

  isConnecting = true;
  console.log("🔌 Conectando ao Discord...");

  ws = new WebSocket(GATEWAY_URL);

  ws.on("open", () => {
    console.log("✅ Conectado ao Gateway Discord");
    isConnecting = false;
    reconnectAttempts = 0;
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);

    if (msg.s !== null) sequence = msg.s;

    console.log("📩 Evento:", msg.t, "| OP:", msg.op);

    switch (msg.op) {
      // HELLO
      case 10:
        startHeartbeat(msg.d.heartbeat_interval);

        if (sessionId) {
          console.log("♻️ Tentando RESUME...");
          resume();
        } else {
          console.log("🆕 IDENTIFY...");
          identify();
        }
        break;

      // DISPATCH
      case 0:
        if (msg.t === "READY") {
          sessionId = msg.d.session_id;
          console.log("🎉 Bot pronto!");
        }

        if (msg.t === "RESUMED") {
          console.log("✅ Sessão retomada com sucesso");
        }

        if (
          msg.t === "MESSAGE_REACTION_ADD" &&
          msg.d.emoji?.name === "✅"
        ) {
          console.log("👍 Reação detectada:", msg.d);
          callWebhook(msg.d);
        }
        break;

      // RECONNECT
      case 7:
        console.log("🔁 Discord pediu reconexão");
        ws.close();
        break;

      // INVALID SESSION
      case 9:
        console.log("❌ Sessão inválida, resetando...");
        sessionId = null;
        sequence = null;
        setTimeout(connect, 2000);
        break;

      // HEARTBEAT ACK
      case 11:
        // opcional logar
        break;
    }
  });

  ws.on("close", () => {
    console.log("⚠️ Conexão fechada");

    stopHeartbeat();
    isConnecting = false;

    reconnectWithBackoff();
  });

  ws.on("error", (err) => {
    console.error("❌ Erro WS:", err.message);
  });
}

// ========================
// Reconexão inteligente
// ========================
function reconnectWithBackoff() {
  reconnectAttempts++;

  const delay = Math.min(30000, 5000 * reconnectAttempts);

  console.log(`⏳ Reconectando em ${delay / 1000}s...`);

  setTimeout(() => {
    connect();
  }, delay);
}

// ========================
// Start
// ========================
connect();
