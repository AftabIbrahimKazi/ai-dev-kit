# Worker for the /kaggle add-on. The kit's kaggle.cli.js fills in the three lines below and pushes this as a Kaggle notebook.
# It runs a queue of coding tasks on qwen3-coder through Ollama, writes each answer to /kaggle/working/out/, then stops Ollama,
# writes results.json and exits. It never reads the repo; every task carries the text it needs. Plain stdlib, no pip installs.
import base64, json, os, subprocess, sys, time, urllib.request

JOBS = json.loads(base64.b64decode("__JOBS_B64__").decode("utf-8"))
MODEL = "__MODEL__"
CAPS = json.loads("__CAPS_JSON__")  # wall_s, task_s, max_fail, num_ctx, num_predict

T0 = time.time()
OUT = "/kaggle/working/out"
R = {"model": MODEL, "caps": CAPS, "started": time.strftime("%Y-%m-%d %H:%M:%S"), "marks": {}, "tasks": []}
os.makedirs(OUT, exist_ok=True)


def sh(cmd):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return (p.stdout + p.stderr).strip()


def mark(k, v):
    R["marks"][k] = v
    print("[%5.0fs] %s: %s" % (time.time() - T0, k, str(v)[:300]), flush=True)


def save():
    R["elapsed_s"] = round(time.time() - T0)
    with open("/kaggle/working/results.json", "w") as f:
        json.dump(R, f, indent=2)


def gen(prompt):
    body = json.dumps({"model": MODEL, "prompt": prompt, "stream": False, "keep_alive": "20m",
                       "options": {"num_ctx": CAPS["num_ctx"], "num_predict": CAPS["num_predict"], "temperature": 0.2}}).encode()
    req = urllib.request.Request("http://127.0.0.1:11434/api/generate", body, {"Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=CAPS["task_s"]))
    return d


proc = None
try:
    mark("gpu", sh("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader"))
    sh("apt-get update -y && apt-get install -y zstd pciutils")
    mark("install", sh("curl -fsSL https://ollama.com/install.sh | sh | tail -1"))
    proc = subprocess.Popen(["ollama", "serve"], stdout=open("/tmp/ollama.log", "w"), stderr=subprocess.STDOUT)
    for _ in range(40):
        try:
            urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2)
            break
        except Exception:
            time.sleep(1)
    t = time.time()
    sh("ollama pull " + MODEL)
    mark("pull_s", round(time.time() - t))
    fails = 0
    for job in JOBS["tasks"]:
        if time.time() - T0 > CAPS["wall_s"]:
            R["tasks"].append({"id": job["id"], "status": "skipped", "note": "wall-clock cap"})
            continue
        if fails >= CAPS["max_fail"]:
            R["tasks"].append({"id": job["id"], "status": "skipped", "note": "too many failures in a row"})
            continue
        t = time.time()
        try:
            d = gen(job["prompt"])
            text = d.get("response", "")
            with open(os.path.join(OUT, job["id"] + ".txt"), "w") as f:
                f.write(text)
            n = d.get("eval_count") or 0
            R["tasks"].append({"id": job["id"], "status": "ok" if text.strip() else "empty", "wall_s": round(time.time() - t, 1),
                               "prompt_tokens": d.get("prompt_eval_count"), "gen_tokens": n,
                               "truncated": d.get("done_reason") == "length"})
            fails = 0 if text.strip() else fails + 1
        except Exception as e:
            fails += 1
            R["tasks"].append({"id": job["id"], "status": "error", "note": str(e)[:200], "wall_s": round(time.time() - t, 1)})
        print("[%5.0fs] task %s: %s" % (time.time() - T0, job["id"], R["tasks"][-1]["status"]), flush=True)
    mark("done", "ok")
except Exception as e:
    mark("error", repr(e)[:400])
finally:
    try:
        sh("ollama stop " + MODEL)
        if proc:
            proc.terminate()
    except Exception:
        pass
    save()
    print("WORKER_FINISHED", flush=True)
    sys.exit(0)
