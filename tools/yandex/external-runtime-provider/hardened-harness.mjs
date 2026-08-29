#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOCK_CODE,
  cleanupEphemeralProfile,
  createOwnedProcessController,
  parseHarnessArgs,
  redactString,
  sanitizeUrl,
  sha256File,
  shouldCaptureScreenshot,
  ToolingError,
  verifyIntegrityManifest,
  waitForDebuggerEndpoint,
} from './lib/security.mjs';
import {
  CdpConnection,
  controlledShutdown,
  DEFAULT_TIMEOUTS,
  withStageTimeout,
} from './lib/cdp-runtime.mjs';
import {
  createMutationLedger,
  GameOopifOrchestrator,
} from './lib/game-session.mjs';
import { GuaranteedReporter, PIPELINE_STAGES } from './lib/reporting.mjs';

const prototypeRoot = dirname(fileURLToPath(import.meta.url));
const manifestUrl = new URL('./integrity-manifest.json', import.meta.url);
const ownedProcesses = createOwnedProcessController();
const PASSIVE_OBSERVATION_MS = 15000;

const browserCandidates = {
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
};

async function firstExisting(paths) {
  for (const path of paths) {
    try { await readFile(path); return path; } catch { /* continue through fixed local allowlist */ }
  }
  throw new ToolingError('BROWSER_LAUNCH_FAILURE', 'allowlisted browser executable is unavailable');
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

function collectSanitizedStream(stream, sink) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    sink.push(...lines.map(redactString));
  });
  stream.on('end', () => { if (buffer) sink.push(redactString(buffer)); });
}

async function prepareProfile(profileMode) {
  if (profileMode === 'ephemeral') {
    return { mode: profileMode, path: await mkdtemp(join(tmpdir(), 'yg-hardened-profile-')), removeAfter: true };
  }
  const path = join(prototypeRoot, '.state', 'dedicated-auth-profile');
  await mkdir(path, { recursive: true, mode: 0o700 });
  return { mode: profileMode, path, removeAfter: false };
}

async function waitForChildExit(child, timeoutMs = DEFAULT_TIMEOUTS.shutdownMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    once(child, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

async function waitForBrowserSpawn(child) {
  if (!child) throw new ToolingError('BROWSER_LAUNCH_TIMEOUT', 'owned browser process was not created');
  await withStageTimeout(new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  }), {
    classification: 'BROWSER_LAUNCH_TIMEOUT',
    timeoutMs: DEFAULT_TIMEOUTS.browserLaunchMs,
    message: 'owned browser did not reach spawned state before timeout',
  });
}

async function persistReporterFailure(reporter, failedStage, error) {
  try {
    await reporter.failStage(failedStage, error);
  } catch (flushError) {
    if (flushError.classification !== 'REPORT_FLUSH_TIMEOUT') throw flushError;
    await reporter.flush();
  }
}

