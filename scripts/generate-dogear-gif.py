"""
Generates preview/dogear-preview.gif
Fixes:
  1. White artifact: use FASTOCTREE quantization + no dither
  2. Dog-ear is the card surface itself — no separate background box
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "preview")
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "dogear-preview.gif")

W, H   = 340, 640
R      = 16
S      = 80
FRAMES = 48
FPS    = 24

BG         = (11,  12,  16)
BACK_COL   = (37,  40,  54)
CYAN       = (0,   255, 255)
WHITE      = (255, 255, 255)
GRAY       = (200, 200, 200)
HEADSHOT   = (22,  24,  31)
SILHOUETTE = (42,  45,  56)

def ease_cubic_in_out(t):
    t2 = t * 2
    if t2 < 1: return 0.5 * t2**3
    t2 -= 2
    return 0.5 * (t2**3 + 2)

def lerp(a, b, t): return a + (b - a) * t

try:
    fn = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    ft = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",       9)
    fc = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",      10)
except Exception:
    fn = ft = fc = ImageFont.load_default()

def centered_text(draw, y, text, font, color):
    bb = draw.textbbox((0, 0), text, font=font)
    draw.text(((W - (bb[2]-bb[0])) // 2, y), text, font=font, fill=color)

def make_base():
    """Card on a pure dark bg — no alpha, no rounded-corner transparency bleed."""
    img = Image.new("RGB", (W, H), BG)
    d   = ImageDraw.Draw(img)

    # Card body — solid, no alpha needed (we're already on dark bg)
    d.rounded_rectangle([0, 0, W-1, H-1], radius=R, fill=BG, outline=(40,42,50))

    # Top shimmer
    for y in range(160):
        a = 1 - y / 160
        lv = int(11 + a * 6)
        d.line([(0,y),(W,y)], fill=(lv, lv+1, lv+2))

    # Headshot
    cx, cy, cr = W//2, 156, 88
    d.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], fill=HEADSHOT)
    d.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], outline=(*CYAN[:3], 76) if False else (0,60,60), width=2)
    # use a dim cyan for the headshot border
    border_img = Image.new("RGBA", (W, H), (0,0,0,0))
    ImageDraw.Draw(border_img).ellipse([cx-cr, cy-cr, cx+cr, cy+cr], outline=(*CYAN, 76), width=2)
    img = img.convert("RGBA")
    img = Image.alpha_composite(img, border_img)
    img = img.convert("RGB")
    d = ImageDraw.Draw(img)

    d.ellipse([cx-32, cy-48, cx+32, cy+16], fill=SILHOUETTE)
    d.ellipse([cx-52, cy+8,  cx+52, cy+76], fill=SILHOUETTE)

    centered_text(d, 290, "MATTHEW TUJAGUE",   fn, WHITE)
    centered_text(d, 316, "SOFTWARE ENGINEER", ft, GRAY)
    centered_text(d, 332, "NJ · NY · PA",      ft, CYAN)

    div_y = 352
    for i in range(int(W*0.1), int(W*0.9)):
        t = (i - W*0.1) / (W*0.8)
        lv = int(40 * (1 - abs(t-0.5)*2))
        d.point((i, div_y), fill=(lv,lv,lv))
    d.line([(int(W*0.375), div_y), (int(W*0.625), div_y)], fill=CYAN, width=1)

    for ry, icon, txt in [(396,"✆","(732) 639-3889"),
                           (420,"✉","matthew@2jog.dev"),
                           (444,"⊕","2jog.dev")]:
        d.text((90, ry-6), icon, font=fc, fill=CYAN)
        d.text((108,ry-6), txt,  font=fc, fill=GRAY)

    # Clip to rounded rect — fill outside with bg (stays RGB, no white bleed)
    mask = Image.new("L", (W,H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,W-1,H-1], radius=R, fill=255)
    result = Image.new("RGB", (W,H), BG)
    result.paste(img, mask=mask)
    return result


def make_frame(base, t):
    img = base.copy()
    d   = ImageDraw.Draw(img)

    corner_size = S * t

    if corner_size > 1:
        cs = corner_size

        # 1. Back face triangle (the underside revealed by peeling)
        tri = [(W-cs, H), (W, H), (W, H-cs)]
        pts = [(int(x), int(y)) for x,y in tri]
        d.polygon(pts, fill=BACK_COL)

        # 2. Crease shadow (soft blur along the diagonal)
        shadow = Image.new("RGB", (W,H), BG)
        shadow.paste(img)  # copy current state
        sd = ImageDraw.Draw(shadow)
        for w in range(8, 0, -1):
            lv = int(80 * (w/8) * t)
            sd.line([(int(W-cs), H), (W, int(H-cs))], fill=(lv,lv,lv), width=w)
        shadow_blur = shadow.filter(ImageFilter.GaussianBlur(radius=3))
        # Blend shadow only in the crease area
        crease_mask = Image.new("L", (W,H), 0)
        crease_d = ImageDraw.Draw(crease_mask)
        expand = int(12 * t)
        crease_d.polygon(
            [(int(W-cs-expand), H), (W, H), (W, int(H-cs-expand))],
            fill=255
        )
        crease_mask = crease_mask.filter(ImageFilter.GaussianBlur(radius=6))
        img_rgba    = img.convert("RGBA")
        shadow_rgba = shadow_blur.convert("RGBA")
        img_rgba.paste(shadow_rgba, mask=crease_mask)
        img = img_rgba.convert("RGB")
        d   = ImageDraw.Draw(img)

        # Re-draw back face on top of shadow
        d.polygon(pts, fill=BACK_COL)

        # 3. Lifted flap — card-colored triangle sits on top, shrinks as corner peels
        # The flap that's "peeling away" still shows the card face
        # (it moves up/away, so we see less of it as t increases)
        flap_size = S * (1.0 - t * 0.9)
        if flap_size > 0:
            flap_pts = [
                (int(W - flap_size), H),
                (W, H),
                (W, int(H - flap_size))
            ]
            d.polygon(flap_pts, fill=BG)

        # 4. Crease line (bright edge)
        crease_alpha_lv = int(lerp(30, 90, t))
        d.line(
            [(int(W-cs), H), (W, int(H-cs))],
            fill=(crease_alpha_lv, crease_alpha_lv+5, crease_alpha_lv+8),
            width=1
        )

    # Re-clip to rounded card
    mask = Image.new("L", (W,H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,W-1,H-1], radius=R, fill=255)
    result = Image.new("RGB", (W,H), BG)
    result.paste(img, mask=mask)
    return result


def animation_t(i, total):
    p = i / total
    if p < 0.20:                return 0.0
    elif p < 0.55:              return ease_cubic_in_out((p-0.20)/(0.55-0.20))
    elif p < 0.75:              return 1.0
    else:                       return ease_cubic_in_out(1.0 - (p-0.75)/(1.0-0.75))


print("Rendering base card...")
base = make_base()

print(f"Rendering {FRAMES} frames...")
frames = []
for i in range(FRAMES):
    t     = animation_t(i, FRAMES)
    frame = make_frame(base, t)
    # Quantize: FASTOCTREE = method 2, no dither — eliminates white artifacts
    frame_q = frame.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    frames.append(frame_q)
    if i % 8 == 0:
        print(f"  {i+1}/{FRAMES}  t={t:.2f}")

print("Saving GIF...")
frames[0].save(
    OUT,
    save_all=True,
    append_images=frames[1:],
    duration=int(1000/FPS),
    loop=0,
    optimize=False,
)
print(f"Written: {OUT}  ({os.path.getsize(OUT)/1024:.1f} KB)")
