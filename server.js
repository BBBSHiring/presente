import { createServer } from "http";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, createWriteStream } from "fs";
import { join, dirname } from "path";
import { parse } from "url";
import { createReadStream } from "fs";
import { fileURLToPath } from "url";
import Busboy from "busboy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3000");
const DATA_DIR = join(__dirname, ".data");
const DATA_FILE = join(DATA_DIR, "data.json");
const UPLOADS_DIR = join(DATA_DIR, "uploads");

// Ensure directories exist
try {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOADS_DIR, { recursive: true });
  console.log("Data directories ready:", DATA_DIR, UPLOADS_DIR);
} catch (err) {
  console.error("Failed to create data directories:", err);
}

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
  console.log(`${req.method} ${req.url}`);
  const url = parse(req.url, true);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Root
    if (pathname === "/") {
      return await serveStatic(req, res, join(__dirname, "public", "index.html"));
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
        } catch (err) {
          console.error("Error in /api/login:", err);
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
        } catch (err) {
          console.error("Error in /api/admin-login:", err);
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
        } catch (err) {
          console.error("Error in /api/progress:", err);
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
        } catch (err) {
          console.error("Error in /api/update-pin:", err);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false }));
        }
      });
      return;
    }

    // API: Upload video
    if (pathname === "/api/upload" && req.method === "POST") {
      try {
        const busboy = Busboy({ headers: req.headers });
        const destPath = join(UPLOADS_DIR, "presentation.mp4");
        let fileReceived = false;

        let writeStreamFinished = false;
        let busboyFinished = false;
        let writeStreamError = null;

        function tryRespond() {
          if (!busboyFinished || !writeStreamFinished) return;
          if (res.headersSent) return;
          if (writeStreamError) {
            console.error("Error writing uploaded file:", writeStreamError);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Failed to save file" }));
            return;
          }
          if (fileReceived) {
            console.log("File successfully written to disk:", destPath);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "No file provided" }));
          }
        }

        busboy.on("file", (_fieldname, fileStream, _info) => {
          fileReceived = true;
          console.log("Receiving file, writing to:", destPath);
          const writeStream = createWriteStream(destPath);
          fileStream.pipe(writeStream);

          writeStream.on("finish", () => {
            console.log("writeStream finished, file fully written to disk");
            writeStreamFinished = true;
            tryRespond();
          });

          writeStream.on("error", (err) => {
            writeStreamError = err;
            writeStreamFinished = true;
            fileStream.resume();
            tryRespond();
          });
        });

        busboy.on("finish", () => {
          console.log("Busboy finished parsing upload");
          busboyFinished = true;
          if (!fileReceived) {
            writeStreamFinished = true;
          }
          tryRespond();
        });

        busboy.on("error", (err) => {
          console.error("Busboy error during upload:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Upload parsing failed" }));
          }
        });

        req.pipe(busboy);
      } catch (err) {
        console.error("Error in /api/upload:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Upload failed" }));
        }
      }
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

    // Health check
    if (pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  } catch (err) {
    console.error(`Unhandled error for ${req.method} ${req.url}:`, err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

try {
  await initData();
  console.log("Data initialized successfully");
} catch (err) {
  console.error("Failed to initialize data:", err);
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("exit", (code) => {
  console.log("Process exiting with code:", code);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Présente running on port ${PORT}`);
});
