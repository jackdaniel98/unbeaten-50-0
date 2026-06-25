#!/usr/bin/env python3
"""Remove backgrounds from all images in input_dir, write PNGs to output_dir."""

import sys
from pathlib import Path


def main():
    if len(sys.argv) != 3:
        print("Usage: python remove_bg.py <input_dir> <output_dir>", file=sys.stderr)
        sys.exit(1)

    input_dir  = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    EXTS = {'.png', '.jpg', '.jpeg', '.webp'}
    images = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in EXTS)

    if not images:
        print(f"  No images found in {input_dir}")
        sys.exit(0)

    # Import after the early-exit check so startup is instant when folder is empty
    from rembg import remove, new_session

    print("  Loading model (downloads ~170MB to ~/.u2net/ on first run)...")
    session = new_session()

    for img_path in images:
        out_path = output_dir / (img_path.stem + ".png")
        print(f"  {img_path.name}  →  {out_path.name}")
        out_path.write_bytes(remove(img_path.read_bytes(), session=session))

    print(f"  Done: {len(images)} image(s) processed.")


if __name__ == "__main__":
    main()
