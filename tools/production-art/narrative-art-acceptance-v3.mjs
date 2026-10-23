/**
 * Starter Kit-side structural validator for the unified narrative art review.
 * It validates the reviewer contract; it does not inspect pixels or replace
 * the independent artistic decision.
 */
export const NARRATIVE_ART_ACCEPTANCE_V3 = 'NARRATIVE_ART_ACCEPTANCE_V3';
const SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const BLOCKING_IMPACTS = new Set([
  'WRONG_CHARACTER', 'ESSENTIAL_CHARACTER_UNRECOGNIZABLE',
  'MATERIAL_WARDROBE_CONTRADICTION', 'WRONG_ACTOR_OR_ACTION',
  'WRONG_LOCATION_OR_TIME', 'NARRATIVE_CONTINUITY_CONTRADICTION',
  'STORY_CRITICAL_PROP_MISSING', 'STORY_CRITICAL_PROP_OBSCURED',
  'ESSENTIAL_SUBJECT_CROPPED', 'CRITICAL_SCENE_MAPPING',
  'DIALOGUE_OR_CONTROLS_UNREADABLE', 'MATERIAL_RUNTIME_READABILITY'
]);
const DIMENSIONS = ['identityStatus', 'wardrobeStatus', 'storyActionStatus', 'dualFormatStatus'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

export function assessArtFindingsV3(findings) {
  const errors = [];
  const blockingFindings = [];
  const advisoryFindings = [];
  const seen = new Set();
  if (!Array.isArray(findings)) return { ok: false, verdict: 'INVALID_FINDINGS', errors: ['findings must be an array'], blockingFindings, advisoryFindings };
  for (const finding of findings) {
    if (!finding || !text(finding.id) || !SEVERITIES.has(finding.severity) || !['OPEN', 'RESOLVED'].includes(finding.status)) {
      errors.push('finding requires id, P0-P3 severity and OPEN/RESOLVED status');
      continue;
    }
    if (seen.has(finding.id)) {
      errors.push(`duplicate finding: ${finding.id}`);
      continue;
    }
    seen.add(finding.id);
    if (finding.status === 'RESOLVED') continue;
    const blocking = finding.severity === 'P0' || finding.severity === 'P1';
    if (finding.materialPlayerImpact === true && !blocking) errors.push(`${finding.id}: material P2/P3 requires P0/P1 evidence`);
    if (blocking) {
      if (!BLOCKING_IMPACTS.has(finding.impactCode)) errors.push(`${finding.id}: unrecognized blocking impactCode`);
      if (!text(finding.authoredCue) || !text(finding.observation) || !text(finding.playerImpact) ||
          !text(finding.evidenceRef) || finding.actualPixelsReceived !== true)
        errors.push(`${finding.id}: blocking issue needs authored cue, pixel evidence and player impact`);
      blockingFindings.push(finding);
    } else advisoryFindings.push(finding);
  }
  return {
    ok: errors.length === 0,
    verdict: errors.length ? 'INVALID_FINDINGS' : blockingFindings.length ? 'REWORK' : advisoryFindings.length ? 'PASS_WITH_NOTES' : 'PASS',
    errors,
    blockingFindings,
    advisoryFindings
  };
}

export function validateArtReviewV3(review) {
  const errors = [];
  if (!review || review.artAcceptanceProfile !== NARRATIVE_ART_ACCEPTANCE_V3) return { ok: false, verdict: 'INVALID', errors: ['independent V3 profile is required'] };
  if (!['PASS', 'PASS_WITH_NOTES', 'REWORK'].includes(review.status)) errors.push('V3 status must be PASS, PASS_WITH_NOTES or REWORK');
  if (review.actualPixelsReceived !== true) errors.push('actualPixelsReceived true from real reviewer required');
  const findings = assessArtFindingsV3(review.findings);
  if (!findings.ok) errors.push(...findings.errors);
  if (findings.ok && review.status !== findings.verdict) errors.push(`reviewer status disagrees with findings: ${findings.verdict}`);
  if (!Array.isArray(review.unresolved) || review.unresolved.some(id => !findings.blockingFindings.some(item => item.id === id))) errors.push('unresolved may contain only open P0/P1 finding ids');
  if (findings.blockingFindings.length && !findings.blockingFindings.every(item => review.unresolved?.includes(item.id))) errors.push('all open P0/P1 blockers must be unresolved');
  const cast = review.requiredCast;
  if (!Array.isArray(cast) || cast.some(id => !text(id)) || new Set(cast).size !== cast.length) errors.push('requiredCast must be unique');
  const evidence = new Set(Array.isArray(review.visualEvidence) ? review.visualEvidence.map(item => item?.ref) : []);
  if (!Array.isArray(review.visualEvidence) || !review.visualEvidence.length || review.visualEvidence.some(item => !text(item?.ref) || !text(item?.path) || !sha(item?.sha256) || !text(item?.observation) || item.observation.trim().length < 20)) errors.push('real image evidence with SHA-256 and substantive observations is required');
  const assessments = review.wardrobeAssessments;
  if (!Array.isArray(assessments) || assessments.length !== (Array.isArray(cast) ? cast.length : -1)) errors.push('one unified character/wardrobe assessment is required per cast member');
  if (Array.isArray(cast) && Array.isArray(assessments)) {
    const seen = new Set();
    for (const item of assessments) {
      if (!cast.includes(item?.characterId) || seen.has(item.characterId)) {
        errors.push('unknown/duplicate wardrobe character');
        continue;
      }
      seen.add(item.characterId);
      if (!text(item.identityObservation) || !text(item.wardrobeObservation) || !text(item.actionObservation)) errors.push(`character observations missing: ${item.characterId}`);
      if (!Array.isArray(item.evidenceRefs) || !item.evidenceRefs.length || item.evidenceRefs.some(ref => !evidence.has(ref))) errors.push(`character evidence refs invalid: ${item.characterId}`);
      for (const key of DIMENSIONS) if (!['PASS', 'REWORK'].includes(item[key])) errors.push(`invalid ${key}: ${item.characterId}`);
      if (DIMENSIONS.some(key => item[key] === 'REWORK') && !findings.blockingFindings.some(item2 => item2.characterId === item.characterId)) errors.push(`dimension REWORK needs a P0/P1 finding: ${item.characterId}`);
      if (review.status !== 'REWORK' && DIMENSIONS.some(key => item[key] === 'REWORK')) errors.push(`accepted review cannot contain character REWORK: ${item.characterId}`);
    }
  }
  return { ok: errors.length === 0, verdict: errors.length ? 'INVALID' : review.status, errors, blockingFindings: findings.blockingFindings, advisoryFindings: findings.advisoryFindings };
}

export function isArtV3Accepted(status) {
  return status === 'PASS' || status === 'PASS_WITH_NOTES';
}
