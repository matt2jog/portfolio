"""
Generates preview/dogear-preview.gif — dog-ear peel using real 3D rotation.

The crease is the diagonal from A=(W-FOLD, H) to B=(W, H-FOLD).
The free corner C=(W, H) rotates around that axis (Rodrigues' formula),
then gets orthographically projected back to screen coords.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "preview")
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "dogear-preview.gif")

W, H   = 340, 640
R      = 16
FOLD   = 72
FRAMES = 40
FPS    = 24

BG         = (11,  12,  16)
CYAN       = (0,   255, 255)
WHITE      = (255, 255, 255)
GRAY       = (200, 200, 200)
HEADSHOT   = (22,  24,  31)
SILHOUETTE = (42,  45,  56)

# ── Math helpers ───────────────────────────────────────────────────────────────

def ease_in_out(t):
    t2 = t * 2
    if t2 < 1:
        return 0.5 * t2 ** 3
    t2 -= 2
    return 0.5 * (t2 ** 3 + 2)

def rodrigues(v, k, theta):
    """Rotate vector v around unit vector k by angle theta (radians)."""
    c, s = math.cos(theta), math.sin(theta)
    dot  = v[0]*k[0] + v[1]*k[1] + v[2]*k[2]
    cross = (
        k[1]*v[2] - k[2]*v[1],
        k[2]*v[0] - k[0]*v[2],
        k[0]*v[1] - k[1]*v[0],
    )
    return (
        v[0]*c + cross[0]*s + k[0]*dot*(1-c),
        v[1]*c + cross[1]*s + k[1]*dot*(1-c),
        v[2]*c + cross[2]*s + k[2]*dot*(1-c),
    )

def perspective_project(pt3, camera_z=600):
    """Simple perspective: project (x,y,z) to 2D screen."""
    x, y, z = pt3
    # z=0 is card surface, z>0 is toward viewer
    d = camera_z / (camera_z - z) if camera_z != z else 1
    return (x * d, y * d)

# Crease endpoints and axis
AX, AY = W - FOLD, H        # bottom-left of fold box (on card bottom edge)
BX, BY = W,        H - FOLD  # top-right of fold box (on card right edge)
CX, CY = W,        H         # free corner

# Crease axis unit vector (in 3D, z=0 plane)
dx, dy = BX - AX, BY - AY
mag    = math.hypot(dx, dy)
K      = (dx/mag, dy/mag, 0.0)  # unit crease axis

# Free corner position relative to crease origin A
VC = (CX - AX, CY - AY, 0.0)

# ── Fonts ──────────────────────────────────────────────────────────────────────
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

# ── Base card (static content) ─────────────────────────────────────────────────
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

    # Static indent (darkened triangle showing where flap was)
    d.polygon([(AX,H),(W,H),(W,BY)], fill=(0,0,0,0))  # clear first
    indent = Image.new("RGBA",(W,H),(0,0,0,0))
    id2 = ImageDraw.Draw(indent)
    id2.polygon([(AX,AY),(W,H),(W,BY)], fill=(0,0,0,70))
    img = Image.alpha_composite(img, indent)

    return img

# ── Per-frame render ───────────────────────────────────────────────────────────
def make_frame(base, theta):
    """theta: rotation angle in radians. 0=flat, positive=folding toward viewer."""
    img = base.copy()

    # Rotate free corner C around crease axis
    vc_rot  = rodrigues(VC, K, theta)
    # World position of rotated corner
    cx3 = AX + vc_rot[0]
    cy3 = AY + vc_rot[1]
    cz3 =       vc_rot[2]   # z=0 is card plane, positive = toward viewer

    # Crease endpoints stay fixed (on the crease axis)
    pa = (AX, AY)  # bottom-left crease point
    pb = (BX, BY)  # top-right crease point

    # Project rotated corner to 2D
    pc_screen = perspective_project((cx3, cy3, cz3))
    pc = (int(pc_screen[0]), int(pc_screen[1]))

    flap_pts = [pa, pb, pc]

    # ── Shadow on card (grows with z lift) ──
    lift = max(0, cz3)  # how far the corner is off the card
    shadow_alpha = int(min(200, lift * 3.5))
    if shadow_alpha > 0:
        shadow_layer = Image.new("RGBA",(W,H),(0,0,0,0))
        for i in range(16,0,-1):
            expand = int((16-i) * lift / 40)
            a = int(shadow_alpha * (i/16) * 0.7)
            pts = [(AX-expand,H),(W,H),(W,BY-expand)]
            ImageDraw.Draw(shadow_layer).polygon(pts, fill=(0,0,0,a))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=5))
        img = Image.alpha_composite(img, shadow_layer)

    # ── Flap fill ──
    # Determine if we're seeing front or back face
    # Front face: theta < pi/2 (corner lifting)
    # Back face:  theta > pi/2 (folded past vertical, showing paper back)
    t_norm = abs(theta) / math.pi  # 0→1 over 180°

    flap_layer = Image.new("RGBA",(W,H),(0,0,0,0))
    fl = ImageDraw.Draw(flap_layer)

    if abs(theta) <= math.pi/2:
        # Front face — gets darker/deeper as it lifts
        dark   = int(18 + t_norm * 10)
        light  = int(55 + t_norm * 20)
        fl.polygon(flap_pts, fill=(dark,dark+2,dark+6,255))
        # Gradient strip from crease edge to free tip
        steps = 24
        for i in range(steps):
            s  = i / steps
            e1 = (int(pa[0] + s*(pb[0]-pa[0])), int(pa[1] + s*(pb[1]-pa[1])))
            e2 = (int(pa[0] + s*(pc[0]-pa[0])), int(pa[1] + s*(pc[1]-pa[1])))
            lv = int(dark + s * (light - dark))
            fl.polygon([pa, e1, e2], fill=(lv+6,lv+8,lv+18,255))
    else:
        # Back face — lighter (paper back visible)
        back_base = int(55 + (t_norm - 0.5) * 60)
        fl.polygon(flap_pts, fill=(back_base, back_base+5, back_base+10, 255))
        steps = 20
        for i in range(steps):
            s  = i / steps
            e1 = (int(pa[0] + s*(pb[0]-pa[0])), int(pa[1] + s*(pb[1]-pa[1])))
            e2 = (int(pa[0] + s*(pc[0]-pa[0])), int(pa[1] + s*(pc[1]-pa[1])))
            lv = int(back_base + s * 25)
            fl.polygon([pa,e1,e2], fill=(lv,lv+5,lv+10,255))

    img = Image.alpha_composite(img, flap_layer)
    d   = ImageDraw.Draw(img)

    # ── Crease glow ──
    crease_layer = Image.new("RGBA",(W,H),(0,0,0,0))
    cd = ImageDraw.Draw(crease_layer)
    cd.line([pa, pb], fill=(*CYAN, 110), width=2)
    crease_layer = crease_layer.filter(ImageFilter.GaussianBlur(radius=1.5))
    img = Image.alpha_composite(img, crease_layer)
    d   = ImageDraw.Draw(img)
    d.line([pa, pb], fill=(*CYAN, 150), width=1)

    # ── Clip to rounded card ──
    mask = Image.new("L",(W,H),0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,W-1,H-1], radius=R, fill=255)
    img.putalpha(mask)

    flat = Image.new("RGB",(W,H),BG)
    flat.paste(img, mask=img.split()[3])
    return flat

# ── Build frames ───────────────────────────────────────────────────────────────
print("Rendering base...")
base = make_base()

# Max fold angle — about 130° (past vertical, showing back face slightly)
MAX_THETA = math.radians(130)

print(f"Rendering {FRAMES} frames...")
frames = []
for i in range(FRAMES):
    # Ping-pong: 0 → MAX → 0
    raw   = i / FRAMES
    ping  = (1 - math.cos(raw * 2 * math.pi)) / 2  # 0→1→0
    eased = ease_in_out(ping)
    theta = eased * MAX_THETA

    frame = make_frame(base, theta)
    frames.append(frame)
    if i % 8 == 0:
        print(f"  {i+1}/{FRAMES}  theta={math.degrees(theta):.1f}°")

print("Saving GIF...")
frames[0].save(
    OUT,
    save_all=True,
    append_images=frames[1:],
    duration=int(1000/FPS),
    loop=0,
    optimize=False,
)
size_kb = os.path.getsize(OUT) / 1024
print(f"Written: {OUT}  ({size_kb:.1f} KB)")
