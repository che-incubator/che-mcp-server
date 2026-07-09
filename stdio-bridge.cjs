#!/usr/bin/env node

// Stdio MCP bridge for che-mcp-server.
// Launches oc port-forward, translates stdio JSON-RPC to HTTP, auto-restarts on failure.
//
// Usage:
//   claude mcp add --transport stdio che-mcp -- che-mcp-bridge
//
// Environment:
//   MCP_NAMESPACE  - Kubernetes namespace (default: from oc project)
//   MCP_SERVICE    - Service name (default: che-mcp-server)
//   MCP_PORT       - Service port (default: 8080)

const { spawn, execFileSync } = require('child_process');
const http = require('http');
const net = require('net');
const readline = require('readline');

const NAMESPACE = process.env.MCP_NAMESPACE || detectNamespace();
const SERVICE = process.env.MCP_SERVICE || 'che-mcp-server';
const SERVICE_PORT = parseInt(process.env.MCP_PORT || '8080', 10);
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

let localPort = 0;
let pfProcess = null;
let sessionId = null;
let restartCount = 0;
let shuttingDown = false;
let stdinClosed = false;

function detectNamespace() {
  try {
    return execFileSync('oc', ['project', '-q'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch (e) {
    process.stderr.write('[bridge] failed to detect namespace: ' + e.message + '\n');
    process.stderr.write('[bridge] set MCP_NAMESPACE environment variable or run oc login first\n');
    process.exit(1);
  }
}

function findFreePort() {
  return new Promise(function (resolve, reject) {
    var srv = net.createServer();
    srv.listen(0, function () {
      var port = srv.address().port;
      srv.close(function () { resolve(port); });
    });
    srv.on('error', reject);
  });
}

function waitForPort(port, timeoutMs) {
  var deadline = Date.now() + timeoutMs;
  return new Promise(function (resolve, reject) {
    function attempt() {
      if (Date.now() > deadline) return reject(new Error('port-forward not ready within ' + timeoutMs + 'ms'));
      var sock = net.createConnection({ host: '127.0.0.1', port: port }, function () {
        sock.destroy();
        resolve();
      });
      sock.on('error', function () {
        setTimeout(attempt, 200);
      });
    }
    attempt();
  });
}

async function startPortForward() {
  localPort = await findFreePort();

  pfProcess = spawn('oc', [
    'port-forward', 'svc/' + SERVICE,
    localPort + ':' + SERVICE_PORT,
    '-n', NAMESPACE
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  pfProcess.stdout.on('data', function () {});
  pfProcess.stderr.on('data', function (d) {
    process.stderr.write('[pf] ' + d);
  });

  pfProcess.on('exit', function (code) {
    if (shuttingDown) return;
    process.stderr.write('[bridge] port-forward exited (code ' + code + '), restarting...\n');
    restartCount++;
    if (restartCount > MAX_RESTARTS) {
      process.stderr.write('[bridge] too many restarts, giving up\n');
      process.exit(1);
    }
    setTimeout(function () { startPortForward().catch(function (e) { process.stderr.write('[bridge] restart failed: ' + e.message + '\n'); process.exit(1); }); }, RESTART_DELAY_MS);
  });

  await waitForPort(localPort, 10000);
  restartCount = 0;
  process.stderr.write('[bridge] connected via port-forward on localhost:' + localPort + ' -> ' + SERVICE + ':' + SERVICE_PORT + ' (ns: ' + NAMESPACE + ')\n');
}

function forwardRequest(message) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify(message);
    var headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    var req = http.request({
      hostname: '127.0.0.1',
      port: localPort,
      path: '/mcp',
      method: 'POST',
      headers: headers,
      timeout: REQUEST_TIMEOUT_MS,
    }, function (res) {
      if (res.headers['mcp-session-id']) sessionId = res.headers['mcp-session-id'];
      var ct = res.headers['content-type'] || '';

      if (ct.indexOf('text/event-stream') !== -1) {
        var buf = '';
        var lastPayload = null;
        res.on('data', function (chunk) {
          buf += chunk.toString();
          var parts = buf.split('\n\n');
          buf = parts.pop();
          for (var i = 0; i < parts.length; i++) {
            var lines = parts[i].split('\n');
            for (var j = 0; j < lines.length; j++) {
              if (lines[j].indexOf('data: ') === 0) {
                lastPayload = lines[j].slice(6);
              }
            }
          }
        });
        res.on('end', function () {
          resolve(lastPayload);
        });
      } else {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          resolve(Buffer.concat(chunks).toString() || null);
        });
      }
    });

    req.on('timeout', function () {
      req.destroy(new Error('request timed out after ' + REQUEST_TIMEOUT_MS + 'ms'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  process.stderr.write('[bridge] starting stdio bridge to ' + SERVICE + ' in namespace ' + NAMESPACE + '\n');
  await startPortForward();

  var rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  var queue = [];
  var processing = false;

  function enqueue(line) {
    queue.push(line);
    if (!processing) drain();
  }

  function drain() {
    if (queue.length === 0) {
      processing = false;
      if (stdinClosed) cleanup();
      return;
    }
    processing = true;
    var line = queue.shift();
    processLine(line).then(drain).catch(function (e) {
      process.stderr.write('[bridge] error: ' + e.message + '\n');
      drain();
    });
  }

  async function processLine(line) {
    if (!line.trim()) return;
    var message;
    try {
      message = JSON.parse(line);
    } catch (e) {
      process.stderr.write('[bridge] invalid JSON: ' + e.message + '\n');
      return;
    }
    var response = await forwardRequest(message);
    if (response && response.trim()) {
      process.stdout.write(response + '\n');
    }
  }

  rl.on('line', enqueue);
  rl.on('close', function () {
    stdinClosed = true;
    if (!processing && queue.length === 0) cleanup();
  });
}

function cleanup() {
  shuttingDown = true;
  if (pfProcess) pfProcess.kill();
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

main().catch(function (e) {
  process.stderr.write('[bridge] fatal: ' + e.message + '\n');
  process.exit(1);
});
