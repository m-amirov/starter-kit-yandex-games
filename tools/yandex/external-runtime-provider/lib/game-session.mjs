import { IntegrityError, sanitizeRuntimeIdentity } from './security.mjs';
import { DEFAULT_TIMEOUTS, waitForCondition } from './cdp-runtime.mjs';

export function expectedGameOrigin(appId) {
  if (!/^\d{1,12}$/.test(String(appId || ''))) throw new IntegrityError('Draft App ID is malformed');
  return `https://app-${appId}.games.s3.yandex.net`;
}

export function selectGameTarget(targetInfos, appId) {
  const origin = expectedGameOrigin(appId);
  return targetInfos.find((target) => {
    if (!['page', 'iframe'].includes(target?.type)) return false;
    return sanitizeRuntimeIdentity(target.url || '').origin === origin;
  }) || null;
}

export class GameTargetTracker {
  constructor(appId) {
    this.appId = String(appId);
    this.targets = new Map();
    this.events = [];
  }

  #record(event, targetInfo) {
    if (!targetInfo?.targetId) return;
    const identity = sanitizeRuntimeIdentity(targetInfo.url || '');
    this.events.push({ event, targetId: targetInfo.targetId, type: targetInfo.type || 'unknown', ...identity });
  }

  targetCreated(targetInfo) {
    if (!targetInfo?.targetId) return;
    this.targets.set(targetInfo.targetId, { ...targetInfo });
    this.#record('Target.targetCreated', targetInfo);
  }

  targetInfoChanged(targetInfo) {
    if (!targetInfo?.targetId) return;
    this.targets.set(targetInfo.targetId, { ...(this.targets.get(targetInfo.targetId) || {}), ...targetInfo });
    this.#record('Target.targetInfoChanged', this.targets.get(targetInfo.targetId));
  }

  targetDestroyed(targetId) {
    const previous = this.targets.get(targetId);
    if (previous) this.#record('Target.targetDestroyed', previous);
    this.targets.delete(targetId);
  }

  selected() { return selectGameTarget([...this.targets.values()], this.appId); }
  snapshotEvents() { return this.events.slice(); }
}

export function createMutationLedger() {
  const passiveObservations = [];
  return Object.freeze({
    observe(name) {
      if (!passiveObservations.includes(name)) passiveObservations.push(name);
    },
    snapshot() {
      return {
        mutationCapableOperationCount: 0,
        mutationCapableOperations: [],
        passiveObservations: passiveObservations.slice(),
      };
    },
  });
}

export function sanitizeNetworkRequest(params = {}) {
  return {
    requestId: String(params.requestId || ''),
    timestamp: Number.isFinite(params.timestamp) ? params.timestamp : null,
    method: String(params.request?.method || 'GET'),
    resourceType: String(params.type || 'Other'),
    url: sanitizeRuntimeIdentity(params.request?.url || ''),
    document: sanitizeRuntimeIdentity(params.documentURL || ''),
    initiatorType: String(params.initiator?.type || 'unknown'),
  };
}

export class GameOopifOrchestrator {
  constructor(cdp, {
    appId,
    checkerSource,
    timeouts = {},
    technicalLog = [],
    consoleEvents = [],
    mutationLedger = createMutationLedger(),
    onStage = async () => {},
  }) {
    this.cdp = cdp;
    this.appId = String(appId);
    this.checkerSource = checkerSource;
    this.expectedOrigin = expectedGameOrigin(this.appId);
    this.timeouts = {
      gameTargetMs: timeouts.gameTargetMs ?? DEFAULT_TIMEOUTS.gameTargetMs,
      attachMs: timeouts.attachMs ?? DEFAULT_TIMEOUTS.gameOopifAttachMs,
      commandMs: timeouts.commandMs ?? DEFAULT_TIMEOUTS.cdpCommandMs,
    };
    this.technicalLog = technicalLog;
    this.consoleEvents = consoleEvents;
    this.mutationLedger = mutationLedger;
    this.onStage = onStage;
    this.stageProofRecorded = false;
    this.activeStage = null;
    this.tracker = new GameTargetTracker(this.appId);
    this.targetToSession = new Map();
    this.sessionToTarget = new Map();
    this.contexts = new Map();
    this.attaching = new Map();
    this.configuredSessions = new Set();
    this.injectedSessions = new Set();
    this.networkRequests = [];
    this.unsubscribers = [];
    this.asyncErrors = [];
  }

