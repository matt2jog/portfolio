"""
Generates preview/dogear-preview.gif — animated GIF of the bcard
dog-ear peel animation (mirrors the CSS bcard-peel-lift keyframes).
Run: python3 scripts/generate-dogear-gif.py
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "preview")
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "dogear-preview.gif")

SCALE  = 1          # keep GIF small
W, H   = 340, 640
R      = 16
FOLD   = 72

BG         = (11, 12, 16)
CYAN       = (0, 255, 255)
WHITE      = (255, 255, 255)
GRAY       = (200, 200, 200)
HEADSHOT   = (22, 24, 31)
SILHOUETTE = (42, 45, 56)

TOTAL_FRAMES = 36       # frames in one full loop
FPS          = 24
DURATION_MS  = int(1000 / FPS)

def ease_in_out(t):
    """Cubic ease-in-out, mirrors CSS ease-in-out."""
    t = t * 2
    if t < 1:
        return 0.5 * t * t * t
    t -= 2
    return 0.5 * (t * t * t + 2)

def centered_text(draw, y, text, font, color):
    bb = draw.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    draw.text((x, y), text, font=font, fill=color)

try:
    fn  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    ft  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",       9)
    fc  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",      10)
except Exception:
    fn = ft = fc = ImageFont.load_default()


def make_base_card():
    """Render the static card content (everything except the dog-ear)."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W-1, H-1], radius=R,
                        fill=(*BG, 255), outline=(*WHITE, 15))

    # Top shimmer
    for y in range(160):
        a = int(10 * (1 - y / 160))
        d.line([(0, y), (W, y)], fill=(255, 255, 255, a))

    # Headshot
    cx, cy, cr = W // 2, 156, 88
    d.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], fill=(*HEADSHOT, 255))
    d.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], outline=(*CYAN, 76), width=2)
    d.ellipse([cx-32, cy-48, cx+32, cy+16], fill=(*SILHOUETTE, 255))
    d.ellipse([cx-52, cy+8,  cx+52, cy+76], fill=(*SILHOUETTE, 255))

    centered_text(d, 290, "MATTHEW TUJAGUE",   fn, (*WHITE, 255))
    centered_text(d, 316, "SOFTWARE ENGINEER", ft, (*GRAY,  255))
    centered_text(d, 332, "NJ · NY · PA",      ft, (*CYAN,  200))

    # Divider
    div_y = 352
    for i in range(int(W*0.1), int(W*0.9)):
        t = (i - W*0.1) / (W*0.8)
        a = int(25 * (1 - abs(t-0.5)*2))
        d.point((i, div_y), fill=(255, 255, 255, a))
    d.line([(int(W*0.375), div_y), (int(W*0.625), div_y)],
           fill=(*CYAN, 230), width=1)

    # Contact
    for ry, icon, text in [(396, "✆", "(732) 639-3889"),
                            (420, "✉", "matthew@2jog.dev"),
                            (444, "⊕", "2jog.dev")]:
        d.text((90, ry-6), icon, font=fc, fill=(*CYAN, 178))
        d.text((108, ry-6), text, font=fc, fill=(*GRAY, 255))

    return img


