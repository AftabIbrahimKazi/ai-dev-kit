#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// Stop hook: blocks the end of a turn when the last assistant text does not open with the AI-01 token [CX].
// Reads the hook JSON on stdin ({ transcript_path, stop_hook_active }). Fails open on any read or parse problem.
const fs = __importStar(require("node:fs"));
const TOKEN = /^\s*\[CX[\]\s:]/;
function lastAssistantText(transcript) {
    const lines = transcript.split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const e = JSON.parse(lines[i]);
            if (e.type !== 'assistant')
                continue;
            const parts = Array.isArray(e.message?.content) ? e.message.content : [];
            const texts = parts.filter((p) => p.type === 'text' && p.text?.trim());
            if (texts.length)
                return texts[texts.length - 1].text;
        }
        catch { /* skip a bad line */ }
    }
    return undefined;
}
function main() {
    let input = {};
    try {
        input = JSON.parse(fs.readFileSync(0, 'utf8'));
    }
    catch {
        return;
    }
    if (input.stop_hook_active || !input.transcript_path)
        return; // one re-prompt at most, never a loop
    let text;
    try {
        text = lastAssistantText(fs.readFileSync(input.transcript_path, 'utf8'));
    }
    catch {
        return;
    }
    if (text === undefined || TOKEN.test(text))
        return;
    console.error('AI-01: your last reply did not begin with the [CX] token from CLAUDE.md. Restate it with the token first.');
    process.exitCode = 2;
}
main();
