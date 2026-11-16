#!/usr/bin/env node
// Stop hook: blocks the end of a turn when the last assistant text does not open with the AI-01 token [CX].
// Reads the hook JSON on stdin ({ transcript_path, stop_hook_active }). Fails open on any read or parse problem.
import * as fs from 'node:fs';

const TOKEN = /^\s*\[CX[\]\s:]/;

function lastAssistantText(transcript: string): string | undefined {
  const lines = transcript.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.type !== 'assistant') continue;
      const parts = Array.isArray(e.message?.content) ? e.message.content : [];
      const texts = parts.filter((p: { type?: string; text?: string }) => p.type === 'text' && p.text?.trim());
      if (texts.length) return texts[texts.length - 1].text;
    } catch { /* skip a bad line */ }
  }
  return undefined;
}

function main(): void {
  let input: { transcript_path?: string; stop_hook_active?: boolean } = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path) return; // one re-prompt at most, never a loop
  let text: string | undefined;
  try { text = lastAssistantText(fs.readFileSync(input.transcript_path, 'utf8')); } catch { return; }
  if (text === undefined || TOKEN.test(text)) return;
  console.error('AI-01: your last reply did not begin with the [CX] token from CLAUDE.md. Restate it with the token first.');
  process.exitCode = 2;
}

main();
