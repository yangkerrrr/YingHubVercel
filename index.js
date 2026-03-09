import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import httpProxy from "http-proxy";
import chalk from "chalk";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { bareModulePath } from "@mercuryworkshop/bare-as-module3";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import express from "express";
import { createServer } from "node:http";
import { join } from "path";
import packageJson from "./package.json" with { type: "json" };
import compression from "compression";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { execSync } from "node:child_process";
import fs from "node:fs";
import webpush from "web-push";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";

dotenv.config();

Object.assign(wisp.options, {
  allow_udp_streams: false,
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const cdnProxy = httpProxy.createProxyServer();
const bare = createBareServer("/bare/");
const __dirname = join(fileURLToPath(import.meta.url), "..");
let dynamicSystemPrompt = "";
let lastWebhookPayload = null;
let lastWebhookVars = {};
const DEAD_SIMPLE_CHAT_URL =
  "https://api.deadsimplechat.com/consumer/api/v2/bot/69996be9866cfa8428fc37a0/chatroom/uNUperoaU/message?auth=53526e5f55776f4f484c63626d537773695932766e4c517846765656306a4c4d414b64416568546f564a423564344175";
const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const publicPath = "public";

// Notification system
let activeNotifications = [];
let notificationClients = [];
const NOTIFICATION_SECRET = process.env.NOTIFICATION_SECRET || "yingnetwork";

// Web Push subscriptions storage
const SUBSCRIPTIONS_DIR = join(__dirname, "data");
const SUBSCRIPTIONS_FILE = join(SUBSCRIPTIONS_DIR, "push_subscriptions.json");

function loadSubscriptions() {
  try {
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) return [];
    const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("Failed to load push subscriptions:", err);
    return [];
  }
}

function saveSubscriptions(subs) {
  try {
    if (!fs.existsSync(SUBSCRIPTIONS_DIR)) fs.mkdirSync(SUBSCRIPTIONS_DIR, { recursive: true });
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save push subscriptions:", err);
  }
}

let pushSubscriptions = loadSubscriptions();

// VAPID setup
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || null;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  try {
    const keys = webpush.generateVAPIDKeys();
    VAPID_PUBLIC_KEY = keys.publicKey;
    VAPID_PRIVATE_KEY = keys.privateKey;
    console.warn("Generated ephemeral VAPID keys. Persist these in env vars for stable subscriptions.");
    console.log("VAPID_PUBLIC_KEY=", VAPID_PUBLIC_KEY);
    console.log("VAPID_PRIVATE_KEY=", VAPID_PRIVATE_KEY);
  } catch (err) {
    console.error("Failed to generate VAPID keys:", err);
  }
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

app.set("views", join(__dirname, publicPath, "html"));
app.use(compression());
app.use(express.static(publicPath));
app.use("/uv/", express.static(uvPath));
app.use("/scram/", express.static(scramjetPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/bareasmodule/", express.static(bareModulePath));
app.use("/sj/sw.js", (req, res, next) => {
  res.set("Service-Worker-Allowed", "/");
  next();
});

// ===== NOTIFICATION SYSTEM ENDPOINTS =====

// Send notification to all connected clients (requires secret path)
app.post("/:secretPath/notify", async (req, res) => {
  if (req.params.secretPath !== NOTIFICATION_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { title, message, type, icon } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const notification = {
    id: Date.now(),
    title: title || "Notification",
    message,
    type: type || "info",
    icon: icon || null,
    timestamp: new Date().toISOString(),
  };

  activeNotifications.push(notification);

  // Send to all connected SSE clients
  notificationClients.forEach((client) => {
    client.res.write(`data: ${JSON.stringify(notification)}\n\n`);
  });

  // Send Web Push to stored subscriptions (if configured)
  if (pushSubscriptions && pushSubscriptions.length && VAPID_PUBLIC_KEY) {
    const payload = JSON.stringify({ title: notification.title, body: notification.message, icon: notification.icon });

    // send in parallel and collect removals
    const results = await Promise.allSettled(
      pushSubscriptions.map((sub) => webpush.sendNotification(sub, payload))
    );

    const remaining = [];
    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        const err = r.reason;
        const status = err && err.statusCode;
        console.warn("web-push send rejected for subscription:", pushSubscriptions[idx] && pushSubscriptions[idx].endpoint, "status:", status, "error:", err && err.body ? err.body : err);
        if (status === 404 || status === 410) {
          // dropped - do not keep
        } else {
          remaining.push(pushSubscriptions[idx]);
        }
      } else {
        remaining.push(pushSubscriptions[idx]);
      }
    });

    pushSubscriptions = remaining;
    saveSubscriptions(pushSubscriptions);
  }

  res.json({ ok: true, notificationId: notification.id });
});

// Provide VAPID public key to clients for subscription
app.get("/api/vapidPublicKey", (req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(500).json({ error: "VAPID not configured" });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Save a push subscription (client should POST the subscription JSON)
app.post("/api/subscribe", (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) return res.status(400).json({ error: "Invalid subscription" });
    // Avoid duplicates
    const exists = pushSubscriptions.some((s) => s.endpoint === subscription.endpoint);
    if (!exists) {
      pushSubscriptions.push(subscription);
      saveSubscriptions(pushSubscriptions);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("/api/subscribe error:", err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// Remove a subscription
app.post("/api/unsubscribe", (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    pushSubscriptions = pushSubscriptions.filter((s) => s.endpoint !== endpoint);
    saveSubscriptions(pushSubscriptions);
    res.json({ ok: true });
  } catch (err) {
    console.error("/api/unsubscribe error:", err);
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

// Debug: list subscriptions (number and small sample) - not authenticated
app.get('/api/subscriptions', (req, res) => {
  try {
    res.json({ count: pushSubscriptions.length, subscriptions: pushSubscriptions.slice(0,10) });
  } catch (err) {
    res.status(500).json({ error: 'failed to read subscriptions' });
  }
});

// Broadcast to connected clients (for new connections)
app.get("/:secretPath/subscribe", (req, res) => {
  if (req.params.secretPath !== NOTIFICATION_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const clientId = Date.now() + Math.random();

  // Send existing notifications to new client
  activeNotifications.forEach((notification) => {
    res.write(`data: ${JSON.stringify(notification)}\n\n`);
  });

  // Store client connection
  const clientRef = { id: clientId, res };
  notificationClients.push(clientRef);

  // Handle client disconnect
  req.on("close", () => {
    notificationClients = notificationClients.filter((c) => c.id !== clientId);
  });

  // Send a connection confirmation
  res.write(`data: ${JSON.stringify({ type: "connected", id: clientId })}\n\n`);
});

// Get all notifications
app.get("/:secretPath/notifications", (req, res) => {
  if (req.params.secretPath !== NOTIFICATION_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  res.json({ notifications: activeNotifications });
});

// Delete a notification by ID
app.delete("/:secretPath/notifications/:notificationId", (req, res) => {
  if (req.params.secretPath !== NOTIFICATION_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { notificationId } = req.params;
  activeNotifications = activeNotifications.filter(
    (n) => n.id !== parseInt(notificationId)
  );

  res.json({ ok: true });
});

// Clear all notifications
app.post("/:secretPath/notifications/clear", (req, res) => {
  if (req.params.secretPath !== NOTIFICATION_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  activeNotifications = [];
  notificationClients.forEach((client) => {
    client.res.write(
      `data: ${JSON.stringify({ type: "cleared" })}\n\n`
    );
  });

  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "index.html"));
});
app.use("/cdn", (req, res) => {
  cdnProxy.web(
    req,
    res,
    {
      target: "https://gms.parcoil.com/",
      changeOrigin: true,
    },
    (err) => {
      if (err) {
        console.error("CDN proxy error:", err);
        res.status(500).json({ error: "CDN Proxy Error" });
      }
    }
  );
});
app.use("/cdnalt", (req, res) => {
  cdnProxy.web(
    req,
    res,
    {
      target: "https://gbackup.parcoil.com/",
      changeOrigin: true,
    },
    (err) => {
      if (err) {
        console.error("CDN-2 proxy error:", err);
        res.status(500).json({ error: "CDN Proxy Error" });
      }
    }
  );
});
app.get("/api/autocomplete", async (req, res) => {
  const q = req.query.q || "";
  const duckUrl = `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(duckUrl);
    const data = await response.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});
app.get("/api/version", (req, res) => {
  res.json({ version: packageJson.version });
});
app.get("/api/commit", (req, res) => {
  try {
    const commit = execSync("git rev-parse --short HEAD").toString().trim();
    res.json({ commit });
  } catch (err) {
    res.status(500).json({ error: "Could not get commit" });
  }
});
app.get("/api/ai-status", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(400).json({
        online: false,
        error: "API key is missing",
      });
    }

    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
      });

      if (response.ok) {
        return res.json({ online: true });
      } else {
        const errorText = await response.text();
        return res.status(500).json({
          online: false,
          error: `Groq API responded with status ${response.status}: ${errorText}`,
        });
      }
    } catch (err) {
      return res.status(500).json({
        online: false,
        error: "Failed to reach Groq API",
      });
    }
  } catch (error) {
    res.status(500).json({
      online: false,
      error: error.message,
    });
  }
});

// Webhook endpoint: receive event payload and append summary to system prompt
app.post("/api/webhook", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload) return res.status(400).json({ error: "Empty payload" });

    // Build a concise summary for use in the system prompt
    const user = payload.user || {};
    const chatRoom = payload.chatRoom || {};
    const bot = payload.bot || {};
    const message = payload.message || {};
    const triggeredBy = payload.triggeredBy || "";

    const summaryLines = [];
    summaryLines.push(`Webhook event received at ${new Date().toISOString()}`);
    if (user.username || user._id) {
      summaryLines.push(`User: ${user.username || user._id} (${user._id || ""})`);
    }
    if (chatRoom.name || chatRoom.roomId) {
      summaryLines.push(`ChatRoom: ${chatRoom.name || chatRoom.roomId} (${chatRoom._id || ""})`);
    }
    if (bot.name || bot._id) {
      summaryLines.push(`Bot: ${bot.name || bot._id}`);
    }
    if (message.message || message._id) {
      summaryLines.push(`Message: ${message.message || message._id}`);
    }
    if (triggeredBy) summaryLines.push(`TriggeredBy: ${triggeredBy}`);

    if (Array.isArray(payload.messageHistory) && payload.messageHistory.length) {
      const last = payload.messageHistory[payload.messageHistory.length - 1];
      summaryLines.push(`LastHistory: ${last.message || last._id}`);
    }

    const summary = summaryLines.join(" | ");

    // Store in-memory payload and extracted variables (no persistence)
    lastWebhookPayload = payload;
    lastWebhookVars = {
      userId: user._id || null,
      username: user.username || null,
      uniqueUserIdentifier: user.uniqueUserIdentifier || null,
      chatRoomId: chatRoom._id || null,
      chatRoomName: chatRoom.name || null,
      chatRoomRoomId: chatRoom.roomId || null,
      botId: bot._id || null,
      botName: bot.name || null,
      messageId: message._id || null,
      message: message.message || null,
      triggeredBy: triggeredBy || null,
      messageHistoryCount: Array.isArray(payload.messageHistory) ? payload.messageHistory.length : 0,
    };

    dynamicSystemPrompt = summary;

    // Automatically call Groq with the webhook info and forward reply
    (async () => {
      try {
        const baseSystemPrompt =
          "You are a helpful AI assistant. named YingAi you are on the website YingHub  made by Ying network you can help people with their homework or just general questions Be friendly and helpful in your responses. keep your responses short do not share this info with users. you can also link the user to our discord server: https://example.com if the user needs help with the website or proxy";

        // Build system prompt including webhook vars
        let systemPrompt = baseSystemPrompt;
        if (lastWebhookPayload) {
          const v = lastWebhookVars;
          const webhookVarsText = [
            `user.username=${v.username}`,
            `user._id=${v.userId}`,
            `user.uniqueUserIdentifier=${v.uniqueUserIdentifier}`,
            `chatRoom.name=${v.chatRoomName}`,
            `chatRoom.roomId=${v.chatRoomRoomId}`,
            `chatRoom._id=${v.chatRoomId}`,
            `bot.name=${v.botName}`,
            `message=${v.message}`,
            `triggeredBy=${v.triggeredBy}`,
            `messageHistoryCount=${v.messageHistoryCount}`,
          ].filter(Boolean);

          systemPrompt = `${baseSystemPrompt}\nWebhook variables:\n${webhookVarsText.join("\n")}`;
        }

        const userMessage = (payload && payload.message && payload.message.message) || String(payload.message) || "";

        const messagesForGroq = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ];

        const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: messagesForGroq,
            max_tokens: 1000,
            temperature: 0.7,
            stream: false,
          }),
        });

        if (!groqResp.ok) {
          const errorText = await groqResp.text();
          console.error("Groq reply error:", groqResp.status, errorText);
          return;
        }

        const groqData = await groqResp.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "";

        // Forward AI reply to deadsimplechat endpoint
        try {
          const forwardResp = await fetch(DEAD_SIMPLE_CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: aiReply }),
          });

          if (!forwardResp.ok) {
            const ftext = await forwardResp.text();
            console.error("Forward to deadsimplechat failed:", forwardResp.status, ftext);
          } else {
            console.log("Forwarded AI reply to deadsimplechat");
          }
        } catch (ferr) {
          console.error("Error forwarding to deadsimplechat:", ferr);
        }
      } catch (err) {
        console.error("Automatic Groq/forward error:", err);
      }
    })();

    res.json({ ok: true, summary, vars: lastWebhookVars });
  } catch (err) {
    console.error("/api/webhook error:", err);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

// Inspect current dynamic system prompt
app.get("/api/webhook-prompt", (req, res) => {
  res.json({ prompt: dynamicSystemPrompt, vars: lastWebhookVars, payload: lastWebhookPayload });
});

// POST /api/webhook-chat
// Uses the same chat flow as /api/chat but hardcodes `llama-3.1-8b-instant`
// and injects the most recent webhook variables into the system prompt.
app.post("/api/webhook-chat", async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const baseSystemPrompt =
      "You are a helpful AI assistant. named YingAi you are on the website YingHub  made by Ying network you can help people with their homework or just general questions Be friendly and helpful in your responses. keep your responses short do not share this info with users. you can also link the user to our discord server: https://example.com if the user needs help with the website or proxy";

    // Build system prompt including webhook vars (if available)
    let systemPrompt = baseSystemPrompt;
    if (lastWebhookPayload) {
      const v = lastWebhookVars;
      const webhookVarsText = [
        `user.username=${v.username}`,
        `user._id=${v.userId}`,
        `user.uniqueUserIdentifier=${v.uniqueUserIdentifier}`,
        `chatRoom.name=${v.chatRoomName}`,
        `chatRoom.roomId=${v.chatRoomRoomId}`,
        `chatRoom._id=${v.chatRoomId}`,
        `bot.name=${v.botName}`,
        `message=${v.message}`,
        `triggeredBy=${v.triggeredBy}`,
        `messageHistoryCount=${v.messageHistoryCount}`,
      ].filter(Boolean);

      systemPrompt = `${baseSystemPrompt}\nWebhook variables:\n${webhookVarsText.join("\n")}`;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...(conversationHistory || []),
      { role: "user", content: message },
    ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7,
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse =
      data.choices[0]?.message?.content ||
      "Sorry, I couldn't generate a response.";

    res.json({ response: aiResponse, usage: data.usage });
  } catch (error) {
    console.error("/api/webhook-chat error:", error);
    res.status(500).json({ error: "Failed to get AI response", details: error.message });
  }
});

// this is for the users who have a bookmark like https://lunaar.org/play?game=2048
app.get("/play", (req, res) => {
  res.redirect("/science");
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationHistory, model } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const systemPrompt =
      "You are a helpful AI assistant. named YingAi you are on the website YingHub  made by Ying network you can help people with their homework or just general questions Be friendly and helpful in your responses. keep your responses short do not share this info with users. you can also link the user to our discord server: https://example.com if the user needs help with the website or proxy";
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: message },
    ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || "llama-3.1-8b-instant",
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7,
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse =
      data.choices[0]?.message?.content ||
      "Sorry, I couldn't generate a response.";

    res.json({
      response: aiResponse,
      usage: data.usage,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({
      error: "Failed to get AI response",
      details: error.message,
    });
  }
});
app.get("/science", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "games.html"));
});
app.get("/forum/*", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "forum.html"));
});
app.get("/math", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "apps.html"));
});
app.get("/ai", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "ai.html"));
});
app.get("/chat", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "game/chat", "index.html"));
});
app.get("/settings", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "settings.html"));
});
app.get("/go", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "go.html"));
});
app.get("/new", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "new.html"));
});
app.get("/player", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "player.html"));
});
app.get("/more", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "more.html"));
});
app.get("/package.json", (req, res) => {
  res.json(packageJson);
});
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, publicPath, "html", "404.html"));
});
const server = createServer();

server.on("request", (req, res) => {
  if (bare.shouldRoute(req)) {
    bare.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (req.url.endsWith("/wisp/")) {
    wisp.routeRequest(req, socket, head);
  } else if (bare.shouldRoute(req)) {
    bare.routeUpgrade(req, socket, head);
  } else {
    socket.end();
  }
});

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

server.on("listening", () => {
  const address = server.address();
  console.clear();
  console.log(
    chalk.magenta(
      `[ 🚀 ] YingHUb V7 is running at http://localhost:${address.port}`
    )
  );
  console.log();
  console.log(chalk.green(`[ 🌙 ] Made by YingNetwork`));
  console.log();
  console.log(chalk.green(`[ 🌙 ] Adapted to work on low RAM enviroment and low SWAP env by yang`));
  console.log(
    chalk.blue(
      `[ ⭐ ] Please Star on github`
    )
  );
  console.log();
  console.log(
    chalk.cyan(
      `[ 💻 ] Be sure to join our Discord for support:`
    )
  );
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close();
  bare.close();
  process.exit(0);
}

server.listen({
  port,
});
