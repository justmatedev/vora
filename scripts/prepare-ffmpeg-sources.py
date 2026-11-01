"""Prepare source materials from the exact upstream FFmpeg build artifacts.

Python 3.12+ maintenance command. Archives are read as data, never executed.
Large source caches are split to fit GitHub Release asset limits.
"""

import argparse
import concurrent.futures
import hashlib
import json
import re
import shutil
import tarfile
from pathlib import Path

FFMPEG_COMMIT = "8dca1586f468bfcbb78ae3ed618af1361d9f140a"
RECIPES_COMMIT = "5031c6f1082414e53688d39e521849905071070d"
UPSTREAM_RUN = 41199749965


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def is_notice(path):
    if path.suffix.lower() in {".c", ".cc", ".cpp", ".h", ".rs", ".js", ".py"}:
        return False
    return bool(re.match(r"^(licen[sc]e|copying|notice|copyright)([._-]|$)", path.name, re.I))


def scan(archive_path, destination):
    stage = archive_path.name.split("_", 1)[0]
    result = destination / f"{stage}.txt"
    records = []
    with result.open("w") as output, tarfile.open(archive_path, "r|xz") as archive:
        for member in archive:
            path = Path(member.name)
            if not member.isfile() or ".git" in path.parts or not is_notice(path):
                continue
            if member.size > 8 * 1024 * 1024:
                raise ValueError(f"Aviso grande requer revisão: {stage}/{member.name}")
            content = archive.extractfile(member).read()
            if b"\0" in content:
                continue
            output.write(f"===== {stage} / {member.name} =====\n")
            output.write(content.decode("utf-8", errors="replace") + "\n\n")
            records.append({"path": member.name, "sha256": hashlib.sha256(content).hexdigest()})
    # Some header libraries (e.g. nv-codec-headers) put their permission notice
    # in source comments instead of providing a separate LICENSE file.
    if not records:
        with result.open("a") as output, tarfile.open(archive_path, "r|xz") as archive:
            for member in archive:
                path = Path(member.name)
                if not member.isfile() or ".git" in path.parts or path.suffix not in {".c", ".h", ".cpp"}:
                    continue
                prefix = archive.extractfile(member).read(65536).decode("utf-8", errors="replace")
                match = re.match(r"\s*((?:/\*.*?\*/\s*)+)", prefix, re.S)
                if not match or not re.search(r"copyright|permission|license", match[1], re.I):
                    continue
                content = match[1]
                output.write(f"===== {stage} / {member.name} (source header) =====\n{content}\n\n")
                records.append({"path": member.name, "sourceHeader": True,
                                "sha256": hashlib.sha256(content.encode()).hexdigest()})
    print(f"{stage}: {len(records)} aviso(s)", flush=True)
    return {"archive": archive_path.name, "sha256": digest(archive_path), "noticeFiles": records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["cache", "recipes", "ffmpeg-source", "linux-log", "windows-log", "output"]:
        parser.add_argument(f"--{name}", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    work = args.output / "work"
    work.mkdir(exist_ok=True)
    with tarfile.open(args.cache) as archive:
        archive.extractall(work, filter="data")
    originals = sorted((work / ".cache/downloads").glob("*_*.tar.xz"))
    if not originals:
        raise ValueError("Cache de fontes vazio")
    notices_dir = args.output / "notices"
    notices_dir.mkdir(exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(lambda p: scan(p, notices_dir), originals))
    combined = args.output / "FFmpeg-THIRD_PARTY_NOTICES.txt"
    with combined.open("w") as output:
        output.write("FFmpeg BtbN source-cache notices\nIncludes optional and unused build variants; not a binary SBOM.\n\n")
        for file in sorted(notices_dir.glob("*.txt")):
            output.write(file.read_text())
    inputs = {"recipes.tar.gz": args.recipes, "ffmpeg-source.tar.gz": args.ffmpeg_source,
              "linux-build.log": args.linux_log, "windows-build.log": args.windows_log}
    for name, path in inputs.items():
        shutil.copyfile(path, args.output / name)
    parts = []
    with args.cache.open("rb") as source:
        number = 1
        while True:
            name = f"ffmpeg-dependency-sources.tar.gz.part{number:02}"
            path = args.output / name
            remaining = 1024 * 1024 * 1024
            with path.open("wb") as target:
                while remaining:
                    chunk = source.read(min(8 * 1024 * 1024, remaining))
                    if not chunk:
                        break
                    target.write(chunk)
                    remaining -= len(chunk)
            if not path.stat().st_size:
                path.unlink()
                break
            parts.append({"file": name, "sha256": digest(path), "bytes": path.stat().st_size})
            number += 1
    configure = {}
    for target, path in [("linux-x64", args.linux_log), ("win-x64", args.windows_log)]:
        lines = path.read_text(errors="replace").splitlines()
        command = next((line.split("+ ./configure ", 1)[1] for line in lines if "+ ./configure " in line), None)
        if command is None or "--enable-gpl" in command or "--enable-nonfree" in command:
            raise ValueError(f"Configuração inesperada para {target}")
        configure[target] = "./configure " + command
    report = {"ffmpegCommit": FFMPEG_COMMIT, "recipesCommit": RECIPES_COMMIT,
              "upstreamRun": UPSTREAM_RUN, "cacheSha256": digest(args.cache),
              "cacheArtifactId": 13042311561, "configure": configure,
              "parts": parts, "dependencies": records,
              "files": [{"file": name, "sha256": digest(path)} for name, path in inputs.items()]}
    (args.output / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"Fontes preparadas: {len(records)} arquivos de dependências, {len(parts)} partes.", flush=True)


if __name__ == "__main__":
    main()
