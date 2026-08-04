# Changelog

All the ways this project has made me question my choices. In order.

---

## 1.1.0 — *The "Let the AI have a nightmare as a treat" release*

**New: Creative mode.**

Strict mode is for when I want every tag fact-checked against the tag list like a paranoid landlord.

Creative mode is for when I'm tired of the landlord.

The AI gets to invent tags now. `red_flannel_jacket`? Go off, king. You approve each one in Tag Review instead of Akumu silently rewriting it. Because sometimes... hallucinated tags are just fine :3

**New: LoRA tags actually get fed into the context now.**

Turns out... the LLM generates better tags when it knows your LoRA triggers exist. Wild concept. The trigger lines now get injected into Pass 1 as context (marked very clearly so the LLM knows not to echo them back), instead of being bolted onto the output at the end like an afterthought.

Because sometimes, the context matters too much.

**Fix: runaway mega-compounds can't flood your output anymore.**

The LLM had a bad habit of inventing absolute monstrosities like:

> `motorcycle_brake_fluid_thermal_cycling_optimization_test_simulation_analysis_optimization`

And that's just a nightmare.

There's now a sanity cap: any tag with more than 7 underscores that doesn't actually exist in the tag list gets routed to review instead of being trusted. Real series titles with long names (`ore_no_imouto_ga_konna_ni_kawaii_wake_ga_nai`, I'm looking at you) still pass through, because they're legit — the cap only eats the invented garbage.

**Also:** the whole thing got stress-tested (20 prompts × 2 modes = 40 runs) and benchmarked (92.6% recovery, 0 wrong). Because I apparently care.

---

## 1.0.1 — *Patch*

- Tag Review list no longer overflows — candidate tags and the Keep/Remove buttons are now separate rows, and long tag lists scroll horizontally.

Because tags too long are a nightmare :3

---

## 1.0.0 — *The nightmare has come to an end.*

The first real release.

Akumu runs 100% locally via Ollama. Natural language in, validated booru-style prompt out.

You'll need Ollama installed (`ollama pull qwen2.5:7b`).

For now...

I just know myself.

Eventually I'll add plugins, modules, probably even a separate downloadable local IllustriousSDXL running...

But for now.

It is over!

NO MORE!
