import { ToolingError } from './security.mjs';

export const DEFAULT_TIMEOUTS = Object.freeze({
  browserLaunchMs: 10000,
  cdpEndpointMs: 15000,
  gameTargetMs: 30000,
  gameOopifAttachMs: 10000,
  cdpCommandMs: 7000,
  reportFlushMs: 5000,
  shutdownMs: 7000,
});

export function withStageTimeout(value, {
  classification,
  timeoutMs,
  message = `${classification} after ${timeoutMs} ms`,
} = {}) {
  if (!classification || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('classification and a positive timeoutMs are required');
  }
  const promise = typeof value === 'function' ? Promise.resolve().then(value) : Promise.resolve(value);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ToolingError(classification, message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function waitForCondition(predicate, {
  classification,
  timeoutMs,
  intervalMs = 25,
} = {}) {
  if (!classification || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('classification and a positive timeoutMs are required');
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const value = await predicate();
    if (value) return value;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
  throw new ToolingError(classification, `${classification} after ${timeoutMs} ms`);
}

export class CdpConnection {
  constructor(url, {
    commandTimeoutMs = DEFAULT_TIMEOUTS.cdpCommandMs,
    openTimeoutMs = DEFAULT_TIMEOUTS.cdpEndpointMs,
    WebSocketImpl = WebSocket,
    onListenerError = () => {},
  } = {}) {
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.commandTimeoutMs = commandTimeoutMs;
    this.onListenerError = onListenerError;
    this.socket = new WebSocketImpl(url);
    const opened = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new ToolingError('CDP_ENDPOINT_TIMEOUT', 'CDP WebSocket failed to open')), { once: true });
    });
    this.ready = withStageTimeout(opened, {
      classification: 'CDP_ENDPOINT_TIMEOUT',
      timeoutMs: openTimeoutMs,
      message: 'CDP WebSocket did not open before timeout',
    });
    this.socket.addEventListener('message', (event) => this.#handleMessage(String(event.data)));
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new ToolingError('CDP_COMMAND_TIMEOUT', 'CDP connection closed while a command was pending'));
      this.pending.clear();
    });
  }

  #handleMessage(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result || {});
      return;
    }
    if (!message.method) return;
    for (const listener of this.listeners.get(message.method) || []) {
      Promise.resolve(listener(message.params || {}, message.sessionId || null, message)).catch(this.onListenerError);
    }
  }

  on(method, listener) {
    const values = this.listeners.get(method) || [];
    values.push(listener);
    this.listeners.set(method, values);
    return () => this.listeners.set(method, (this.listeners.get(method) || []).filter((item) => item !== listener));
  }

  async send(method, params = {}, sessionId = null, {
    timeoutMs = this.commandTimeoutMs,
    classification = 'CDP_COMMAND_TIMEOUT',
  } = {}) {
    await this.ready;
    const id = ++this.sequence;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const response = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
    try {
      return await withStageTimeout(response, {
        classification,
        timeoutMs,
        message: `${method} did not complete before timeout`,
      });
    } finally {
      this.pending.delete(id);
    }
  }

  close() {
    try { this.socket.close(); } catch { /* best-effort socket disposal */ }
  }
}

export async function controlledShutdown({
  connection,
  child,
  ownedProcesses,
  waitForExit,
  timeoutMs = DEFAULT_TIMEOUTS.shutdownMs,
}) {
  const result = {
    status: 'PASS',
    classification: null,
    browserCloseRequested: false,
    ownedTerminationUsed: false,
    foreignProcessTargeted: false,
  };
  try {
    if (connection) {
      await withStageTimeout(connection.send('Browser.close', {}, null, {
        timeoutMs,
        classification: 'SHUTDOWN_TIMEOUT',
      }), { classification: 'SHUTDOWN_TIMEOUT', timeoutMs });
      result.browserCloseRequested = true;
    }
    const exited = !child || await withStageTimeout(waitForExit(child, timeoutMs), {
      classification: 'SHUTDOWN_TIMEOUT', timeoutMs,
    });
    if (child && ownedProcesses.owns(child.pid)) {
      if (exited) ownedProcesses.release(child);
      else {
        await ownedProcesses.terminate(child);
        result.ownedTerminationUsed = true;
        await withStageTimeout(waitForExit(child, timeoutMs), {
          classification: 'SHUTDOWN_TIMEOUT', timeoutMs,
        });
      }
    }
  } catch (error) {
    result.status = 'TOOLING_ERROR';
    result.classification = 'SHUTDOWN_TIMEOUT';
    result.causeClassification = error.classification || error.code || 'UNKNOWN';
    if (child && ownedProcesses.owns(child.pid)) {
      await ownedProcesses.terminate(child);
      result.ownedTerminationUsed = true;
    }
  } finally {
    connection?.close();
  }
  return result;
}
