"""
Generates preview/dogear-preview.png — a mockup of the bcard front
face with the new dog-ear corner fold.
Run: python3 scripts/generate-dogear-preview.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "preview")
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "dogear-preview.png")

SCALE = 2  # retina
W, H = 340 * SCALE, 640 * SCALE
R = 16 * SCALE       # card corner radius
FOLD = 36 * SCALE    # dog-ear size

# Colors
BG         = (11, 12, 16)
FOLD_BG    = (30, 32, 40)
CYAN       = (0, 255, 255)
CYAN_DIM   = (0, 255, 255, 76)   # ~30% alpha
CYAN_FAINT = (0, 255, 255, 20)
WHITE      = (255, 255, 255)
GRAY       = (200, 200, 200)
HEADSHOT   = (22, 24, 31)
SILHOUETTE = (42, 45, 56)


def rgba(color, alpha):
    return (*color[:3], alpha)


# ── Base card ──────────────────────────────────────────────────────────────────
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Card background (rounded rect)
d.rounded_rectangle([0, 0, W - 1, H - 1], radius=R, fill=(*BG, 255), outline=(*WHITE, 15))

# ── Top shimmer ────────────────────────────────────────────────────────────────
shimmer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shimmer)
for y in range(160 * SCALE):
    alpha = int(10 * (1 - y / (160 * SCALE)))
    sd.line([(0, y), (W, y)], fill=(255, 255, 255, alpha))
img = Image.alpha_composite(img, shimmer)
d = ImageDraw.Draw(img)

# ── Headshot circle ────────────────────────────────────────────────────────────
cx, cy, cr = W // 2, 156 * SCALE, 88 * SCALE
# Fill
d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(*HEADSHOT, 255))
# Border
d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr],
          outline=(*CYAN, 76), width=2 * SCALE)
# Silhouette (head)
d.ellipse([cx - 32*SCALE, cy - 48*SCALE, cx + 32*SCALE, cy + 16*SCALE],
          fill=(*SILHOUETTE, 255))
# Silhouette (shoulders)
d.ellipse([cx - 52*SCALE, cy + 8*SCALE, cx + 52*SCALE, cy + 76*SCALE],
          fill=(*SILHOUETTE, 255))

# ── Name ───────────────────────────────────────────────────────────────────────
try:
    font_name  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20 * SCALE)
    font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 9 * SCALE)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 9 * SCALE)
    font_contact = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10 * SCALE)
except Exception:
    font_name = font_title = font_small = font_contact = ImageFont.load_default()

name_y = 290 * SCALE
bbox = d.textbbox((0, 0), "MATTHEW TUJAGUE", font=font_name)
tw = bbox[2] - bbox[0]
d.text(((W - tw) // 2, name_y), "MATTHEW TUJAGUE", font=font_name, fill=(*WHITE, 255))

title_y = 316 * SCALE
bbox = d.textbbox((0, 0), "SOFTWARE ENGINEER", font=font_title)
tw = bbox[2] - bbox[0]
d.text(((W - tw) // 2, title_y), "SOFTWARE ENGINEER", font=font_title, fill=(*GRAY, 255))

loc_y = 332 * SCALE
bbox = d.textbbox((0, 0), "NJ · NY · PA", font=font_small)
tw = bbox[2] - bbox[0]
d.text(((W - tw) // 2, loc_y), "NJ · NY · PA", font=font_small, fill=(*CYAN, 200))

# ── Divider ────────────────────────────────────────────────────────────────────
div_y = 352 * SCALE
div_x0, div_x1 = int(W * 0.1), int(W * 0.9)
for i in range(div_x0, div_x1):
    t = (i - div_x0) / (div_x1 - div_x0)
    a = int(25 * (1 - abs(t - 0.5) * 2))
    d.point((i, div_y), fill=(255, 255, 255, a))
# Cyan accent center
acc_x0, acc_x1 = int(W * 0.375), int(W * 0.625)
d.line([(acc_x0, div_y), (acc_x1, div_y)], fill=(*CYAN, 230), width=SCALE)

# ── Contact rows ───────────────────────────────────────────────────────────────
icon_x, text_x = 96 * SCALE, 116 * SCALE
contacts = [
    (396, "✆", "(732) 639-3889"),
    (420, "✉", "matthew@2jog.dev"),
    (444, "⊕", "2jog.dev"),
]
for row_y, icon, text in contacts:
    ry = row_y * SCALE
    d.text((icon_x - 6 * SCALE, ry - 6 * SCALE), icon, font=font_contact, fill=(*CYAN, 178))
    d.text((text_x, ry - 6 * SCALE), text, font=font_contact, fill=(*GRAY, 255))

# ── Dog-ear fold ───────────────────────────────────────────────────────────────
# Triangle: (W-FOLD, H), (W, H), (W, H-FOLD)
fold_pts = [(W - FOLD, H), (W, H), (W, H - FOLD)]

# Soft shadow under the fold — slightly larger, offset, blurred via alpha gradient
shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd2 = ImageDraw.Draw(shadow_layer)
for offset in range(6, 0, -1):
    alpha = int(46 * (offset / 6) * 0.18)
    pts = [
        (W - FOLD - offset * SCALE, H),
        (W, H),
        (W, H - FOLD - offset * SCALE),
    ]
    sd2.polygon(pts, fill=(*CYAN, alpha))
img = Image.alpha_composite(img, shadow_layer)
d = ImageDraw.Draw(img)

# Flap triangle fill
d.polygon(fold_pts, fill=(*FOLD_BG, 255))

# Crease line (diagonal from bottom-left of fold to top-right)
d.line([(W - FOLD, H - 1), (W - 1, H - FOLD)],
       fill=(*CYAN, 76), width=max(1, SCALE // 2))

# Light crease glow (thicker, more transparent)
d.line([(W - FOLD, H - 1), (W - 1, H - FOLD)],
       fill=(*CYAN, 20), width=SCALE * 2)

# ── Clip everything to rounded card ────────────────────────────────────────────
mask = Image.new("L", (W, H), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, W - 1, H - 1], radius=R, fill=255)
img.putalpha(mask)

# ── Save ───────────────────────────────────────────────────────────────────────
# Composite onto dark background for the final PNG (no transparency)
bg = Image.new("RGB", (W, H), BG)
bg.paste(img, mask=img.split()[3])
bg = bg.resize((W // SCALE, H // SCALE), Image.LANCZOS)
bg.save(OUT, "PNG", optimize=True)
print(f"Written: {OUT}")
