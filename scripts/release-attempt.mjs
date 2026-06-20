#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const bump = process.argv[2];
const allowed = new Set(['patch', 'minor', 'major']);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function output(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function nextVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail(`package.json version is not plain semver: ${version}`);
  let [, major, minor, patch] = match.map(Number);
  if (bump === 'patch') patch += 1;
  if (bump === 'minor') {
    minor += 1;
    patch = 0;
  }
  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  }
  return `${major}.${minor}.${patch}`;
}

if (!allowed.has(bump)) {
  fail('Usage: npm run release:attempt -- <patch|minor|major>');
}

const branch = output('git', ['branch', '--show-current']);
if (branch !== 'main') fail(`release attempts must be started from main, not ${branch || 'detached HEAD'}`);

const dirty = output('git', ['status', '--porcelain']);
if (dirty) fail('working tree is dirty; commit or stash changes first');

run('git', ['fetch', 'origin', 'main', '--tags']);

const localHead = output('git', ['rev-parse', 'HEAD']);
const remoteHead = output('git', ['rev-parse', 'origin/main']);
if (localHead !== remoteHead) fail('local main is not at origin/main; pull/rebase before releasing');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const current = pkg.version;
const next = nextVersion(current, bump);
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const tag = `release-attempt/${bump}/from-${current}/${timestamp}`;
const workflowUrl = output('gh', ['repo', 'view', '--json', 'url', '--jq', '.url']).replace(/\/$/, '') + '/actions/workflows/jb-release-v1.yaml';

run('git', ['tag', tag]);
run('git', ['push', 'origin', tag]);

console.log('');
console.log(`✓ Pushed ${tag}`);
console.log(`  Current version: ${current}`);
console.log(`  Expected release: v${next}`);
console.log(`  Workflow: ${workflowUrl}`);
console.log('');
console.log('Watch with:');
console.log('  gh run list --workflow jb-release-v1.yaml --limit 5');
