import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { redactString, redactValue } from './security.mjs';
import { DEFAULT_TIMEOUTS, withStageTimeout } from './cdp-runtime.mjs';

export const REQUIRED_REPORT_FILES = Object.freeze([
  'report.json', 'evidence.json', 'panel.txt', 'console.json', 'chrome.log', 'run-state.json',
]);

export const PIPELINE_STAGES = Object.freeze([
  'INTEGRITY_VALIDATION',
  'BROWSER_LAUNCH',
  'CDP_CONNECTION',
  'GAME_TARGET_DISCOVERY',
  'GAME_OOPIF_ATTACH',
  'ORIGIN_IDENTITY_PROOF',
  'OBSERVER_START',
  'PASSIVE_OBSERVATION',
  'REPORT_FINALIZATION',
  'CONTROLLED_SHUTDOWN',
]);

const TERMINAL_STAGE_STATUSES = new Set(['COMPLETED', 'FAILED', 'TIMEOUT', 'SKIPPED']);

async function atomicWrite(path, content) {
  const temporary = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
}

async function atomicJson(path, value) {
  await atomicWrite(path, `${JSON.stringify(redactValue(value), null, 2)}\n`);
}

function merge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base?.[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      result[key] = merge(base[key], value);
    } else result[key] = value;
  }
  return result;
}

function emptyStages() {
  return Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage, {
    status: 'NOT_STARTED', startedAt: null, completedAt: null,
  }]));
}

function timeoutStatus(error) {
  return /TIMEOUT/i.test(String(error?.classification || error?.code || '')) ? 'TIMEOUT' : 'FAILED';
}

export class GuaranteedReporter {
  constructor(outputDir, { flushTimeoutMs = DEFAULT_TIMEOUTS.reportFlushMs, sensitivePaths = [] } = {}) {
    this.outputDir = outputDir;
    this.flushTimeoutMs = flushTimeoutMs;
    this.sensitivePaths = [...sensitivePaths];
    this.state = null;
  }

  get redactionOptions() { return { sensitivePaths: this.sensitivePaths }; }

  addSensitivePath(path) {
    if (path && !this.sensitivePaths.includes(path)) this.sensitivePaths.push(path);
  }

