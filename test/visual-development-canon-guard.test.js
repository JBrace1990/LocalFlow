import assert from 'node:assert/strict';
import test from 'node:test';
import { findVisualPlanCanonConflicts } from '../src/visual-development-canon-guard.js';

test('rejects a plan that turns an explicitly possible human transformation into an impossibility', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: {
      uniqueHook: 'The fox longs to become human, despite her inability to do so.',
      conflictAndStakes: 'Her transformation is impossible.',
    },
  }, [
    'The fox wishes she could become human.',
    'Keep transformation possible but unresolved. Do not claim it is impossible.',
  ]);

  assert.ok(conflicts.some(conflict => /transformation/i.test(conflict)));
});

test('rejects a plan that quietly makes transformation impossible by saying the fox remains an animal', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: {
      uniqueHook: 'The fox remains an animal but her wish to be human is a constant theme.',
      arcAndEnding: 'She returns to the forest while remaining in fox form.',
    },
  }, ['Keep transformation possible but unresolved. Do not claim it is impossible.']);

  assert.ok(conflicts.some(conflict => /transformation/i.test(conflict)));
});

test('rejects plain-language claims that becoming human is not possible', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: { conflictAndStakes: 'The fox desires to become human, which is not possible.' },
  }, ['Keep transformation possible but unresolved.']);

  assert.ok(conflicts.some(conflict => /cannot become human/i.test(conflict)));
});

test('rejects a plan that resolves a transformation the creator left open', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: { arcAndEnding: 'The fox undergoes a transformation and becomes human.' },
    assets: [{ name: 'Transformation Sequence', brief: 'A magical scene showing her transformation.' }],
  }, ['Keep transformation possible but unresolved.']);

  assert.ok(conflicts.some(conflict => /unresolved/i.test(conflict)));
});

test('rejects a plan that makes unrequited love mutual', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: { arcAndEnding: 'The man and fox fall in love and become a couple.' },
  }, ['Her love and wish to become human remain real, but he does not reciprocate romantically.']);

  assert.ok(conflicts.some(conflict => /reciprocat|mutual/i.test(conflict)));
});

test('accepts a plan that preserves the creator-approved ending and open transformation', () => {
  const conflicts = findVisualPlanCanonConflicts({
    concept: {
      premise: 'An injured red fox is cared for by a kind man.',
      arcAndEnding: 'She returns to the forest by choice and visits him freely. Her wish to become human remains unresolved, and he does not reciprocate romantically.',
    },
  }, [
    'Keep transformation possible but unresolved.',
    'She returns to the forest by choice and visits the man freely.',
    'He does not reciprocate romantically.',
  ]);

  assert.deepEqual(conflicts, []);
});
