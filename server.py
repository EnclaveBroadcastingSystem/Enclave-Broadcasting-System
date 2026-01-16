import http.server, socketserver, os, json, urllib.parse
from pathlib import Path

PORT = 8000
ROOT = Path(__file__).resolve().parent

def apply_theme():
    theme = "classic"
    try:
        t = (ROOT / "themes" / "theme.txt").read_text(encoding="utf-8").strip()
        if t:
            theme = t
    except Exception:
        pass
    src = ROOT / "themes" / f"{theme}.css"
    dst = ROOT / "public" / "theme.css"
    if src.exists():
        dst.write_text(src.read_text(encoding="utf-8", errors="ignore"), encoding="utf-8")

def scan_library():
    # Case-insensitive extension match + ignores empty files
    audio_root = ROOT / "audio"
    out = {}
    exts = {".mp3", ".m4a", ".wav"}
    for key in ["music", "voa", "dead"]:
        folder = audio_root / key
        files = []
        if folder.exists():
            for p in sorted(folder.iterdir()):
                if p.is_file() and p.suffix.lower() in exts:
                    try:
                        if p.stat().st_size > 0:
                            files.append(p.name)
                    except Exception:
                        pass
        out[key] = files
    return out

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Serve files relative to project root (and decode %20 etc)
        parsed = urllib.parse.urlparse(path).path
        decoded = urllib.parse.unquote(parsed)
        full = (ROOT / decoded.lstrip("/")).resolve()
        if str(full).startswith(str(ROOT)):
            return str(full)
        return str(ROOT)

    def do_GET(self):
        if self.path.startswith("/api/library"):
            lib = scan_library()
            payload = json.dumps(lib).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        return super().do_GET()

if __name__ == "__main__":
    apply_theme()
    os.chdir(str(ROOT))
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving {ROOT} on http://127.0.0.1:{PORT}")
        httpd.serve_forever()
