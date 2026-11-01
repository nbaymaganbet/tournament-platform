const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleMock = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('lib/bracket-swap.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
new Function('module', 'exports', code)(moduleMock, moduleMock.exports);
const { swappableAthletes } = moduleMock.exports;
const match = (id, a, b, extra = {}) => ({ id, participant_a_id: a, participant_b_id: b,
  status: 'scheduled', winner_id: null, completed_at: null, next_match_id: null,
  loser_next_match_id: null, ...extra });

test('unplayed seeds remain selectable after other bouts finish; advanced athletes stay locked', () => {
  const group = [match('played', 'a', 'b', { status: 'completed', winner_id: 'a', next_match_id: 'semi' }),
    match('unplayed', 'c', 'd', { next_match_id: 'semi' }), match('semi', 'a', null)];
  assert.deepEqual([...swappableAthletes(group)].sort(), ['c', 'd']);
});
test('BYE seeds are eligible even after an opponent advances', () => {
  const group = [match('played', 'a', 'b', { status: 'completed', winner_id: 'a', next_match_id: 'final' }),
    match('final', 'bye', 'a')];
  assert.deepEqual([...swappableAthletes(group)], ['bye']);
});
test('started bouts and completion timestamps block exchange', () => {
  for (const extra of [{ status: 'in_progress' }, { completed_at: '2026-11-01' }, { winner_id: 'a' }]) {
    assert.equal(swappableAthletes([match('x', 'a', 'b', extra)]).size, 0);
  }
});
test('started winner and bronze descendants block their unplayed ancestors', () => {
  for (const link of ['next_match_id', 'loser_next_match_id']) {
    const group = [match('x', 'a', 'b', { [link]: 'later' }), match('later', null, null, { status: 'in_progress' })];
    assert.equal(swappableAthletes(group).size, 0);
  }
});
test('missing links and duplicate appearances cannot be selected', () => {
  assert.equal(swappableAthletes([match('x', 'a', 'b', { next_match_id: 'missing' })]).size, 0);
  assert.equal(swappableAthletes([match('x', 'a', 'a')]).size, 0);
});
