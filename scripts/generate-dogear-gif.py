"""
Generates preview/dogear-preview.gif — simulates the rhythm191 CodePen
dog-ear peel technique using rotated masked rectangles.

Animation: idles flat, periodically peels open, then returns.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "preview")
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "dogear-preview.gif")

W, H   = 340, 640
R      = 16
S      = 80           # fold size ($size)
FRAMES = 48
FPS    = 24

BG         = (11,  12,  16)
CARD_BG    = (11,  12,  16)
BACK_COL   = (37,  40,  54)   # #252836 — back face of fold
PAPER_COL  = (30,  33,  48)   # #1e2130 — underside shown in __paper::before
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

def lerp(a, b, t):
    return a + (b - a) * t

try:
    fn = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    ft = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",       9)
    fc = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",      10)
except Exception:
    fn = ft = fc = ImageFont.load_default()

def centered_text(draw, y, text, font, color):
    bb = draw.textbbox((0, 0), text, font=font)
    x  = (W - (bb[2] - bb[0])) // 2
    draw.text((x, y), text, font=font, fill=color)

def make_base():
    img = Image.new("RGBA", (W, H), (0,0,0,0))
    d   = ImageDraw.Draw(img)
    d.rounded_rectangle([0,0,W-1,H-1], radius=R, fill=(*BG,255), outline=(*WHITE,15))
    for y in range(160):
        a = int(10*(1 - y/160))
        d.line([(0,y),(W,y)], fill=(255,255,255,a))
    cx, cy, cr = W//2, 156, 88
    d.ellipse([cx-cr,cy-cr,cx+cr,cy+cr], fill=(*HEADSHOT,255))
    d.ellipse([cx-cr,cy-cr,cx+cr,cy+cr], outline=(*CYAN,76), width=2)
    d.ellipse([cx-32,cy-48,cx+32,cy+16], fill=(*SILHOUETTE,255))
    d.ellipse([cx-52,cy+8, cx+52,cy+76], fill=(*SILHOUETTE,255))
    centered_text(d, 290, "MATTHEW TUJAGUE",   fn, (*WHITE,255))
    centered_text(d, 316, "SOFTWARE ENGINEER", ft, (*GRAY, 255))
    centered_text(d, 332, "NJ · NY · PA",      ft, (*CYAN, 200))
    div_y = 352
    for i in range(int(W*0.1), int(W*0.9)):
        t = (i - W*0.1)/(W*0.8)
        a = int(25*(1-abs(t-0.5)*2))
        d.point((i,div_y), fill=(255,255,255,a))
    d.line([(int(W*0.375),div_y),(int(W*0.625),div_y)], fill=(*CYAN,230), width=1)
    for ry, icon, text in [(396,"✆","(732) 639-3889"),
                            (420,"✉","matthew@2jog.dev"),
                            (444,"⊕","2jog.dev")]:
        d.text((90, ry-6), icon, font=fc, fill=(*CYAN,178))
        d.text((108,ry-6), text, font=fc, fill=(*GRAY,255))
    return img


def rotate_point(px, py, cx, cy, angle_deg):
    """Rotate (px,py) around (cx,cy) by angle_deg."""
    r   = math.radians(angle_deg)
    dx  = px - cx
    dy  = py - cy
    nx  = dx*math.cos(r) - dy*math.sin(r) + cx
    ny  = dx*math.sin(r) + dy*math.cos(r) + cy
    return nx, ny

def rect_poly(x, y, w, h, cx, cy, angle_deg):
    """Return the 4 corners of a w×h rect at (x,y) rotated around (cx,cy)."""
    corners = [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]
    return [rotate_point(px,py,cx,cy,angle_deg) for px,py in corners]


def make_frame(base, t):
    """
    t: 0.0 = closed, 1.0 = fully peeled open.
    Simulates the __back rect sliding out from the corner.
    """
    img = base.copy()
    d   = ImageDraw.Draw(img)

    # ── __back: rotated rectangle sliding from (5,0) to (-38,0) in its local space
    # The back rect: width=S, height=S*2, anchored at bottom=-S, right=-S of card
    # In card coords, its unrotated top-left is: (W-S + (-S), H-S*2 + (-S)) wait...
    # Original: position absolute bottom=-S right=-S, so top-left in card = (W-S, H-S*2) then offset
    # Actually in the CSS, the rect is at bottom:-80px right:-80px meaning its
    # visual position starts hidden. The transform rotate(45deg) translate(tx, 0)
    # slides it along the 45° axis.
    #
    # Simplified: draw a rotated rect at the bottom-right, interpolating position
    back_tx_closed =  5   # translate(5px, 0) along 45° axis
    back_tx_open   = -38  # translate(-38px, 0) along 45° axis
    back_tx = lerp(back_tx_closed, back_tx_open, t)

    # The 45° axis unit vector
    ax, ay = math.cos(math.radians(45)), math.sin(math.radians(45))

    # Back rect anchor (bottom-right of card, offset by -S,-S)
    bx0 = W - S + back_tx * ax
    by0 = H - S + back_tx * ay   # note: in 2D, rotate 45° then translate along x

    # Actually let me use a more direct approach:
    # Draw the back face as a rotated rectangle whose position interpolates
    # The back face visible region in the peel: a triangle in the bottom-right corner

    # Compute the back face as a polygon (the visible triangular portion of the peeled back)
    # At t=0: hidden behind the corner (rectangle at (W, H) rotated away)
    # At t=1: triangle of size S exposed in the corner

    # Simpler: draw the triangle directly
    # The exposed back triangle grows from nothing to full S-triangle
    corner_size = S * t
    if corner_size > 1:
        # Back face triangle
        tri = [(W - corner_size, H), (W, H), (W, H - corner_size)]
        back_layer = Image.new("RGBA", (W,H), (0,0,0,0))
        ImageDraw.Draw(back_layer).polygon(
            [(int(x),int(y)) for x,y in tri],
            fill=(*BACK_COL, 255)
        )
        img = Image.alpha_composite(img, back_layer)
        d   = ImageDraw.Draw(img)

        # Shadow on the crease
        shadow_layer = Image.new("RGBA", (W,H), (0,0,0,0))
        sd = ImageDraw.Draw(shadow_layer)
        # Shadow line along the diagonal crease
        crease_len = corner_size * 1.4
        # Crease goes from (W-corner_size, H) to (W, H-corner_size)
        for width in range(6, 0, -1):
            a = int(120 * (width/6) * t)
            sd.line(
                [(int(W-corner_size), H), (W, int(H-corner_size))],
                fill=(0,0,0,a), width=width
            )
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=3))
        img = Image.alpha_composite(img, shadow_layer)
        d   = ImageDraw.Draw(img)

        # Overlay card bg triangle on top — the "paper" hiding the card surface
        # (simulates the __paper element with card-colored background)
        # This slides from fully covering the back to exposing it
        paper_cover = S * (1 - t) * 0.8  # shrinks as peel opens
        if paper_cover > 0:
            cover_tri = [
                (W - paper_cover, H),
                (W,               H),
                (W, H - paper_cover)
            ]
            ImageDraw.Draw(img).polygon(
                [(int(x),int(y)) for x,y in cover_tri],
                fill=(*CARD_BG, 255)
            )
            d = ImageDraw.Draw(img)

    # ── Mask to rounded card ──
    mask = Image.new("L",(W,H),0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,W-1,H-1], radius=R, fill=255)
    img.putalpha(mask)

    flat = Image.new("RGB",(W,H), BG)
    flat.paste(img, mask=img.split()[3])
    return flat


def animation_t(i, total):
    """
    Keyframe schedule mirroring the CSS:
    0-20%: closed (t=0)
    20-55%: easing open (t=0→1)
    55-75%: held open (t=1)
    75-100%: easing closed (t=1→0)
    """
    p = i / total
    if p < 0.20:
        return 0.0
    elif p < 0.55:
        raw = (p - 0.20) / (0.55 - 0.20)
        return ease_cubic_in_out(raw)
    elif p < 0.75:
        return 1.0
    else:
        raw = (p - 0.75) / (1.0 - 0.75)
        return ease_cubic_in_out(1.0 - raw)


print("Rendering base card...")
base = make_base()

print(f"Rendering {FRAMES} frames...")
frames = []
for i in range(FRAMES):
    t     = animation_t(i, FRAMES)
    frame = make_frame(base, t)
    frames.append(frame)
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
size_kb = os.path.getsize(OUT)/1024
print(f"Written: {OUT}  ({size_kb:.1f} KB)")
