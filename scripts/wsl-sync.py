"""Mirror source into a private Linux workspace without sharing node_modules."""
import json
import pathlib
import shutil
import sys

source = pathlib.Path(sys.argv[1]).resolve(strict=True)
target = pathlib.Path(sys.argv[2]).resolve(strict=True)
if source == target or target.name == "" or target.parent.name != "workspaces":
    raise SystemExit("Unsafe development mirror destination")
roots = [source / name for name in ("src", "scripts", "test", "docs", ".github")]
files = [p for p in source.iterdir() if p.is_file() and (p.suffix == ".md" or p.name in (
    "package.json", "package-lock.json", "LICENSE", "UNIX-THIRD-PARTY-NOTICES.txt", ".gitignore"))]
for root in roots:
    files.extend(p for p in root.rglob("*") if p.is_file() and not p.is_symlink())
ignored = {"PADCodex", "PADCodex.exe", "auth.json"}
manifest = target / ".pad-source-manifest.json"
current = set()
for file in files:
    relative = file.relative_to(source)
    if file.is_symlink() or file.name in ignored or file.name.startswith(".env") or file.suffix in (".dpapi", ".pyc") or "__pycache__" in relative.parts:
        continue
    destination = target / relative
    if not destination.resolve().is_relative_to(target):
        raise SystemExit("Unsafe development mirror path")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file, destination)
    current.add(relative.as_posix())
for old in json.loads(manifest.read_text()) if manifest.exists() else []:
    stale = target / old
    if not stale.resolve().is_relative_to(target):
        raise SystemExit("Unsafe stale source path")
    if old not in current and stale.is_file():
        stale.unlink()
manifest.write_text(json.dumps(sorted(current)))
