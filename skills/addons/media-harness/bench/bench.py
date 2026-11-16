# Stage 5 measurement notebook for the media harness. Runs on Kaggle (2x T4), not locally.
# Paste into a Kaggle notebook cell (GPU T4 x2, Internet on), or upload as a script kernel.
# It only MEASURES: it writes one JSON line per test to /kaggle/working/bench_results.jsonl.
# Then download that file and run:  node skills/addons/media-harness/bench/parse.js bench_results.jsonl
#
# UNVERIFIED: this file was written without a GPU to test on. If a step errors, the error is
# recorded in the result line (ok=false) and the run continues; send the file back as is.
#
# Config: set MODEL_DATASET to the name of your private Kaggle Dataset holding the weights
# (mounted at /kaggle/input/<name>), or leave empty to time the Hugging Face download instead.
import json, os, time, traceback

MODEL_DATASET = os.environ.get("MODEL_DATASET", "")
# GPU quota is 30 h a week, so the session must never idle or hang: every stage checks this budget first,
# and the script exits (which ends the Kaggle session) as soon as the work is done or the budget is spent.
START = time.time()
BUDGET_S = int(os.environ.get("BENCH_BUDGET_S", "2700"))  # 45 min


ONLY = {x for x in os.environ.get("BENCH_ONLY", "").split(",") if x}  # empty = run everything; e.g. "juggernaut-x-v10,wan"


def want(x):
    return not ONLY or x in ONLY


MAX_FAIL = 3  # same as the coding worker: stop after 3 failures in a row rather than burn GPU on a broken setup
FAILS = 0


def ensure_deps():
    """Kaggle images lag: Wan needs ftfy, and peft needs torchao >= 0.16 to load the Lightning LoRA."""
    import subprocess, sys
    r = subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "diffusers", "ftfy", "torchao>=0.16", "peft"], capture_output=True, text=True, timeout=600)
    log({"test": "deps", "ok": r.returncode == 0, "note": (r.stderr or "")[-200:]})


def over_budget(need_s=0):
    return time.time() - START + need_s > BUDGET_S or FAILS >= MAX_FAIL
OUT = "/kaggle/working/bench_results.jsonl"
PROMPTS = [  # 6 art/abstract prompts, also rendered through Cloudflare for the side-by-side
    "abstract flowing ribbons of teal and gold light on a dark background, soft depth of field",
    "minimal geometric landscape at dusk, layered hills, grainy risograph print",
    "macro photograph of iridescent oil on water, deep blues and magentas",
    "isometric glass city in fog, pastel gradients, studio lighting",
    "ink drawing of a heron over a pale moon, wide margins, textured paper",
    "neon wireframe tunnel receding into darkness, subtle bloom",
]


# ---- content guardrails (rules live in guard.js; run.js injects them here; an unreplaced placeholder refuses to run) ----
import re
GUARD = json.loads("__GUARD_JSON__")
NEG = GUARD["negative"]
_clf = None


def prompt_ok(p):
    for words in GUARD["terms"].values():
        if re.search(r"(?<![a-z0-9])(?:" + "|".join(words) + r")(?![a-z0-9])", p, re.I):
            return False
    return True


def safe(img, label):
    """Output screen, kept OUT of every timed region so speed numbers and generation settings are untouched.
    Fail closed without crashing: a flagged image, or a classifier that cannot load, means the file is not kept."""
    global _clf
    try:
        if _clf is None:
            from transformers import pipeline
            _clf = pipeline("image-classification", model="Falconsai/nsfw_image_detection", device=-1)  # CPU: no VRAM, no GPU time
        score = next((r["score"] for r in _clf(img) if r["label"].lower() == "nsfw"), 0.0)
    except Exception as e:
        log({"test": "screen", "model": label, "ok": False, "error": "screen unavailable, output discarded: " + str(e)[:150]})
        return False
    if score >= 0.2:  # conservative threshold
        log({"test": "screen", "model": label, "ok": False, "error": f"blocked by the NSFW screen (score {score:.2f}); discarded"})
        return False
    return True


