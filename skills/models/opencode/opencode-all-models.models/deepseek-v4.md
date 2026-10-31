<!-- Read when: DeepSeek V4 protocol (Pro/Flash): cheap reasoning, cache-hit pricing discipline. Trigger when working with, routing to or configuring DeepSeek V4. -->
# DeepSeek V4 Pro — Cost-Efficient Reasoner Protocol

MIT license · ~$0.435 in (cache-miss) / $0.87 out per MTok — **note: this is a promotional discount (originally through 2026-05-31, still live 2026-07); expect up to ~4× higher when it ends.** Frontier-adjacent reasoning (~70% SWE-bench Verified) at near-Haiku prices — the value pick for deep reasoning and review.

## Staleness guard
Facts verified 2026-07 (web). The discount pricing is explicitly temporary — re-verify price before any cost-based routing decision; log corrections in `learnings.md`.

## Where it shines
- Deep reasoning on a budget: code review, architecture analysis, debugging hypotheses — tasks where you want frontier-grade thinking but the volume makes GLM-5.2 pricing sting.
- Second-opinion duty: cheap enough to run as a reviewer over another model's output without doubling costs.

## Driving discipline
- **Cache-miss vs cache-hit pricing differ** — same rule as GLM: byte-stable prefixes, volatile content last.
- **Don't anchor plans to today's price.** Route to it for capability-per-dollar, but keep the routing table easy to re-point when the discount ends.
- Flash variant exists for cheaper/faster low-stakes calls — check the provider's current variant list before assuming Pro is the only tier.
- MIT license: fine-tuning and commercial use are safe; confirm the shipped license per release.
- Two failures on a hard task → escalate to GLM-5.2 with failure context attached, don't retry a third time.