  #assertStage(stage) {
    if (!PIPELINE_STAGES.includes(stage)) throw new Error(`unknown pipeline stage: ${stage}`);
  }

  #syncDerived() {
    this.state.completedStages = PIPELINE_STAGES.filter((stage) => this.state.stages[stage].status === 'COMPLETED');
  }

  async initialize(initial) {
    await mkdir(this.outputDir, { recursive: true, mode: 0o700 });
    this.state = merge({
      schemaVersion: 2,
      providerStatus: 'RUNNING',
      finalVerdict: 'EXTERNAL_EVIDENCE_NOT_VERIFIED',
      currentStage: 'INITIALIZED',
      stages: emptyStages(),
      completedStages: [],
      failedStage: null,
      errorClassification: null,
      errorDefectCode: null,
      error: null,
      targetIdentity: null,
      observation: null,
      targetEvents: [],
      networkRequests: [],
      mutationLedger: { mutationCapableOperationCount: 0, mutationCapableOperations: [], passiveObservations: [] },
      consoleEvents: [],
      technicalLog: [],
      shutdown: { status: 'PENDING' },
      startedAt: new Date().toISOString(),
      completedAt: null,
    }, initial);
    this.state.stages = emptyStages();
    this.#syncDerived();
    await this.flush();
  }

  async startStage(stage, { patch = {} } = {}) {
    this.#assertStage(stage);
    const current = this.state.stages[stage];
    if (TERMINAL_STAGE_STATUSES.has(current.status)) throw new Error(`pipeline stage is already terminal: ${stage}`);
    const startedAt = current.startedAt || new Date().toISOString();
    this.state = merge(this.state, {
      ...patch,
      currentStage: stage,
      stages: { [stage]: { status: 'IN_PROGRESS', startedAt, completedAt: null } },
    });
    this.#syncDerived();
    await this.flush();
  }

  async completeStage(stage, { patch = {} } = {}) {
    this.#assertStage(stage);
    const current = this.state.stages[stage];
    if (current.status === 'COMPLETED') return;
    if (TERMINAL_STAGE_STATUSES.has(current.status)) throw new Error(`cannot complete terminal pipeline stage: ${stage}`);
    const completedAt = new Date().toISOString();
    this.state = merge(this.state, {
      ...patch,
      currentStage: stage,
      stages: { [stage]: { status: 'COMPLETED', startedAt: current.startedAt || completedAt, completedAt } },
    });
    if (stage === 'CONTROLLED_SHUTDOWN') this.state.completedAt = completedAt;
    this.#syncDerived();
    await this.flush();
  }

  async failStage(stage, error) {
    this.#assertStage(stage);
    const current = this.state.stages[stage];
    if (current.status === 'COMPLETED') throw new Error(`refusing to overwrite completed pipeline stage: ${stage}`);
    const completedAt = new Date().toISOString();
    const message = redactString(error?.message || 'provider failure', this.redactionOptions);
    this.state = merge(this.state, {
      providerStatus: 'PROVIDER_ERROR',
      finalVerdict: 'EXTERNAL_EVIDENCE_ERROR',
      failedStage: stage,
      currentStage: stage,
      errorClassification: error?.classification || error?.code || 'PROVIDER_ERROR',
      errorDefectCode: error?.defectCode || null,
      error: message,
      stages: { [stage]: { status: timeoutStatus(error), startedAt: current.startedAt || completedAt, completedAt, error: message } },
    });
    this.#syncDerived();
    await this.flush();
  }

  async skipStages(stages) {
    const patch = {};
    for (const stage of stages) {
      this.#assertStage(stage);
      if (this.state.stages[stage].status === 'NOT_STARTED') patch[stage] = { status: 'SKIPPED', startedAt: null, completedAt: null };
    }
    this.state = merge(this.state, { stages: patch });
    this.#syncDerived();
    await this.flush();
  }

  async checkpoint(stage, patch = {}) {
    if (!PIPELINE_STAGES.includes(stage)) {
      this.state = merge(this.state, { ...patch, currentStage: stage });
      await this.flush();
      return;
    }
    if (this.state.stages[stage].status === 'NOT_STARTED') await this.startStage(stage);
    await this.completeStage(stage, { patch });
  }

  async update(patch = {}) {
    this.state = merge(this.state, patch);
    this.#syncDerived();
    await this.flush();
  }

  async fail({ failedStage, error }) {
    if (PIPELINE_STAGES.includes(failedStage)) return this.failStage(failedStage, error);
    this.state = merge(this.state, {
      providerStatus: 'PROVIDER_ERROR',
      finalVerdict: 'EXTERNAL_EVIDENCE_ERROR',
      failedStage,
      currentStage: 'FAILED',
      errorClassification: error?.classification || error?.code || 'PROVIDER_ERROR',
      errorDefectCode: error?.defectCode || null,
      error: redactString(error?.message || 'provider failure', this.redactionOptions),
    });
    await this.flush();
  }

  async complete(patch = {}) {
    this.state = merge(this.state, { ...patch, providerStatus: 'COMPLETE' });
    await this.flush();
  }

  async finalizeProviderArtifacts({ writer = atomicWrite } = {}) {
    const stage = 'REPORT_FINALIZATION';
    if (this.state.stages[stage].status === 'NOT_STARTED') await this.startStage(stage);
    try {
      await this.flush({ writer });
      const completedAt = new Date().toISOString();
      this.state = merge(this.state, {
        currentStage: stage,
        stages: { [stage]: { status: 'COMPLETED', startedAt: this.state.stages[stage].startedAt || completedAt, completedAt } },
      });
      this.#syncDerived();
      await this.#writeRunState();
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = redactString(error?.message || 'report finalization failed', this.redactionOptions);
      this.state = merge(this.state, {
        providerStatus: 'PROVIDER_ERROR',
        finalVerdict: 'EXTERNAL_EVIDENCE_ERROR',
        failedStage: stage,
        currentStage: stage,
        errorClassification: error?.classification || error?.code || 'REPORT_FINALIZATION_FAILURE',
        error: message,
        stages: { [stage]: { status: timeoutStatus(error), startedAt: this.state.stages[stage].startedAt || completedAt, completedAt, error: message } },
      });
      this.#syncDerived();
      await this.#writeRunState();
      throw error;
    }
  }

  #documents() {
    const options = this.redactionOptions;
    const report = redactValue(this.state, '', options);
    const evidence = redactValue({
      runId: this.state.runId,
      providerStatus: this.state.providerStatus,
      finalVerdict: this.state.finalVerdict,
      targetIdentity: this.state.targetIdentity,
      observation: this.state.observation,
      targetEvents: this.state.targetEvents,
      networkRequests: this.state.networkRequests,
      mutationLedger: this.state.mutationLedger,
      restrictions: ['NO_STATE_MUTATION', 'NO_SYNTHETIC_EVENTS', 'NO_PROJECT_CALLBACKS', 'NO_CHECKER_TRIGGERED_ADS'],
    }, '', options);
    const runState = redactValue({
      runId: this.state.runId,
      providerStatus: this.state.providerStatus,
      finalVerdict: this.state.finalVerdict,
      currentStage: this.state.currentStage,
      stages: this.state.stages,
      completedStages: this.state.completedStages,
      failedStage: this.state.failedStage,
      errorClassification: this.state.errorClassification,
      errorDefectCode: this.state.errorDefectCode,
      error: this.state.error,
      startedAt: this.state.startedAt,
      completedAt: this.state.completedAt,
      shutdown: this.state.shutdown,
    }, '', options);
    const panel = redactString([
      `Provider status: ${this.state.providerStatus}`,
      `Verdict: ${this.state.finalVerdict}`,
      `Stage: ${this.state.currentStage}`,
      `Failed stage: ${this.state.failedStage || 'none'}`,
      `Error classification: ${this.state.errorClassification || 'none'}`,
      `Mutation-capable operations: ${this.state.mutationLedger?.mutationCapableOperationCount ?? 0}`,
      `Shutdown: ${this.state.shutdown?.status || 'PENDING'}`,
    ].join('\n'), options);
    return { report, evidence, runState, panel };
  }

  async #writeRunState() {
    const { runState } = this.#documents();
    await atomicWrite(join(this.outputDir, 'run-state.json'), `${JSON.stringify(runState, null, 2)}\n`);
  }

  async flush({ writer = atomicWrite } = {}) {
    if (!this.state) throw new Error('reporter is not initialized');
    const { report, evidence, runState, panel } = this.#documents();
    const options = this.redactionOptions;
    const writes = [
      ['report.json', `${JSON.stringify(report, null, 2)}\n`],
      ['evidence.json', `${JSON.stringify(evidence, null, 2)}\n`],
      ['console.json', `${JSON.stringify(redactValue(this.state.consoleEvents || [], '', options), null, 2)}\n`],
      ['run-state.json', `${JSON.stringify(runState, null, 2)}\n`],
      ['chrome.log', `${redactString((this.state.technicalLog || []).join('\n'), options)}\n`],
      ['panel.txt', `${panel}\n`],
    ];
    await withStageTimeout(Promise.all(writes.map(([name, content]) => writer(join(this.outputDir, name), content))), {
      classification: 'REPORT_FLUSH_TIMEOUT',
      timeoutMs: this.flushTimeoutMs,
      message: 'provider reports did not flush before timeout',
    });
  }
}

export { atomicJson };
