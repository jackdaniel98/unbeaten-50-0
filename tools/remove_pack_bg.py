"""Cut pack art out of its white/grey studio background.

Flood-fills near-white pixels connected to the image border to transparent
(so whites INSIDE the pack art are preserved), feathers the edge, trims,
and writes the result to assets/pack/.

Usage:
  python tools/remove_pack_bg.py <input.png> <output.png>
"""
import sys
from collections import deque
from PIL import Image, ImageFilter


def is_bg(px, tol=38):
    r, g, b = px[0], px[1], px[2]
    # near-white / light grey: bright and low colour spread
    return min(r, g, b) > 255 - tol * 2 and (max(r, g, b) - min(r, g, b)) < tol


def cut(src, dst):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    pix = im.load()

    # BFS flood fill from every border pixel that looks like background
    mask = Image.new("L", (w, h), 0)  # 255 = background to remove
    mpix = mask.load()
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(pix[x, y]) and mpix[x, y] == 0:
                mpix[x, y] = 255
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(pix[x, y]) and mpix[x, y] == 0:
                mpix[x, y] = 255
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and mpix[nx, ny] == 0 and is_bg(pix[nx, ny]):
                mpix[nx, ny] = 255
                q.append((nx, ny))

    # feather the cut edge slightly so it composites cleanly
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))

    alpha = im.getchannel("A").point(lambda a: a)
    from PIL import ImageChops
    inv = mask.point(lambda v: 255 - v)
    new_alpha = ImageChops.multiply(alpha, inv)
    im.putalpha(new_alpha)

    # trim to content
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)

    # keep file lean for the web
    if max(im.size) > 900:
        ratio = 900 / max(im.size)
        im = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.LANCZOS)

    im.save(dst, "PNG", optimize=True)
    print(f"saved {dst} {im.size}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    cut(sys.argv[1], sys.argv[2])