async function run() {
  const options = parseHarnessArgs(process.argv.slice(2));
  if (!options.url) throw new Error('--url is required');

  const manifest = await verifyIntegrityManifest(manifestUrl);
  const manifestSha256 = await sha256File(manifestUrl);
  const runtimeClosure = Object.fromEntries(manifest.runtimeClosure.map((entry) => [entry.id, entry]));
  const provenanceInputs = Object.fromEntries(manifest.provenanceInputs.map((entry) => [entry.id, entry]));
  const target = sanitizeUrl(options.url);
  const navigationUrl = new URL(`${target.origin}${target.pathname}`);
  for (const [key, value] of Object.entries(target.query)) navigationUrl.searchParams.set(key, value);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${target.appId || 'unknown'}`;
  const outputDir = join(prototypeRoot, 'evidence', runId);
  const reporter = new GuaranteedReporter(outputDir);
  const technicalLog = [];
  const consoleEvents = [];
  const mutationLedger = createMutationLedger();
  let profile;
  let child;
  let cdp;
  let orchestrator;
  let stage = 'INTEGRITY_VALIDATION';
  let runError = null;
  let providerResult = null;

  await reporter.initialize({
    runId,
    providerStatus: 'RUNNING',
    currentStage: 'INITIALIZED',
    provenance: {
      provider: 'draft-runtime-harness-hardened-prototype',
      mode: 'post-upload-draft-runtime',
      upstreamRepository: manifest.upstream.repository,
      upstreamCommit: manifest.upstream.commit,
      upstreamCandidate: manifest.upstream.candidate,
      providerVersion: manifest.providerVersion,
      manifestSha256,
      previousValidatedManifestSha256: manifest.repin.previousValidatedManifestSha256,
      repinReason: manifest.repin.reason,
      checkerVersion: 'hardened-live-observer-1.0.0',
      checkerSha256: runtimeClosure.observer.sha256,
      harnessSha256: runtimeClosure.harness.sha256,
      securityLibrarySha256: runtimeClosure.security.sha256,
      cdpRuntimeSha256: runtimeClosure['cdp-runtime'].sha256,
      gameSessionSha256: runtimeClosure['game-session'].sha256,
      reportingSha256: runtimeClosure.reporting.sha256,
      originalCandidateSha256: provenanceInputs['upstream-debugcheck-candidate'].sha256,
      originalHarnessSha256: provenanceInputs['upstream-experimental-harness'].sha256,
      runtimeClosure: manifest.runtimeClosure,
      provenanceInputs: manifest.provenanceInputs,
      securityPolicyVersion: manifest.securityPolicyVersion,
      profileMode: options.profileMode,
      target,
      cspBypassUsed: false,
      cspRestored: true,
      syntheticUserGesture: false,
      remoteExecutableFetch: false,
      interactive: options.interactive,
      passiveObservationMs: PASSIVE_OBSERVATION_MS,
    },
    mutationLedger: mutationLedger.snapshot(),
    screenshot: { captured: false, potentiallySensitive: true, localOnly: true, automaticallyPackaged: false },
  });

  await reporter.startStage('INTEGRITY_VALIDATION');
  await reporter.completeStage('INTEGRITY_VALIDATION');

  try {
    stage = 'BROWSER_LAUNCH';
    await reporter.startStage(stage);
    profile = await prepareProfile(options.profileMode);
    reporter.addSensitivePath(profile.path);

    const executable = await firstExisting(browserCandidates[options.browserKind]);
    const port = await freePort();
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile.path}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-background-networking',
      navigationUrl.toString(),
    ];
    child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    ownedProcesses.register(child);
    collectSanitizedStream(child.stdout, technicalLog);
    collectSanitizedStream(child.stderr, technicalLog);
    await waitForBrowserSpawn(child);
    await reporter.completeStage(stage, { patch: { browser: { kind: options.browserKind, ownedPid: child.pid } } });

    stage = 'CDP_CONNECTION';
    await reporter.startStage(stage);
    const endpoint = await waitForDebuggerEndpoint(port, {
      child,
      timeoutMs: DEFAULT_TIMEOUTS.cdpEndpointMs,
    });
    cdp = new CdpConnection(endpoint, {
      commandTimeoutMs: DEFAULT_TIMEOUTS.cdpCommandMs,
      onListenerError: (error) => technicalLog.push(`CDP event listener error: ${redactString(error.message)}`),
    });
    await cdp.ready;
    const browserVersion = await cdp.send('Browser.getVersion');
    await reporter.completeStage(stage, { patch: { browser: { product: browserVersion.product || 'unknown' } } });

    const checkerSource = await readFile(join(prototypeRoot, runtimeClosure.observer.path), 'utf8');
    orchestrator = new GameOopifOrchestrator(cdp, {
      appId: target.appId,
      checkerSource,
      technicalLog,
      consoleEvents,
      mutationLedger,
      onStage: async (nextStage, status) => {
        stage = nextStage;
        if (status === 'STARTED') await reporter.startStage(nextStage);
        else await reporter.completeStage(nextStage);
      },
    });
    const attached = await orchestrator.observe();
    await reporter.update({
      targetIdentity: attached.identity,
      observation: attached.snapshot,
      targetEvents: attached.targetEvents,
      networkRequests: attached.networkRequests,
      mutationLedger: attached.mutationLedger,
      consoleEvents,
      technicalLog,
    });

    stage = 'PASSIVE_OBSERVATION';
    await reporter.startStage(stage);
    if (options.interactive) {
      if (!process.stdin.isTTY) throw new ToolingError('PROVIDER_INTERACTIVE_CHECKPOINT_REQUIRED', 'interactive mode requires a local terminal');
      process.stdout.write('MANUAL_CHECKPOINT: optionally perform one safe ordinary action, then press Enter.\n');
      await withStageTimeout(once(process.stdin, 'data'), {
        classification: 'CDP_COMMAND_TIMEOUT',
        timeoutMs: 120000,
        message: 'manual checkpoint did not complete before timeout',
      });
    } else {
      await new Promise((resolve) => setTimeout(resolve, PASSIVE_OBSERVATION_MS));
    }
    const observed = await orchestrator.observe();

    if (options.screenshot) {
      const passwordCheck = await cdp.send('Runtime.evaluate', {
        expression: 'Boolean(document.querySelector("input[type=password]"))',
        contextId: observed.identity.executionContextId,
        returnByValue: true,
        awaitPromise: false,
      }, observed.identity.cdpSessionId);
      if (shouldCaptureScreenshot({ url: navigationUrl.toString(), hasPasswordInput: Boolean(passwordCheck.result?.value) })) {
        const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, observed.identity.cdpSessionId);
        await writeFile(join(outputDir, 'page.png'), Buffer.from(capture.data, 'base64'), { mode: 0o600 });
        await reporter.update({ screenshot: { captured: true, path: 'page.png', potentiallySensitive: true, localOnly: true, automaticallyPackaged: false } });
      }
    }

    stage = 'REPORT_FINALIZATION';
    providerResult = {
      targetIdentity: observed.identity,
      observation: observed.snapshot,
      targetEvents: observed.targetEvents,
      networkRequests: observed.networkRequests,
      mutationLedger: observed.mutationLedger,
      consoleEvents,
      technicalLog,
      finalVerdict: 'EXTERNAL_EVIDENCE_NOT_VERIFIED',
      providerExecution: 'PASSIVE_OBSERVATION_COMPLETE',
    };
    await reporter.completeStage('PASSIVE_OBSERVATION', { patch: providerResult });
    await reporter.complete(providerResult);
  } catch (error) {
    runError = error;
    stage = error.stage || stage;
    technicalLog.push(`${stage}: ${redactString(error.message, { sensitivePaths: profile ? [profile.path] : [] })}`);
    await persistReporterFailure(reporter, stage, error);
    const stageIndex = PIPELINE_STAGES.indexOf(stage);
    const laterRuntimeStages = PIPELINE_STAGES.slice(Math.max(0, stageIndex + 1))
      .filter((item) => !['REPORT_FINALIZATION', 'CONTROLLED_SHUTDOWN'].includes(item));
    await reporter.skipStages(laterRuntimeStages);
  }

  try {
    await reporter.update({ technicalLog, consoleEvents, mutationLedger: mutationLedger.snapshot() });
    await reporter.finalizeProviderArtifacts();
  } catch (error) {
    if (!runError) runError = error;
  }

  orchestrator?.stop();
  stage = 'CONTROLLED_SHUTDOWN';
  await reporter.startStage(stage);
  const shutdown = await controlledShutdown({
    connection: cdp,
    child,
    ownedProcesses,
    waitForExit: waitForChildExit,
    timeoutMs: DEFAULT_TIMEOUTS.shutdownMs,
  });
  const cleanup = profile?.removeAfter
    ? await cleanupEphemeralProfile(profile.path)
    : { status: profile ? 'NOT_APPLICABLE' : 'NOT_STARTED', classification: null, attempts: 0 };
  const shutdownPatch = {
    technicalLog,
    consoleEvents,
    mutationLedger: mutationLedger.snapshot(),
    shutdown: { ...shutdown, profileCleanup: cleanup },
  };
  if (shutdown.status === 'PASS') {
    await reporter.completeStage(stage, { patch: shutdownPatch });
  } else {
    const shutdownError = new ToolingError(shutdown.classification || 'SHUTDOWN_TIMEOUT', 'owned browser shutdown did not complete cleanly');
    await reporter.update(shutdownPatch);
    await reporter.failStage(stage, shutdownError);
    if (!runError) runError = shutdownError;
  }

  if (runError) {
    runError.outputDir = outputDir;
    throw runError;
  }
  return { outputDir, verdict: providerResult.finalVerdict, providerExecution: providerResult.providerExecution };
}

run().then((result) => {
  process.stdout.write(`${JSON.stringify({
    verdict: result.verdict,
    providerExecution: result.providerExecution,
    output: basename(result.outputDir),
  })}\n`);
}).catch((error) => {
  const code = error.code === BLOCK_CODE
    ? BLOCK_CODE
    : error.code === 'PROVIDER_TOOLING_ERROR'
      ? 'PROVIDER_TOOLING_ERROR'
      : 'PROVIDER_ERROR';
  const message = redactString(error.message).replace(new RegExp(`^${code}:\\s*`), '');
  const classification = error.classification ? ` [${error.classification}]` : '';
  const output = error.outputDir ? ` [evidence=${basename(error.outputDir)}]` : '';
  process.stderr.write(`${code}${classification}: ${message}${output}\n`);
  process.exitCode = 1;
});