  #on(method, listener) { this.unsubscribers.push(this.cdp.on(method, listener)); }

  async #stage(stage, status) {
    this.activeStage = status === 'STARTED' ? stage : this.activeStage;
    await this.onStage(stage, status);
  }

  #command(method, params = {}, sessionId = null, classification = 'CDP_COMMAND_TIMEOUT') {
    return this.cdp.send(method, params, sessionId, {
      timeoutMs: classification === 'GAME_OOPIF_ATTACH_TIMEOUT' ? this.timeouts.attachMs : this.timeouts.commandMs,
      classification,
    });
  }

  #installListeners() {
    this.#on('Target.targetCreated', ({ targetInfo }) => {
      this.tracker.targetCreated(targetInfo);
      this.#considerAttach(targetInfo);
    });
    this.#on('Target.targetInfoChanged', ({ targetInfo }) => {
      this.tracker.targetInfoChanged(targetInfo);
      this.#considerAttach(targetInfo);
    });
    this.#on('Target.targetDestroyed', ({ targetId }) => {
      this.tracker.targetDestroyed(targetId);
      const sessionId = this.targetToSession.get(targetId);
      if (sessionId) {
        this.targetToSession.delete(targetId);
        this.sessionToTarget.delete(sessionId);
        this.contexts.delete(sessionId);
        this.configuredSessions.delete(sessionId);
        this.injectedSessions.delete(sessionId);
      }
    });
    this.#on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      this.#recordAttached(sessionId, targetInfo);
    });
    this.#on('Target.detachedFromTarget', ({ sessionId, targetId }) => {
      const resolvedTarget = targetId || this.sessionToTarget.get(sessionId)?.targetId;
      if (resolvedTarget) this.targetToSession.delete(resolvedTarget);
      this.sessionToTarget.delete(sessionId);
      this.contexts.delete(sessionId);
      this.configuredSessions.delete(sessionId);
      this.injectedSessions.delete(sessionId);
    });
    this.#on('Runtime.executionContextCreated', ({ context }, sessionId) => {
      if (!sessionId || !context?.auxData?.isDefault) return;
      this.contexts.set(sessionId, {
        executionContextId: context.id,
        origin: context.origin || '',
        frameId: context.auxData.frameId || null,
      });
    });
    this.#on('Runtime.executionContextDestroyed', ({ executionContextId }, sessionId) => {
      if (this.contexts.get(sessionId)?.executionContextId === executionContextId) this.contexts.delete(sessionId);
    });
    this.#on('Runtime.executionContextsCleared', (_, sessionId) => this.contexts.delete(sessionId));
    this.#on('Network.requestWillBeSent', (params, sessionId) => {
      if (sessionId !== this.currentGameSessionId) return;
      this.mutationLedger.observe('Network.requestWillBeSent');
      this.networkRequests.push(sanitizeNetworkRequest(params));
      if (this.networkRequests.length > 500) this.networkRequests.shift();
    });
    this.#on('Runtime.consoleAPICalled', (params, sessionId) => {
      if (sessionId !== this.currentGameSessionId) return;
      this.mutationLedger.observe('Runtime.consoleAPICalled');
      this.consoleEvents.push({
        sessionId,
        type: params.type,
        timestamp: params.timestamp,
        values: (params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type),
      });
    });
    this.#on('Runtime.exceptionThrown', ({ exceptionDetails }, sessionId) => {
      if (sessionId !== this.currentGameSessionId) return;
      this.consoleEvents.push({ sessionId, type: 'exception', details: exceptionDetails?.text || 'runtime exception' });
    });
  }

  #considerAttach(targetInfo) {
    if (!targetInfo || !['page', 'iframe'].includes(targetInfo.type)) return;
    const isGame = sanitizeRuntimeIdentity(targetInfo.url || '').origin === this.expectedOrigin;
    if (targetInfo.type !== 'page' && !isGame) return;
    this.#ensureAttached(targetInfo).catch((error) => {
      const isGame = sanitizeRuntimeIdentity(targetInfo.url || '').origin === this.expectedOrigin;
      if (isGame) this.asyncErrors.push(error);
      else this.technicalLog.push(`outer target attach diagnostic: ${error.message}`);
    });
  }

  #recordAttached(sessionId, targetInfo) {
    if (!sessionId || !targetInfo?.targetId) return;
    this.tracker.targetInfoChanged(targetInfo);
    this.targetToSession.set(targetInfo.targetId, sessionId);
    this.sessionToTarget.set(sessionId, { ...targetInfo });
    this.#configureRecursiveAutoAttach(sessionId, targetInfo).catch((error) => {
      this.technicalLog.push(`recursive target attach diagnostic: ${error.message}`);
    });
  }

  async #configureRecursiveAutoAttach(sessionId, targetInfo) {
    if (this.configuredSessions.has(sessionId) || !['page', 'iframe'].includes(targetInfo?.type)) return;
    this.configuredSessions.add(sessionId);
    await this.#command('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    }, sessionId);
  }

  async #ensureAttached(targetInfo) {
    if (this.targetToSession.has(targetInfo.targetId)) return this.targetToSession.get(targetInfo.targetId);
    if (this.attaching.has(targetInfo.targetId)) return this.attaching.get(targetInfo.targetId);
    const isGame = sanitizeRuntimeIdentity(targetInfo.url || '').origin === this.expectedOrigin;
    const promise = (async () => {
      let attached;
      try {
        attached = await this.#command('Target.attachToTarget', {
          targetId: targetInfo.targetId,
          flatten: true,
        }, null, isGame ? 'GAME_OOPIF_ATTACH_TIMEOUT' : 'CDP_COMMAND_TIMEOUT');
      } catch (error) {
        const attachedByEvent = await waitForCondition(() => this.targetToSession.get(targetInfo.targetId), {
          classification: isGame ? 'GAME_OOPIF_ATTACH_TIMEOUT' : 'CDP_COMMAND_TIMEOUT',
          timeoutMs: isGame ? this.timeouts.attachMs : this.timeouts.commandMs,
        }).catch(() => null);
        if (attachedByEvent) return attachedByEvent;
        if (isGame) error.defectCode = 'GAME_OOPIF_ATTACH_FAILED';
        throw error;
      }
      this.#recordAttached(attached.sessionId, targetInfo);
      return attached.sessionId;
    })();
    this.attaching.set(targetInfo.targetId, promise);
    try { return await promise; } finally { this.attaching.delete(targetInfo.targetId); }
  }

  async #discover() {
    this.#installListeners();
    await this.#command('Target.setDiscoverTargets', { discover: true });
    await this.#command('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    const { targetInfos = [] } = await this.#command('Target.getTargets');
    for (const targetInfo of targetInfos) this.tracker.targetCreated(targetInfo);
    for (const targetInfo of targetInfos) this.#considerAttach(targetInfo);
  }

  async #gameTargetAndSession() {
    const targetInfo = await waitForCondition(() => {
      if (this.asyncErrors.length) throw this.asyncErrors.shift();
      return this.tracker.selected();
    }, {
      classification: 'GAME_TARGET_TIMEOUT',
      timeoutMs: this.timeouts.gameTargetMs,
    });
    if (!this.stageProofRecorded) {
      await this.#stage('GAME_TARGET_DISCOVERY', 'COMPLETED');
      await this.#stage('GAME_OOPIF_ATTACH', 'STARTED');
    }
    let sessionId;
    try {
      sessionId = await this.#ensureAttached(targetInfo);
      sessionId = await waitForCondition(() => this.targetToSession.get(targetInfo.targetId), {
        classification: 'GAME_OOPIF_ATTACH_TIMEOUT', timeoutMs: this.timeouts.attachMs,
      });
    } catch (error) {
      if (error.classification) {
        error.defectCode = 'GAME_OOPIF_ATTACH_FAILED';
        throw error;
      }
      const wrapped = new Error(error.message);
      wrapped.code = 'PROVIDER_TOOLING_ERROR';
      wrapped.classification = 'GAME_OOPIF_ATTACH_FAILED';
      wrapped.defectCode = 'GAME_OOPIF_ATTACH_FAILED';
      throw wrapped;
    }
    if (!this.stageProofRecorded) await this.#stage('GAME_OOPIF_ATTACH', 'COMPLETED');
    return { targetInfo, sessionId };
  }

  #attachFailure(message) {
    const error = new Error(message);
    error.code = 'PROVIDER_TOOLING_ERROR';
    error.classification = 'GAME_OOPIF_ATTACH_FAILED';
    error.defectCode = 'GAME_OOPIF_ATTACH_FAILED';
    return error;
  }

  async #proveAndInject(targetInfo, sessionId) {
    this.currentGameSessionId = sessionId;
    await this.#command('Runtime.enable', {}, sessionId, 'GAME_OOPIF_ATTACH_TIMEOUT');
    await this.#command('Page.enable', {}, sessionId, 'GAME_OOPIF_ATTACH_TIMEOUT');
    await this.#command('Network.enable', { maxTotalBufferSize: 0, maxResourceBufferSize: 0 }, sessionId, 'GAME_OOPIF_ATTACH_TIMEOUT');
    let context;
    try {
      context = await waitForCondition(() => this.contexts.get(sessionId), {
        classification: 'GAME_OOPIF_ATTACH_TIMEOUT', timeoutMs: this.timeouts.attachMs,
      });
    } catch (error) {
      error.defectCode = 'GAME_OOPIF_ATTACH_FAILED';
      throw error;
    }
    if (context.origin && context.origin !== this.expectedOrigin) throw this.#attachFailure('game execution context origin does not match the expected App origin');
    const originResult = await this.#command('Runtime.evaluate', {
      expression: 'window.location.origin',
      contextId: context.executionContextId,
      returnByValue: true,
      awaitPromise: false,
    }, sessionId, 'GAME_OOPIF_ATTACH_TIMEOUT');
    const runtimeOrigin = originResult.result?.value;
    if (runtimeOrigin !== this.expectedOrigin) throw this.#attachFailure('Runtime execution context is not the expected game origin');
    if (!this.stageProofRecorded) {
      await this.#stage('ORIGIN_IDENTITY_PROOF', 'COMPLETED');
      await this.#stage('OBSERVER_START', 'STARTED');
    }
    if (!this.injectedSessions.has(sessionId)) {
      await this.#command('Page.addScriptToEvaluateOnNewDocument', {
        source: this.checkerSource,
        runImmediately: true,
      }, sessionId, 'GAME_OOPIF_ATTACH_TIMEOUT');
      await this.#command('Runtime.evaluate', {
        expression: this.checkerSource,
        contextId: context.executionContextId,
        returnByValue: true,
        awaitPromise: false,
      }, sessionId, 'GAME_OOPIF_ATTACH_TIMEOUT');
      this.injectedSessions.add(sessionId);
    }
    const snapshotResult = await this.#command('Runtime.evaluate', {
      expression: 'globalThis.__YG_HARDENED_OBSERVER?.snapshot?.() ?? null',
      contextId: context.executionContextId,
      returnByValue: true,
      awaitPromise: false,
    }, sessionId, 'GAME_OOPIF_ATTACH_TIMEOUT');
    const snapshot = snapshotResult.result?.value;
    if (!snapshot || snapshot.page?.origin !== this.expectedOrigin) throw this.#attachFailure('observer origin proof failed in the game OOPIF');
    if (!this.stageProofRecorded) await this.#stage('OBSERVER_START', 'COMPLETED');
    const targetIdentity = sanitizeRuntimeIdentity(targetInfo.url || '');
    return {
      identity: {
        targetId: targetInfo.targetId,
        targetType: targetInfo.type,
        cdpSessionId: sessionId,
        executionContextId: context.executionContextId,
        frameId: context.frameId,
        origin: targetIdentity.origin,
        pathname: targetIdentity.pathname,
        appId: this.appId,
        expectedOrigin: this.expectedOrigin,
        runtimeOrigin,
        observerOrigin: snapshot.page.origin,
      },
      snapshot,
      targetEvents: this.tracker.snapshotEvents(),
      networkRequests: this.networkRequests.slice(),
      mutationLedger: this.mutationLedger.snapshot(),
    };
  }

  async observe() {
    try {
      if (this.unsubscribers.length === 0) {
        if (!this.stageProofRecorded) await this.#stage('GAME_TARGET_DISCOVERY', 'STARTED');
        await this.#discover();
      }
      const { targetInfo, sessionId } = await this.#gameTargetAndSession();
      if (!this.stageProofRecorded) await this.#stage('ORIGIN_IDENTITY_PROOF', 'STARTED');
      const result = await this.#proveAndInject(targetInfo, sessionId);
      this.stageProofRecorded = true;
      return result;
    } catch (error) {
      if (!error.stage && this.activeStage) error.stage = this.activeStage;
      throw error;
    }
  }

  stop() {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
  }
}
