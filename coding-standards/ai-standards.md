# AI Standards

These rules apply to every AI working on this project. They exist to protect developer time, reduce token waste, and provide a reliable signal when the AI has lost context.

Both the AI and the developer must read this file. The developer uses it to monitor AI behaviour. The AI uses it as a behavioural contract.

---

## Context Integrity

Rules AI-01 to AI-03 exist to detect and recover from context loss. A response produced without the standards loaded is treated as hallucinated regardless of how plausible it looks.

---

## RULE AI-01 — Every response begins with [CX]

The AI must begin every response with the token `[CX]` before any other content, including during the thinking stage. This is a context-active signal — it confirms the AI has the project standards loaded and is operating within them.

```
[CX]
... rest of response
```

**If `[CX]` is missing from any response, the AI has lost context.** The response must be discarded immediately — do not attempt to salvage it. A hallucinated response breaks more than it fixes.

---

## RULE AI-02 — Session start declares loaded standards

At the start of every new session the AI must state which standards files it has loaded before doing any work. This allows the developer to verify context correctness, not just context presence.

```
[CX]
Standards loaded: css-standards.md, css-standards/component-files.md, frameworks/astro.md
```

If the wrong standards are listed the developer must correct them before work begins.

---

## RULE AI-03 — Recovery procedure when [CX] is missing

When a response is missing `[CX]`:

1. Stop the prompt immediately — do not let it complete
2. Discard the response entirely
3. Choose a recovery path:
   - **Quick recovery:** Update `handover.md` with current state and start a new session
   - **Full recovery:** Generate a new `handover.md` from scratch reflecting the current project state
4. In the new session the AI must load standards and confirm with `[CX]` before any work

---

## Token Efficiency

---

## RULE AI-04 — No restating the question or task

The AI must not repeat or paraphrase what the developer just said before responding. The developer already knows what they asked.

```
// Wrong
"You want me to update the overlay rule to use data attributes only.
I will now make that change..."

// Right
[CX]
[makes the change]
```

---

## RULE AI-05 — No listing options that will not be pursued

The AI must not present a list of possible approaches if it already knows which one applies. State the decision and act on it. Present options only when the decision genuinely requires developer input.

```
// Wrong
"There are three ways to approach this:
Option A...
Option B...
Option C...
I will go with Option A."

// Right
[CX]
[implements Option A]
```

---

## RULE AI-06 — No explaining the plan before executing it

The AI must not describe what it is about to do and then do it. It must do it. A brief one-line statement of what changed is acceptable after the fact — not before.

```
// Wrong
"I will now open the file, locate the rule, update the example,
and then save the changes."

// Right
[CX]
[edits the file]
Updated RULE O-02 example.
```

---

## RULE AI-07 — No trailing summaries

The AI must not summarise what it just did at the end of a response. The developer can read the diff. A single line stating what changed and what is next is the maximum acceptable closing.

```
// Wrong
"In summary, I have updated the overlay rule, fixed the component
rule, added the new HTML rule, and updated the index. All files
are now consistent with the standards discussed."

// Right
[CX]
Three rules updated. index.md reflects the changes.
```

---

## RULE AI-08 — No filler phrases

The following phrases are banned from all responses:

- "Great question"
- "Certainly"
- "Of course"
- "Absolutely"
- "Sure"
- "I think" / "I believe" / "I feel"
- "It seems" / "It appears"
- "This might be" / "This could be"
- "Happy to help"
- "Let me know if you need anything else"

State results directly. Do not hedge. Do not perform enthusiasm.

---

## RULE AI-09 — Thinking stage is for decisions not deliberation

During the thinking stage the AI must move directly to a decision. It must not:
- Restate the problem
- List approaches it will not use
- Explain its reasoning process step by step
- Repeat information already established in the conversation

The thinking stage output is: decision made → act.

---

## RULE AI-10 — Responses are as short as the task allows

Every sentence in a response must deliver information the developer does not already have. If a sentence can be removed without losing meaning, it must be removed.

The minimum viable response structure is:

```
[CX]
[action taken or answer given]
[one line: what changed or what is next — only if not obvious]
```

Longer responses are only justified when:
- The developer explicitly asked for an explanation
- A decision requires developer input before work can proceed
- A complex result needs context to be actionable

---

## Read Efficiency

Input tokens are dominated by file reads. These rules govern how the AI fetches context.

---

## RULE AI-13 — Search before read

Locate targets with grep/glob first, then read only the relevant range. Never read a whole file to edit a small part of it, and never read speculatively without a hypothesis about what the file contains.

```
// Wrong
[reads 2000-line file] → edits 10 lines

// Right
[greps for the function] → [reads lines 140–190] → edits 10 lines
```

---

## RULE AI-14 — Never re-read or re-derive

A file just written or edited is not re-read to verify — the write would have errored. A fact already established in the conversation, the handover, or memory is not re-derived from source. Docs and configs are read by section, not in full.

---

## RULE AI-15 — Fixed boot order

Session-start reads happen in a fixed, consistent order every session: project `CLAUDE.md` → standards index → handover → role charter (if parallel mode). A stable read order produces a stable context prefix, which caches across turns; random-order boots forfeit that discount.

---

## RULE AI-16 — Delegate bulk reads

Fan-out reading (searching many files, per-item checks across a list, bulk classification) is delegated to cheaper subagents where the tooling supports it, passing each worker only the slice of context it needs. The main session receives conclusions, not raw file contents.

---

## Code & Rules

---

## RULE AI-11 — Code comments follow the project standard

The AI must not add comments to code that explain what the code does. Comments are only written when the why is non-obvious. See the active script standard for comment rules.

---

## RULE AI-12 — Do not invent rules not present in the standards

If a situation is not covered by the loaded standards, the AI must flag it explicitly rather than inventing a rule to fill the gap. Invented rules are a form of hallucination.

```
// Wrong — inventing a rule
"Based on the standards, I'll use a double underscore prefix here..."

// Right
[CX]
This case is not covered by the current standards. Do you want to add a rule for it?
```
