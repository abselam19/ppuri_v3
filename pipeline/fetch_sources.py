#!/usr/bin/env python3
"""Download the inputs of build_data.py into pipeline/sources/ (standard library only).

    python fetch_sources.py            # everything (about 360 MB)
    python fetch_sources.py --no-dict  # hanja tables only, if you downloaded the dictionary yourself

The dictionary files come from a GitHub mirror of NIKL's 한국어기초사전 (2019 snapshot).
For the newest version, download the full dictionary (XML) from
https://krdict.korean.go.kr -> 사전 내려받기, unzip it into a folder, and pass that
folder to build_data.py with --krdict.
"""
import argparse
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "sources")
MIRROR = "https://raw.githubusercontent.com/spellcheck-ko/korean-dict-nikl-krdict/master/"
MIRROR_FILES = ["5000", "10000", "15000", "20000", "25000", "30000", "35000", "40000", "45000", "50000", "51947"]
HANJA = "https://raw.githubusercontent.com/libhangul/libhangul/main/data/hanja/hanja.txt"
UNIHAN = "https://raw.githubusercontent.com/unicode-org/unihan-database/main/kDefinition.txt"


def fetch(url: str, dest: str) -> None:
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"  have {os.path.relpath(dest, HERE)}")
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  get  {url}")
    tmp = dest + ".part"
    with urllib.request.urlopen(url, timeout=120) as res, open(tmp, "wb") as fh:
        while True:
            chunk = res.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
    os.replace(tmp, dest)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-dict", action="store_true", help="skip the dictionary mirror")
    args = ap.parse_args()
    try:
        fetch(HANJA, os.path.join(SOURCES, "hanja.txt"))
        fetch(UNIHAN, os.path.join(SOURCES, "kDefinition.txt"))
        if not args.no_dict:
            for name in MIRROR_FILES:
                fetch(f"{MIRROR}{name}.xml", os.path.join(SOURCES, "krdict", f"{name}.xml"))
    except OSError as exc:
        sys.exit(f"Download failed: {exc}")
    print("\nNext:")
    print("  python build_data.py --krdict sources/krdict --hanja sources/hanja.txt --unihan sources/kDefinition.txt")


if __name__ == "__main__":
    main()
