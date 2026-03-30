"""
Generates preview/dogear-preview.png — bcard front face with peeling
dog-ear corner (rendered at mid-peel keyframe: scale 1.18, offset -6px).
Run: python3 scripts/generate-dogear-preview.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "preview")
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "dogear-preview.png")

SCALE = 2
W, H   = 340 * SCALE, 640 * SCALE
R      = 16 * SCALE
FOLD   = 72 * SCALE   # matches CSS

BG         = (11, 12, 16)
CYAN       = (0, 255, 255)
WHITE      = (255, 255, 255)
GRAY       = (200, 200, 200)
HEADSHOT   = (22, 24, 31)
SILHOUETTE = (42, 45, 56)

# ── Helpers ────────────────────────────────────────────────────────────────────
def centered_text(draw, y, text, font, color):
    bb = draw.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    draw.text((x, y), text, font=font, fill=color)

# ── Base card ──────────────────────────────────────────────────────────────────
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d   = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, W-1, H-1], radius=R,
                    fill=(*BG, 255), outline=(*WHITE, 15))

# Top shimmer
shimmer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shimmer)
for y in range(160 * SCALE):
    a = int(10 * (1 - y / (160 * SCALE)))
    sd.line([(0, y), (W, y)], fill=(255, 255, 255, a))
img = Image.alpha_composite(img, shimmer)
d   = ImageDraw.Draw(img)

# ── Headshot ───────────────────────────────────────────────────────────────────
cx, cy, cr = W // 2, 156*SCALE, 88*SCALE
d.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], fill=(*HEADSHOT, 255))
d.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], outline=(*CYAN, 76), width=2*SCALE)
d.ellipse([cx-32*SCALE, cy-48*SCALE, cx+32*SCALE, cy+16*SCALE], fill=(*SILHOUETTE, 255))
d.ellipse([cx-52*SCALE, cy+8*SCALE,  cx+52*SCALE, cy+76*SCALE], fill=(*SILHOUETTE, 255))

# ── Fonts ──────────────────────────────────────────────────────────────────────
try:
    fn  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20*SCALE)
    ft  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",       9*SCALE)
    fc  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",      10*SCALE)
except Exception:
    fn = ft = fc = ImageFont.load_default()

centered_text(d, 290*SCALE, "MATTHEW TUJAGUE",  fn, (*WHITE, 255))
centered_text(d, 316*SCALE, "SOFTWARE ENGINEER", ft, (*GRAY,  255))
centered_text(d, 332*SCALE, "NJ · NY · PA",      ft, (*CYAN,  200))

# Divider
div_y = 352*SCALE
for i in range(int(W*0.1), int(W*0.9)):
    t = (i - W*0.1) / (W*0.8)
    a = int(25 * (1 - abs(t-0.5)*2))
    d.point((i, div_y), fill=(255, 255, 255, a))
d.line([(int(W*0.375), div_y), (int(W*0.625), div_y)], fill=(*CYAN, 230), width=SCALE)

# Contact
for ry, icon, text in [(396, "✆", "(732) 639-3889"),
                        (420, "✉", "matthew@2jog.dev"),
                        (444, "⊕", "2jog.dev")]:
    d.text((96*SCALE-6*SCALE, ry*SCALE-6*SCALE), icon, font=fc, fill=(*CYAN, 178))
    d.text((116*SCALE,        ry*SCALE-6*SCALE), text, font=fc, fill=(*GRAY, 255))

# ── Dog-ear peel — mid-peel frame (scale=1.18, offset=-6px each axis) ──────────
# The 72px box sits at (W-FOLD, H-FOLD) in card coords.
# Transform origin is the bottom-left of the box = (W-FOLD, H).
# At mid-peel: scale 1.18 around origin, then translate (-6, -6) px.
BX   = W - FOLD   # box origin x (card coords)
BY   = H - FOLD   # box origin y (card coords)
OX   = BX         # transform-origin x (bottom-left of box)
OY   = H          # transform-origin y

PEEL_SCALE = 1.18
PEEL_TX    = -6 * SCALE
PEEL_TY    = -6 * SCALE

def tp(lx, ly):
    """Transform a box-local point through scale+translate."""
    # scale from (OX, OY)
    sx = OX + (BX + lx - OX) * PEEL_SCALE
    sy = OY + (BY + ly - OY) * PEEL_SCALE
    return (int(sx + PEEL_TX), int(sy + PEEL_TY))

# Triangle vertices in box-local: top-right, bottom-right, bottom-left
P_TR = tp(FOLD, 0)     # free tip — top-right of box (upper corner of fold)
P_BR = tp(FOLD, FOLD)  # card bottom-right corner
P_BL = tp(0,    FOLD)  # crease bottom (transform origin, won't move)

flap_pts = [P_TR, P_BR, P_BL]

# --- Shadow on card (radial, behind the flap) ---
shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
# Draw a blurred fan of triangles, darkest at corner
for i in range(18, 0, -1):
    expand = (18 - i) * SCALE // 2
    alpha  = int(140 * (i / 18))
    pts = [
        (BX - expand, H),
        (W + expand,  H),
        (W + expand,  BY - expand),
    ]
    ImageDraw.Draw(shadow_layer).polygon(pts, fill=(0, 0, 0, alpha))
shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=8*SCALE))
img = Image.alpha_composite(img, shadow_layer)
d   = ImageDraw.Draw(img)

# --- Flap gradient (dark at crease, lighter toward free tip) ---
flap_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
fl = ImageDraw.Draw(flap_layer)
# Base — darkest at crease
fl.polygon(flap_pts, fill=(21, 23, 25, 255))
# Gradient strips from PBL toward the free edge (P_TR–P_BR)
steps = 32
for i in range(steps):
    t = i / steps
    # Interpolate vertices from PBL toward the opposite edge
    e1x = int(P_BL[0] + t * (P_TR[0] - P_BL[0]))
    e1y = int(P_BL[1] + t * (P_TR[1] - P_BL[1]))
    e2x = int(P_BL[0] + t * (P_BR[0] - P_BL[0]))
    e2y = int(P_BL[1] + t * (P_BR[1] - P_BL[1]))
    # Brightness increases toward the free tip (t=1)
    lv = int(21 + t * 55)
    fl.polygon([P_BL, (e1x, e1y), (e2x, e2y)], fill=(lv+8, lv+10, lv+18, 255))

img = Image.alpha_composite(img, flap_layer)
d   = ImageDraw.Draw(img)

# --- Flap drop shadow (edge lift effect) ---
shadow2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
s2 = ImageDraw.Draw(shadow2)
for offset in range(7, 0, -1):
    o   = offset * SCALE // 3
    pts = [(x - o, y - o) for x, y in flap_pts]
    s2.polygon(pts, fill=(0, 0, 0, int(80 * offset / 7)))
shadow2 = shadow2.filter(ImageFilter.GaussianBlur(radius=3*SCALE))
img = Image.alpha_composite(img, shadow2)
d   = ImageDraw.Draw(img)

# --- Crease glow (blurred cyan line along P_BL → P_TR) ---
crease = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(crease)
cd.line([P_BL, P_TR], fill=(*CYAN, 130), width=SCALE*2)
crease = crease.filter(ImageFilter.GaussianBlur(radius=SCALE*1.5))
img = Image.alpha_composite(img, crease)
d   = ImageDraw.Draw(img)
# Hard bright crease line on top
d.line([P_BL, P_TR], fill=(*CYAN, 160), width=max(1, SCALE//2))

# ── Clip to rounded card + save ───────────────────────────────────────────────
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, W-1, H-1], radius=R, fill=255)
img.putalpha(mask)

bg = Image.new("RGB", (W, H), BG)
bg.paste(img, mask=img.split()[3])
bg = bg.resize((W // SCALE, H // SCALE), Image.LANCZOS)
bg.save(OUT, "PNG", optimize=True)
print(f"Written: {OUT}")
