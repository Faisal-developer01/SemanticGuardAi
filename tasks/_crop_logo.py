from PIL import Image
import os

src = "docs/images/Logo-semantic.png"
img = Image.open(src).convert("RGBA")
w, h = img.size
print("size:", w, h)
px = img.load()

# Find bounding box of "visible" pixels: non-transparent AND not near-white
minx, miny, maxx, maxy = w, h, 0, 0
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a < 16:
            continue
        # skip near-white pixels
        if r > 240 and g > 240 and b > 240:
            continue
        if x < minx: minx = x
        if y < miny: miny = y
        if x > maxx: maxx = x
        if y > maxy: maxy = y

print("bbox:", minx, miny, maxx, maxy)

# pad a little
pad = 12
minx = max(0, minx - pad); miny = max(0, miny - pad)
maxx = min(w, maxx + pad); maxy = min(h, maxy + pad)
print("padded bbox:", minx, miny, maxx, maxy, "->", maxx-minx, maxy-miny)

# Check if original has any non-white-but-transparent: determine if bg is transparent or white
# sample a corner
print("corner pixel:", px[0,0])

os.makedirs("public", exist_ok=True)
icon = img.crop((minx, miny, maxx, maxy))
icon.save("public/logo-icon.png")
print("saved public/logo-icon.png", icon.size)