def make_frame(base, peel_t):
    """
    peel_t: 0.0 = flat, 1.0 = fully peeled (mid-animation).
    Maps to CSS: translate(-6*t, -6*t) scale(1 + 0.18*t)
    """
    img = base.copy()
    d   = ImageDraw.Draw(img)

    tx    = -6 * peel_t
    ty    = -6 * peel_t
    scale = 1.0 + 0.18 * peel_t

    BX, BY = W - FOLD, H - FOLD
    OX, OY = BX, H        # transform origin: bottom-left of fold box

    def tp(lx, ly):
        sx = OX + (BX + lx - OX) * scale
        sy = OY + (BY + ly - OY) * scale
        return (int(sx + tx), int(sy + ty))

    P_TR = tp(FOLD, 0)
    P_BR = tp(FOLD, FOLD)
    P_BL = tp(0,    FOLD)
    flap_pts = [P_TR, P_BR, P_BL]

    # Card shadow (behind flap)
    shadow_alpha = int(110 * (0.4 + 0.6 * peel_t))
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i in range(14, 0, -1):
        expand = int((14 - i) * peel_t * 2)
        a = int(shadow_alpha * (i / 14))
        pts = [(BX - expand, H), (W, H), (W, BY - expand)]
        ImageDraw.Draw(shadow_layer).polygon(pts, fill=(0, 0, 0, a))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=6))
    img = Image.alpha_composite(img, shadow_layer)
    d   = ImageDraw.Draw(img)

    # Flap gradient
    flap_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fl = ImageDraw.Draw(flap_layer)
    fl.polygon(flap_pts, fill=(21, 23, 25, 255))
    steps = 28
    for i in range(steps):
        t2 = i / steps
        e1x = int(P_BL[0] + t2 * (P_TR[0] - P_BL[0]))
        e1y = int(P_BL[1] + t2 * (P_TR[1] - P_BL[1]))
        e2x = int(P_BL[0] + t2 * (P_BR[0] - P_BL[0]))
        e2y = int(P_BL[1] + t2 * (P_BR[1] - P_BL[1]))
        # More contrast at higher peel
        lv = int(21 + t2 * (45 + 25 * peel_t))
        fl.polygon([P_BL, (e1x, e1y), (e2x, e2y)],
                   fill=(lv+8, lv+10, lv+18, 255))
    img = Image.alpha_composite(img, flap_layer)
    d   = ImageDraw.Draw(img)

    # Flap edge shadow
    shadow2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s2 = ImageDraw.Draw(shadow2)
    for offset in range(5, 0, -1):
        pts = [(x - offset, y - offset) for x, y in flap_pts]
        s2.polygon(pts, fill=(0, 0, 0, int(70 * offset / 5 * peel_t)))
    shadow2 = shadow2.filter(ImageFilter.GaussianBlur(radius=2))
    img = Image.alpha_composite(img, shadow2)
    d   = ImageDraw.Draw(img)

    # Crease glow
    crease = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(crease)
    crease_alpha = int(130 * (0.3 + 0.7 * peel_t))
    cd.line([P_BL, P_TR], fill=(*CYAN, crease_alpha), width=2)
    crease = crease.filter(ImageFilter.GaussianBlur(radius=1.5))
    img = Image.alpha_composite(img, crease)
    d   = ImageDraw.Draw(img)
    d.line([P_BL, P_TR], fill=(*CYAN, int(160 * (0.3 + 0.7 * peel_t))), width=1)

    # Clip to rounded card
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W-1, H-1], radius=R, fill=255)
    img.putalpha(mask)

    # Flatten onto dark bg (GIF needs palette/no alpha)
    flat = Image.new("RGB", (W, H), BG)
    flat.paste(img, mask=img.split()[3])
    return flat


print("Rendering base card...")
base = make_base_card()

print(f"Rendering {TOTAL_FRAMES} frames...")
frames = []
for i in range(TOTAL_FRAMES):
    # t goes 0→1→0 over the loop (ping-pong via sine)
    raw_t = i / TOTAL_FRAMES          # 0.0 → 1.0
    sine_t = (1 - math.cos(raw_t * 2 * math.pi)) / 2  # 0→1→0
    peel_t = ease_in_out(sine_t if sine_t < 0.5 else sine_t)

    frame = make_frame(base, peel_t)
    frames.append(frame)
    if i % 6 == 0:
        print(f"  frame {i+1}/{TOTAL_FRAMES}  peel={peel_t:.2f}")

# Save as animated GIF
print("Saving GIF...")
frames[0].save(
    OUT,
    save_all=True,
    append_images=frames[1:],
    duration=DURATION_MS,
    loop=0,
    optimize=False,
)
print(f"Written: {OUT}")
print(f"Size: {os.path.getsize(OUT) / 1024:.1f} KB")
