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


def over_budget(need_s=0):
    return time.time() - START + need_s > BUDGET_S
OUT = "/kaggle/working/bench_results.jsonl"
PROMPTS = [  # 6 art/abstract prompts, also rendered through Cloudflare for the side-by-side
    "abstract flowing ribbons of teal and gold light on a dark background, soft depth of field",
    "minimal geometric landscape at dusk, layered hills, grainy risograph print",
    "macro photograph of iridescent oil on water, deep blues and magentas",
    "isometric glass city in fog, pastel gradients, studio lighting",
    "ink drawing of a heron over a pale moon, wide margins, textured paper",
    "neon wireframe tunnel receding into darkness, subtle bloom",
]


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
    t0 = time.time()
    try:
        fn()
        log({"test": test, "model": model, "seconds": round(time.time() - t0, 1), "ok": True, "vram_gb": vram_gb(), **extra})
    except Exception as e:
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
    first = "/kaggle/working/flux-schnell_0.png"
    if not os.path.exists(first):  # Flux did not run: time Wan on a plain gradient keyframe instead
        from PIL import Image
        first = "/kaggle/working/synthetic_keyframe.png"
        Image.linear_gradient("L").resize((832, 480)).convert("RGB").save(first)
        log({"test": "note", "model": name, "ok": True, "note": "no Flux keyframe, used a synthetic gradient; timing is valid, quality is not"})

    def gen():
        img = load_image(first).resize((832, 480))
        frames = holder["pipe"](image=img, prompt=PROMPTS[0], height=480, width=832, num_frames=81, num_inference_steps=4, guidance_scale=1.0).frames[0]
        export_to_video(frames, f"/kaggle/working/{name}.mp4", fps=16)

    timed("video_81f_480p", name, gen, frames=81, steps=4)


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
    stage("wan22-5b", 1200, wan, "wan22-5b", "Wan-AI/Wan2.2-TI2V-5B-Diffusers", "wan22-5b")
    if gated_ok:
        stage("two-workers", 300, two_workers)
    log({"test": "done", "ok": True, "elapsed_s": round(time.time() - START)})
    # script ends here: the Kaggle session stops, no idle GPU time is left
