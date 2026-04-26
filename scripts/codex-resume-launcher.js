#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const isResumeCommand = args[0] === 'resume';
const resumeArgs = args.slice(1);
const shouldInterceptResume =
  isResumeCommand &&
  (resumeArgs.length === 0 || (resumeArgs.length === 1 && resumeArgs[0] === '--all'));

const userHome = process.env.USERPROFILE || process.env.HOME || '';
const helperPath =
  process.env.CODEX_RESUME_FIX_HELPER ||
  path.join(userHome, '.codex', 'tools', 'codex-resume-picker.js');
const upstreamPath = path.join(__dirname, 'codex.upstream.resume-fix.js');

function exitWith(result) {
  process.exit(typeof result.status === 'number' ? result.status : 1);
}

if (shouldInterceptResume && existsSync(helperPath)) {
  const helperArgs = [helperPath, '--pick', '--limit', '50'];
  if (!resumeArgs.includes('--all')) {
    helperArgs.push('--cwd', process.cwd());
  }

  const result = spawnSync(process.execPath, helperArgs, {
    stdio: 'inherit',
    env: process.env,
  });

  exitWith(result);
}

if (!existsSync(upstreamPath)) {
  console.error(`Missing upstream Codex launcher backup: ${upstreamPath}`);
  console.error('Rerun the Codex resume fix installer to repair the launcher.');
  process.exit(1);
}

await import(pathToFileURL(upstreamPath).href);
