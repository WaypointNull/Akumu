# Changelog

All the ways this project has made me question my choices. In order.

---

## 1.2.1 — *"Small fixes, UwU"*

**The stress test finally knows about LoRAs.**

My LoRA feature was going untested — a nightmare in disguise. The stress cases now carry their own made-up trigger lists, and each run reports how many output tags are echoes of them.

Speaking of echoes: they're gone. The LLM loved to repeat the trigger list back into the descriptor tags (so the Global Output said "veil, tiara, long black sleeveless dress" twice). A deterministic strip now drops any descriptor tag that duplicates a trigger phrase, since the formatter already appends the trigger list verbatim anyway.

**New noise filter.**

Junk compounds like `library_setting -> library, setting` or `light_clothed -> light, clothed` no longer auto-accept into the output. Those parts are too vague to stand alone, so they go to review instead.

**Prompt adjusted... again.**

Few-shot examples rebuilt from real high-rated Danbooru posts (score 300+). Turns out there are other tools doing this whole "natural language to booru tags" thing, and I'd built a nightmare of a tool without studying them first :3

**A safeguard for the stop words.**

`format.js` now checks whether the resolved tags actually share any words with the input. If the LLM hallucinates a whole scene ("Test tag, please ignore" -> 20 invented tags, anyone?), the unanchored tags get withheld from the output instead of shipped.

---

## 1.2.0 — *"Maybe the LLM shouldn't have a nightmare as a treat after all"*

**Creative mode grew up.**

It's no longer a separate LLM call. Same model, same temperature — the mode only changes what the validator does with invented tags. Strict rewrites them; Creative surfaces them to review like the little hallucinations they are.

**The NSFW filter got more teeth.**

More stems (`nude`, `naked`, `underwear`, `lingerie`, `feces`, `condom`...) and exact tokens (`ass`, `butt`, `anal`...). A filter that misses `candle_in_ass` is a filter that's not trying.

**Fought the low tag count... and overcorrected.**

The prompt was reworked to stop the LLM from summarizing a whole scene into six tags. Which, of course, immediately swung the other way into a nightmare of padding and category-word spam. You know. Balance.

**Duplicates no longer number themselves.**

The `please_ignore_1` ... `please_ignore_20` era is over. Numbered padding collapses; real numbered tags like `figure_17` survive.

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
