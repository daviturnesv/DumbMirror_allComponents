import json, queue, threading, os, sys, time, argparse
from pathlib import Path

try:
    import sounddevice as sd
    from vosk import Model, KaldiRecognizer
except Exception as e:
    print(f"ERRO_IMPORT: {e}")
    sys.exit(1)

DEFAULT_MODEL = "models/vosk-pt-small"  # alvo preferido; será auto-detectado se não existir
ROOT = Path(__file__).resolve().parent.parent.parent  # MagicMirror root
CMD_FILE = Path(__file__).resolve().parent / "voice_cmd.txt"


def _list_dir(p: Path):
    try:
        return [c.name for c in p.iterdir()]
    except Exception:
        return []


def _detect_model_fallback():
    models_root = ROOT / 'models'
    if not models_root.exists():
        return None
    candidates = []
    for d in models_root.iterdir():
        if d.is_dir():
            name = d.name.lower()
            if 'vosk' in name and ('pt' in name or 'portugues' in name):
                candidates.append(d)
    # Prefer those containing expected subdirs (am/ or conf/)
    scored = []
    for c in candidates:
        contents = set(_list_dir(c))
        score = 0
        for expected in ('am', 'graph', 'conf', 'ivector'):  # typical folders
            if expected in contents:
                score += 1
        scored.append((score, c))
    if not scored:
        return None
    scored.sort(reverse=True)
    return scored[0][1]


def _maybe_unwrap_nested(mp: Path):
    """Se mp contém exatamente uma subpasta que contém 'am', usa a subpasta (caso extração criou nível extra)."""
    if not mp.exists() or not mp.is_dir():
        return mp
    children = [c for c in mp.iterdir() if c.is_dir()]
    if len(children) == 1:
        inner = children[0]
        inner_contents = set(_list_dir(inner))
        if 'am' in inner_contents or 'conf' in inner_contents:
            return inner
    return mp


def load_model(model_path: str):
    mp = ROOT / model_path if not os.path.isabs(model_path) else Path(model_path)
    if not mp.exists():
        print(f"AVISO: Caminho direto não encontrado: {mp}")
        fallback = _detect_model_fallback()
        if fallback:
            print(f"USANDO MODELO DETECTADO: {fallback}")
            mp = fallback
        else:
            print("MODEL_NAO_ENCONTRADO: Nenhum diretório de modelo Vosk PT localizado em ./models")
            print("DICA: Extraia o conteúdo do zip/tar.gz de modelo diretamente para 'models/vosk-pt-small' ou similar")
            sys.exit(2)
    mp = _maybe_unwrap_nested(mp)
    print(f"Carregando modelo: {mp}")
    print(f"Conteúdo do diretório do modelo: {', '.join(_list_dir(mp))}")
    return Model(str(mp))


def recognize_loop(model_folder: str, sample_rate: int = 16000):
    model = load_model(model_folder)
    rec = KaldiRecognizer(model, sample_rate)
    rec.SetWords(False)

    q = queue.Queue()

    def audio_cb(indata, frames, time_info, status):  # noqa: ARG001
        q.put(bytes(indata))
        return None

    with sd.RawInputStream(samplerate=sample_rate, blocksize=8000, dtype='int16', channels=1, callback=audio_cb):
        print("CAPTURA_AUDIO_INICIADA")
        last_write = 0
        while True:
            data = q.get()
            if rec.AcceptWaveform(data):
                res = json.loads(rec.Result())
                text = (res.get('text') or '').strip()
                if text:
                    write_command(text)
            else:
                # parcials = json.loads(rec.PartialResult()).get('partial')
                pass
            # flush periodic status
            if time.time() - last_write > 30:
                last_write = time.time()
                print("ALIVE", flush=True)


def write_command(text: str):
    TMP = CMD_FILE
    try:
        TMP.write_text(text + "\n", encoding='utf-8')
        print(f"RECO:{text}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"ERRO_WRITE_CMD: {e}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default=DEFAULT_MODEL, help='Pasta do modelo (relativa à raiz MagicMirror ou absoluta)')
    ap.add_argument('--rate', type=int, default=16000)
    args = ap.parse_args()
    try:
        recognize_loop(args.model, args.rate)
    except KeyboardInterrupt:
        print("SAINDO")


if __name__ == '__main__':
    main()