def log(rec):
    rec["t"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(OUT, "a") as f:
        f.write(json.dumps(rec) + "\n")
    print(rec)


def vram_gb():
    try:
        import torch
        return round(max(torch.cuda.max_memory_allocated(i) for i in range(torch.cuda.device_count())) / 1e9, 2)
    except Exception:
        return None


def timed(test, model, fn, **extra):
    global FAILS
    t0 = time.time()
    try:
        fn()
        FAILS = 0
        log({"test": test, "model": model, "seconds": round(time.time() - t0, 1), "ok": True, "vram_gb": vram_gb(), **extra})
    except Exception as e:
        FAILS += 1
        log({"test": test, "model": model, "seconds": round(time.time() - t0, 1), "ok": False, "error": str(e)[:300], "trace": traceback.format_exc()[-400:], **extra})


def source(repo, subdir):
    """Weights from the mounted Dataset when present, else the Hugging Face repo id."""
    if MODEL_DATASET:
        p = f"/kaggle/input/{MODEL_DATASET}/{subdir}"
        if os.path.isdir(p):
            return p, "dataset"
    return repo, "huggingface"


def flux(name, repo, subdir, steps):
    import torch
    from diffusers import FluxPipeline
    src, where = source(repo, subdir)
    holder = {}

    def load():
        # T4 is Turing: no bf16, no native fp8. fp16 plus CPU offload is the only safe default here.
        holder["pipe"] = FluxPipeline.from_pretrained(src, torch_dtype=torch.float16)
        holder["pipe"].enable_model_cpu_offload()

    timed("model_load", name, load, source=where)
    if "pipe" not in holder:
        return
    pipe = holder["pipe"]
    for i, prompt in enumerate(PROMPTS):
        def gen():
            img = pipe(prompt, height=1024, width=1024, num_inference_steps=steps, guidance_scale=3.5 if "dev" in name else 0.0).images[0]
            img.save(f"/kaggle/working/{name}_{i}.png")
        timed("image_1024", name, gen, steps=steps, prompt_index=i)
    del holder["pipe"]
    import gc
    gc.collect(); torch.cuda.empty_cache()


def sdxl():
    """Newest commercial-safe SDXL-line checkpoints (verified on the HF API 2026-11-16: ungated, diffusers format,
    creativeml-openrail-m). Juggernaut XI v11 is cc-by-nc-nd, so it is NOT used. fp16 fits a 16 GB T4 without offload."""
    import gc, torch
    from diffusers import AutoPipelineForText2Image
    models = [  # (name, repo, steps, guidance): steps and guidance follow the model cards, unverified here
        ("juggernaut-x-v10", "RunDiffusion/Juggernaut-X-v10", 30, 5.0),
        ("juggernaut-x-hyper", "RunDiffusion/Juggernaut-X-Hyper", 6, 2.0),
    ]
    for name, repo, steps, cfg in models:
        if not want(name):
            continue
        src, where = source(repo, name)
        holder = {}

        def load():
            try:
                holder["pipe"] = AutoPipelineForText2Image.from_pretrained(src, torch_dtype=torch.float16, variant="fp16", use_safetensors=True).to("cuda")
            except Exception:  # no fp16 variant files in this repo
                holder["pipe"] = AutoPipelineForText2Image.from_pretrained(src, torch_dtype=torch.float16, use_safetensors=True).to("cuda")

        timed("model_load", name, load, source=where)
        if "pipe" not in holder:
            continue
        pipe = holder["pipe"]
        for i, prompt in enumerate(PROMPTS):
            def gen():
                holder["img"] = pipe(prompt, negative_prompt=NEG, height=1024, width=1024, num_inference_steps=steps, guidance_scale=cfg).images[0]
            timed("image_1024", name, gen, steps=steps, prompt_index=i)  # timing covers generation only
            img = holder.pop("img", None)
            if img is not None and safe(img, name):
                img.save(f"/kaggle/working/{name}_{i}.png")
        del holder["pipe"], pipe
        gc.collect(); torch.cuda.empty_cache()


def wan(name, repo, subdir):
    import torch
    from diffusers import WanImageToVideoPipeline
    from diffusers.utils import export_to_video, load_image
    src, where = source(repo, subdir)
    holder = {}

    def load():
        holder["pipe"] = WanImageToVideoPipeline.from_pretrained(src, torch_dtype=torch.float16)
        holder["pipe"].enable_model_cpu_offload()

    timed("model_load", name, load, source=where)
    if "pipe" not in holder:
        return
    first = next((p for p in ("/kaggle/working/juggernaut-x-hyper_0.png", "/kaggle/working/flux-schnell_0.png") if os.path.exists(p)), "")
    if not first:  # no image model ran: time Wan on a plain gradient keyframe instead
        from PIL import Image
        first = "/kaggle/working/synthetic_keyframe.png"
        Image.linear_gradient("L").resize((832, 480)).convert("RGB").save(first)
        log({"test": "note", "model": name, "ok": True, "note": "no Flux keyframe, used a synthetic gradient; timing is valid, quality is not"})

    # Memory: the first Wan run was OOM-killed on the host (Killed). Tile/slice the VAE, return PIL frames (not float arrays),
    # and go up in length (33 then 81 frames) so a kill at 81 still leaves the 33-frame timing on disk to extrapolate from.
    try:
        holder["pipe"].vae.enable_tiling()
        holder["pipe"].vae.enable_slicing()
    except Exception:
        pass

    for nf in (33, 81):
        def gen():
            img = load_image(first).resize((832, 480))
            holder["frames"] = holder["pipe"](image=img, prompt=PROMPTS[0], height=480, width=832, num_frames=nf, num_inference_steps=4, guidance_scale=1.0, output_type="pil").frames[0]

        if over_budget(300):
            log({"test": "skipped", "model": name, "ok": False, "error": f"skipped {nf} frames: budget nearly spent"})
            break
        timed(f"video_{nf}f_480p", name, gen, frames=nf, steps=4)  # timing covers generation only
        frames = holder.pop("frames", None)
        if frames is not None:
            picks = [frames[k] for k in (0, len(frames) // 2, len(frames) - 1)]  # first, middle, last frame
            if all(safe(f, name) for f in picks):
                export_to_video(frames, f"/kaggle/working/{name}_{nf}f.mp4", fps=16)
            del frames
        import gc as _gc
        _gc.collect(); torch.cuda.empty_cache()


def two_workers():
    """Same 6 images on one GPU vs split across two processes. Needs Schnell weights available."""
    import subprocess, sys
    script = "/kaggle/working/_w.py"
    open(script, "w").write(
        "import os,sys,time,torch\nfrom diffusers import FluxPipeline\n"
        "gpu=sys.argv[1];n=int(sys.argv[2]);src=sys.argv[3]\nos.environ['CUDA_VISIBLE_DEVICES']=gpu\n"
        "p=FluxPipeline.from_pretrained(src,torch_dtype=torch.float16);p.enable_model_cpu_offload()\n"
        "for i in range(n):p('abstract light',height=1024,width=1024,num_inference_steps=4,guidance_scale=0.0)\n"
    )
    src, _ = source("black-forest-labs/FLUX.1-schnell", "flux-schnell")

    def one():
        subprocess.run([sys.executable, script, "0", "4", src], check=True, timeout=600)

    def two():
        ps = [subprocess.Popen([sys.executable, script, g, "2", src]) for g in ("0", "1")]
        for p in ps:
            assert p.wait(timeout=600) == 0

    timed("four_images_one_gpu", "flux-schnell", one)
    timed("four_images_two_gpus", "flux-schnell", two)


if __name__ == "__main__":
    import torch
    log({"test": "env", "gpus": [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())], "torch": torch.__version__, "dataset": MODEL_DATASET or None, "ok": True})
    bad = [p for p in PROMPTS if not prompt_ok(p)]
    if bad:
        log({"test": "blocked", "ok": False, "error": f"{len(bad)} prompt(s) refused by the content guard; nothing was run"})
        raise SystemExit(4)

    def stage(label, need_s, fn, *a, **k):
        if over_budget(need_s):
            log({"test": "skipped", "model": label, "ok": False, "error": f"skipped: {need_s}s needed, budget {BUDGET_S}s nearly spent"})
            return
        fn(*a, **k)

    # Both Flux repos are gated on Hugging Face: accept their terms with your account, then set HF_TOKEN.
    gated_ok = bool(MODEL_DATASET or os.environ.get("HF_TOKEN"))
    if gated_ok:
        stage("flux-schnell", 300, flux, "flux-schnell", "black-forest-labs/FLUX.1-schnell", "flux-schnell", steps=4)
        stage("flux-dev", 900, flux, "flux-dev", "black-forest-labs/FLUX.1-dev", "flux-dev", steps=20)
    else:
        log({"test": "skipped", "model": "flux", "ok": False, "error": "skipped: no Dataset and no HF_TOKEN (gated repos); not wasting GPU time on a certain 401"})
    ensure_deps()
    stage("sdxl", 420, sdxl)  # ungated: always runs, no token
    stage("wan22-5b", 1200, wan, "wan22-5b", "Wan-AI/Wan2.2-TI2V-5B-Diffusers", "wan22-5b")
    if gated_ok:
        stage("two-workers", 300, two_workers)
    log({"test": "done", "ok": True, "elapsed_s": round(time.time() - START)})
    # script ends here: the Kaggle session stops, no idle GPU time is left
