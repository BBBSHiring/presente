import { createServer } from "http";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { parse } from "url";
import { createReadStream } from "fs";

const PORT = parseInt(process.env.PORT || "3000");
const DATA_DIR = "/app";
const DATA_FILE = join(DATA_DIR, "data.json");
const UPLOADS_DIR = join(DATA_DIR, "uploads");

// Ensure directories exist
await mkdir(DATA_DIR, { recursive: true });
await mkdir(UPLOADS_DIR, { recursive: true });

// Initialize data.json if it doesn't exist
async function initData() {
  if (!existsSync(DATA_FILE)) {
    const defaultData = {
      adminPassword: "admin123",
      viewerPin: "2024",
      viewers: {},
    };
    await writeFile(DATA_FILE, JSON.stringify(defaultData, null, 2));
  }
}

async function getData() {
  try {
    const content = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { adminPassword: "admin123", viewerPin: "2024", viewers: {} };
  }
}

async function saveData(data) {
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Serve static files
async function serveStatic(req, res, filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
}

// Main server
const server = createServer(async (req, res) => {
  const url = parse(req.url, true);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Root
  if (pathname === "/") {
    return serveStatic(req, res, join(DATA_DIR, "public", "index.html"));
  }

  // API: Get data
  if (pathname === "/api/data" && req.method === "GET") {
    const data = await getData();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
    return;
  }

  // API: Login (viewer)
  if (pathname === "/api/login" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { name, pin } = JSON.parse(body);
        const data = await getData();
        if (pin === data.viewerPin) {
          const viewerId = Date.now().toString();
          data.viewers[viewerId] = {
            name,
            loginTime: new Date().toISOString(),
            progress: 0,
            watchTime: 0,
            completed: false,
          };
          await saveData(data);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, viewerId }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Invalid PIN" }));
        }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Bad request" }));
      }
    });
    return;
  }

  // API: Admin login
  if (pathname === "/api/admin-login" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { password } = JSON.parse(body);
        const data = await getData();
        if (password === data.adminPassword) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Invalid password" }));
        }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Bad request" }));
      }
    });
    return;
  }

  // API: Update viewer progress
  if (pathname === "/api/progress" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { viewerId, progress, watchTime, completed } = JSON.parse(body);
        const data = await getData();
        if (data.viewers[viewerId]) {
          data.viewers[viewerId].progress = progress;
          data.viewers[viewerId].watchTime = watchTime;
          data.viewers[viewerId].completed = completed;
          await saveData(data);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false }));
      }
    });
    return;
  }

  // API: Get viewers (admin)
  if (pathname === "/api/viewers" && req.method === "GET") {
    const data = await getData();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data.viewers));
    return;
  }

  // API: Update PIN (admin)
  if (pathname === "/api/update-pin" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { newPin } = JSON.parse(body);
        const data = await getData();
        data.viewerPin = newPin;
        await saveData(data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false }));
      }
    });
    return;
  }

  // API: Upload video
  if (pathname === "/api/upload" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Video file
  if (pathname === "/video" && req.method === "GET") {
    const videoPath = join(UPLOADS_DIR, "presentation.mp4");
    if (existsSync(videoPath)) {
      const stream = createReadStream(videoPath);
      res.writeHead(200, { "Content-Type": "video/mp4" });
      stream.pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Video not found");
    }
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

await initData();
server.listen(PORT, () => {
  console.log(`Présente running on port ${PORT}`);
});
