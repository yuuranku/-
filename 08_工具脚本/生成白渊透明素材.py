from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "07_成品输出" / "白渊透明素材（英文）"
PNG_DIR = OUT / "位图素材"
SVG_DIR = OUT / "矢量素材"

SCALE = 3
RANDOM_SEED = 1952


COLORS = {
    "navy": "#082B57",
    "deep_navy": "#031A35",
    "vermilion": "#B71F2A",
    "red": "#C7292E",
    "green": "#24734D",
    "amber": "#B66B18",
    "black": "#1F2428",
    "ice": "#8DC7E8",
    "white": "#FFFFFF",
}


FONT_CANDIDATES = {
    "serif_bold": [
        r"C:\Windows\Fonts\timesbd.ttf",
        r"C:\Windows\Fonts\cambriaz.ttf",
        r"C:\Windows\Fonts\georgiab.ttf",
    ],
    "serif": [
        r"C:\Windows\Fonts\times.ttf",
        r"C:\Windows\Fonts\cambria.ttc",
        r"C:\Windows\Fonts\georgia.ttf",
    ],
    "sans_bold": [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\SourceHanSansCN-Bold.otf",
        r"C:\Windows\Fonts\AlibabaPuHuiTi_2_65_Medium.ttf",
    ],
    "condensed": [
        r"C:\Windows\Fonts\AGENCYB.TTF",
        r"C:\Windows\Fonts\bahnschrift.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
    ],
    "mono": [
        r"C:\Windows\Fonts\consolab.ttf",
        r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\courbd.ttf",
    ],
}


def hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    hex_color = hex_color.lstrip("#")
    return (
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16),
        alpha,
    )


def font(kind: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES[kind]:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def fit_font(draw: ImageDraw.ImageDraw, text: str, kind: str, max_width: int, start: int, minimum: int = 18):
    size = start
    while size >= minimum:
        fnt = font(kind, size)
        w, h = text_size(draw, text, fnt)
        if w <= max_width:
            return fnt, w, h
        size -= 2
    fnt = font(kind, minimum)
    w, h = text_size(draw, text, fnt)
    return fnt, w, h


def ensure_dirs() -> None:
    PNG_DIR.mkdir(parents=True, exist_ok=True)
    SVG_DIR.mkdir(parents=True, exist_ok=True)


def crop_alpha(img: Image.Image, pad: int = 20) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(img.width, bbox[2] + pad)
    bottom = min(img.height, bbox[3] + pad)
    return img.crop((left, top, right, bottom))


def save_png(img: Image.Image, name: str) -> Path:
    path = PNG_DIR / f"{name}.png"
    img = crop_alpha(img, pad=24 * SCALE)
    if SCALE != 1:
        img = img.resize((max(1, img.width // SCALE), max(1, img.height // SCALE)), Image.Resampling.LANCZOS)
    img.save(path)
    return path


def save_svg(name: str, svg: str) -> Path:
    path = SVG_DIR / f"{name}.svg"
    path.write_text(svg, encoding="utf-8")
    return path


def add_distress(alpha_img: Image.Image, strength: float = 0.16) -> Image.Image:
    rng = random.Random(RANDOM_SEED + alpha_img.width + alpha_img.height)
    alpha = alpha_img.getchannel("A")
    mask = Image.new("L", alpha.size, 0)
    md = ImageDraw.Draw(mask)
    count = int((alpha.size[0] * alpha.size[1]) * strength / 1300)
    for _ in range(count):
        x = rng.randint(0, alpha.size[0] - 1)
        y = rng.randint(0, alpha.size[1] - 1)
        r = rng.randint(2 * SCALE, 10 * SCALE)
        md.ellipse((x - r, y - r, x + r, y + r), fill=rng.randint(55, 140))
    for _ in range(26):
        x = rng.randint(0, alpha.size[0] - 1)
        y = rng.randint(0, alpha.size[1] - 1)
        length = rng.randint(20 * SCALE, 90 * SCALE)
        width = rng.randint(1 * SCALE, 3 * SCALE)
        md.line((x, y, x + length, y + rng.randint(-8 * SCALE, 8 * SCALE)), fill=rng.randint(35, 115), width=width)
    mask = mask.filter(ImageFilter.GaussianBlur(0.8 * SCALE))
    weakened = Image.composite(Image.new("L", alpha.size, 0), alpha, mask.point(lambda p: min(255, int(p * 1.7))))
    out_alpha = Image.composite(weakened, alpha, mask)
    out = alpha_img.copy()
    out.putalpha(out_alpha)
    return out


def rotate_asset(img: Image.Image, degrees: float) -> Image.Image:
    return img.rotate(degrees, expand=True, resample=Image.Resampling.BICUBIC)


@dataclass
class Asset:
    name: str
    category: str
    description: str
    png: Path
    svg: Path | None = None


def render_rect_stamp(name: str, text: str, color_key: str, subline: str | None = None, angle: float = -8) -> Asset:
    w, h = 820 * SCALE, 300 * SCALE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(COLORS[color_key], 235)
    stroke = 10 * SCALE
    radius = 22 * SCALE
    margin = 28 * SCALE
    d.rounded_rectangle((margin, margin, w - margin, h - margin), radius=radius, outline=color, width=stroke)
    d.rounded_rectangle((margin + 24 * SCALE, margin + 24 * SCALE, w - margin - 24 * SCALE, h - margin - 24 * SCALE), radius=radius // 2, outline=color, width=max(3 * SCALE, stroke // 2))
    fnt, tw, th = fit_font(d, text, "serif_bold", w - 150 * SCALE, 108 * SCALE, minimum=44 * SCALE)
    d.text(((w - tw) / 2, 82 * SCALE - th / 2), text, font=fnt, fill=color)
    if subline:
        sfnt, sw, sh = fit_font(d, subline, "mono", w - 150 * SCALE, 34 * SCALE, minimum=16 * SCALE)
        d.text(((w - sw) / 2, 203 * SCALE), subline, font=sfnt, fill=color)
        d.line((118 * SCALE, 194 * SCALE, w - 118 * SCALE, 194 * SCALE), fill=color, width=3 * SCALE)
    img = add_distress(img, strength=0.18)
    img = rotate_asset(img, angle)
    png = save_png(img, name)
    svg = save_svg(
        name,
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 300">
  <g fill="none" stroke="{COLORS[color_key]}" stroke-width="10" opacity="0.94" transform="rotate({angle} 410 150)">
    <rect x="28" y="28" width="764" height="244" rx="22"/>
    <rect x="52" y="52" width="716" height="196" rx="12" stroke-width="5"/>
    <line x1="118" y1="194" x2="702" y2="194" stroke-width="3"/>
  </g>
  <g fill="{COLORS[color_key]}" opacity="0.94" text-anchor="middle" transform="rotate({angle} 410 150)">
    <text x="410" y="134" font-family="Times New Roman, serif" font-size="76" font-weight="700" letter-spacing="4">{text}</text>
    <text x="410" y="231" font-family="Consolas, monospace" font-size="24" letter-spacing="2">{subline or ""}</text>
  </g>
</svg>
''',
    )
    return Asset(name, "stamp", f"{text} rectangular {color_key} stamp", png, svg)


def render_round_stamp(name: str, top: str, center: str, bottom: str, color_key: str, angle: float = 6) -> Asset:
    size = 620 * SCALE
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(COLORS[color_key], 238)
    cx = cy = size // 2
    for r, width in [(284 * SCALE, 9 * SCALE), (238 * SCALE, 5 * SCALE), (162 * SCALE, 4 * SCALE)]:
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=width)
    d.line((cx - 130 * SCALE, cy, cx + 130 * SCALE, cy), fill=color, width=5 * SCALE)
    main_fnt, mw, mh = fit_font(d, center, "serif_bold", 390 * SCALE, 74 * SCALE, minimum=38 * SCALE)
    d.text((cx - mw / 2, cy - mh / 2 - 9 * SCALE), center, font=main_fnt, fill=color)
    small_fnt = font("condensed", 36 * SCALE)
    for label, y in [(top, 112 * SCALE), (bottom, 468 * SCALE)]:
        sw, sh = text_size(d, label, small_fnt)
        d.text((cx - sw / 2, y - sh / 2), label, font=small_fnt, fill=color)
    for x in [114 * SCALE, size - 114 * SCALE]:
        d.ellipse((x - 13 * SCALE, cy - 13 * SCALE, x + 13 * SCALE, cy + 13 * SCALE), fill=color)
    img = add_distress(img, strength=0.15)
    img = rotate_asset(img, angle)
    png = save_png(img, name)
    svg = save_svg(
        name,
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 620">
  <g transform="rotate({angle} 310 310)" fill="none" stroke="{COLORS[color_key]}" opacity="0.94">
    <circle cx="310" cy="310" r="284" stroke-width="9"/>
    <circle cx="310" cy="310" r="238" stroke-width="5"/>
    <circle cx="310" cy="310" r="162" stroke-width="4"/>
    <line x1="180" y1="310" x2="440" y2="310" stroke-width="5"/>
    <circle cx="114" cy="310" r="13" fill="{COLORS[color_key]}" stroke="none"/>
    <circle cx="506" cy="310" r="13" fill="{COLORS[color_key]}" stroke="none"/>
  </g>
  <g transform="rotate({angle} 310 310)" fill="{COLORS[color_key]}" opacity="0.94" text-anchor="middle">
    <text x="310" y="125" font-family="Arial Narrow, Arial, sans-serif" font-size="36" font-weight="700" letter-spacing="3">{top}</text>
    <text x="310" y="328" font-family="Times New Roman, serif" font-size="62" font-weight="700" letter-spacing="2">{center}</text>
    <text x="310" y="481" font-family="Arial Narrow, Arial, sans-serif" font-size="36" font-weight="700" letter-spacing="3">{bottom}</text>
  </g>
</svg>
''',
    )
    return Asset(name, "round_stamp", f"{center} round {color_key} stamp", png, svg)


def render_label(name: str, title: str, meta: str, color_key: str, kind: str = "file") -> Asset:
    w, h = 920 * SCALE, 250 * SCALE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(COLORS[color_key], 242)
    ice = hex_to_rgba(COLORS["ice"], 170)
    d.rounded_rectangle((16 * SCALE, 18 * SCALE, w - 16 * SCALE, h - 18 * SCALE), radius=12 * SCALE, outline=color, width=5 * SCALE)
    d.rectangle((16 * SCALE, 18 * SCALE, 186 * SCALE, h - 18 * SCALE), fill=hex_to_rgba(COLORS[color_key], 52), outline=color, width=5 * SCALE)
    d.line((204 * SCALE, 52 * SCALE, w - 56 * SCALE, 52 * SCALE), fill=ice, width=2 * SCALE)
    d.line((204 * SCALE, 196 * SCALE, w - 56 * SCALE, 196 * SCALE), fill=ice, width=2 * SCALE)
    if kind == "file":
        d.rectangle((62 * SCALE, 64 * SCALE, 136 * SCALE, 166 * SCALE), outline=color, width=5 * SCALE)
        d.line((86 * SCALE, 64 * SCALE, 86 * SCALE, 38 * SCALE, 134 * SCALE, 38 * SCALE), fill=color, width=5 * SCALE)
    elif kind == "video":
        d.rounded_rectangle((54 * SCALE, 72 * SCALE, 146 * SCALE, 154 * SCALE), radius=10 * SCALE, outline=color, width=5 * SCALE)
        d.polygon([(146 * SCALE, 94 * SCALE), (178 * SCALE, 75 * SCALE), (178 * SCALE, 151 * SCALE), (146 * SCALE, 132 * SCALE)], outline=color, fill=None)
        d.line((146 * SCALE, 94 * SCALE, 178 * SCALE, 75 * SCALE), fill=color, width=5 * SCALE)
        d.line((146 * SCALE, 132 * SCALE, 178 * SCALE, 151 * SCALE), fill=color, width=5 * SCALE)
        d.line((178 * SCALE, 75 * SCALE, 178 * SCALE, 151 * SCALE), fill=color, width=5 * SCALE)
    elif kind == "tag":
        d.polygon([(54 * SCALE, 52 * SCALE), (146 * SCALE, 52 * SCALE), (174 * SCALE, 106 * SCALE), (146 * SCALE, 160 * SCALE), (54 * SCALE, 160 * SCALE)], outline=color)
        d.ellipse((78 * SCALE, 90 * SCALE, 102 * SCALE, 114 * SCALE), outline=color, width=4 * SCALE)
    title_fnt, tw, th = fit_font(d, title, "sans_bold", 620 * SCALE, 54 * SCALE, minimum=28 * SCALE)
    meta_fnt, mw, mh = fit_font(d, meta, "mono", 610 * SCALE, 28 * SCALE, minimum=15 * SCALE)
    d.text((224 * SCALE, 82 * SCALE), title, font=title_fnt, fill=color)
    d.text((226 * SCALE, 154 * SCALE), meta, font=meta_fnt, fill=color)
    png = save_png(img, name)
    svg = save_svg(
        name,
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 250">
  <g fill="none" stroke="{COLORS[color_key]}" stroke-width="5" opacity="0.95">
    <rect x="16" y="18" width="888" height="214" rx="12"/>
    <rect x="16" y="18" width="170" height="214" fill="{COLORS[color_key]}" fill-opacity="0.16"/>
    <line x1="204" y1="52" x2="864" y2="52" stroke="{COLORS["ice"]}" stroke-width="2" opacity="0.7"/>
    <line x1="204" y1="196" x2="864" y2="196" stroke="{COLORS["ice"]}" stroke-width="2" opacity="0.7"/>
  </g>
  <text x="224" y="122" fill="{COLORS[color_key]}" font-family="Arial, sans-serif" font-size="48" font-weight="700" letter-spacing="1">{title}</text>
  <text x="226" y="178" fill="{COLORS[color_key]}" font-family="Consolas, monospace" font-size="24" letter-spacing="1">{meta}</text>
</svg>
''',
    )
    return Asset(name, "file_label", f"{title} label", png, svg)


def render_corner(name: str, color_key: str, mode: str) -> Asset:
    w, h = 760 * SCALE, 430 * SCALE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(COLORS[color_key], 235)
    lw = 8 * SCALE
    l = 102 * SCALE
    pad = 20 * SCALE
    for sx, sy in [(pad, pad), (w - pad, pad), (pad, h - pad), (w - pad, h - pad)]:
        xdir = 1 if sx == pad else -1
        ydir = 1 if sy == pad else -1
        d.line((sx, sy, sx + xdir * l, sy), fill=color, width=lw)
        d.line((sx, sy, sx, sy + ydir * l), fill=color, width=lw)
    mono = font("mono", 32 * SCALE)
    if mode == "rec":
        d.ellipse((54 * SCALE, 42 * SCALE, 88 * SCALE, 76 * SCALE), fill=hex_to_rgba(COLORS["red"], 240))
        d.text((102 * SCALE, 38 * SCALE), "REC", font=font("condensed", 40 * SCALE), fill=hex_to_rgba(COLORS["red"], 240))
        d.text((512 * SCALE, 356 * SCALE), "HZ6-FRAME", font=mono, fill=color)
    elif mode == "safe":
        d.line((w // 2, 20 * SCALE, w // 2, 78 * SCALE), fill=color, width=3 * SCALE)
        d.line((w // 2, h - 20 * SCALE, w // 2, h - 78 * SCALE), fill=color, width=3 * SCALE)
        d.line((20 * SCALE, h // 2, 78 * SCALE, h // 2), fill=color, width=3 * SCALE)
        d.line((w - 20 * SCALE, h // 2, w - 78 * SCALE, h // 2), fill=color, width=3 * SCALE)
        d.text((42 * SCALE, 350 * SCALE), "SAFE FRAME", font=mono, fill=color)
    png = save_png(img, name)
    svg = save_svg(
        name,
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 430">
  <g fill="none" stroke="{COLORS[color_key]}" stroke-width="8" opacity="0.92">
    <path d="M20 122 V20 H122"/>
    <path d="M638 20 H740 V122"/>
    <path d="M20 308 V410 H122"/>
    <path d="M638 410 H740 V308"/>
  </g>
  <text x="102" y="69" fill="{COLORS["red"] if mode == "rec" else COLORS[color_key]}" font-family="Arial Narrow, Arial, sans-serif" font-size="40" font-weight="700">{'REC' if mode == 'rec' else ''}</text>
  {'<circle cx="71" cy="59" r="17" fill="' + COLORS["red"] + '" opacity="0.94"/>' if mode == "rec" else ""}
</svg>
''',
    )
    return Asset(name, "video_overlay", f"{mode} video corner overlay", png, svg)


def render_timecode(name: str, color_key: str, text: str) -> Asset:
    w, h = 680 * SCALE, 128 * SCALE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(COLORS[color_key], 238)
    d.rounded_rectangle((10 * SCALE, 12 * SCALE, w - 10 * SCALE, h - 12 * SCALE), radius=8 * SCALE, outline=color, width=4 * SCALE)
    d.rectangle((22 * SCALE, 24 * SCALE, w - 22 * SCALE, h - 24 * SCALE), outline=hex_to_rgba(COLORS["ice"], 160), width=2 * SCALE)
    fnt, tw, th = fit_font(d, text, "mono", 600 * SCALE, 44 * SCALE, minimum=24 * SCALE)
    d.text(((w - tw) / 2, (h - th) / 2 - 5 * SCALE), text, font=fnt, fill=color)
    png = save_png(img, name)
    svg = save_svg(
        name,
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 128">
  <rect x="10" y="12" width="660" height="104" rx="8" fill="none" stroke="{COLORS[color_key]}" stroke-width="4" opacity="0.94"/>
  <rect x="22" y="24" width="636" height="80" fill="none" stroke="{COLORS["ice"]}" stroke-width="2" opacity="0.62"/>
  <text x="340" y="79" fill="{COLORS[color_key]}" font-family="Consolas, monospace" font-size="42" text-anchor="middle">{text}</text>
</svg>
''',
    )
    return Asset(name, "video_overlay", f"{text} timecode plate", png, svg)


def render_icon(name: str, color_key: str, kind: str, label: str | None = None) -> Asset:
    size = 420 * SCALE
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(COLORS[color_key], 238)
    cx = cy = size // 2
    lw = 8 * SCALE
    if kind == "warning":
        pts = [(cx, 58 * SCALE), (360 * SCALE, 344 * SCALE), (60 * SCALE, 344 * SCALE)]
        d.polygon(pts, outline=color)
        d.line((cx, 142 * SCALE, cx, 250 * SCALE), fill=color, width=lw)
        d.ellipse((cx - 6 * SCALE, 286 * SCALE, cx + 6 * SCALE, 298 * SCALE), fill=color)
    elif kind == "crosshair":
        for r in [62 * SCALE, 132 * SCALE]:
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=5 * SCALE)
        d.line((cx, 34 * SCALE, cx, 386 * SCALE), fill=color, width=4 * SCALE)
        d.line((34 * SCALE, cy, 386 * SCALE, cy), fill=color, width=4 * SCALE)
        d.rectangle((cx - 26 * SCALE, cy - 26 * SCALE, cx + 26 * SCALE, cy + 26 * SCALE), outline=color, width=4 * SCALE)
    elif kind == "arrow":
        d.line((70 * SCALE, 300 * SCALE, 310 * SCALE, 110 * SCALE), fill=color, width=lw)
        d.polygon([(310 * SCALE, 110 * SCALE), (284 * SCALE, 190 * SCALE), (232 * SCALE, 127 * SCALE)], fill=color)
        d.line((102 * SCALE, 324 * SCALE, 342 * SCALE, 134 * SCALE), fill=hex_to_rgba(COLORS["ice"], 130), width=3 * SCALE)
    elif kind == "pin":
        d.ellipse((130 * SCALE, 62 * SCALE, 290 * SCALE, 222 * SCALE), outline=color, width=lw)
        d.ellipse((184 * SCALE, 116 * SCALE, 236 * SCALE, 168 * SCALE), outline=color, width=5 * SCALE)
        d.polygon([(210 * SCALE, 382 * SCALE), (146 * SCALE, 198 * SCALE), (274 * SCALE, 198 * SCALE)], outline=color)
        d.line((210 * SCALE, 382 * SCALE, 210 * SCALE, 232 * SCALE), fill=color, width=4 * SCALE)
    elif kind == "reticle":
        d.ellipse((72 * SCALE, 72 * SCALE, 348 * SCALE, 348 * SCALE), outline=color, width=5 * SCALE)
        for i in range(24):
            a = math.radians(i * 15)
            r1, r2 = 142 * SCALE, 164 * SCALE
            x1, y1 = cx + math.cos(a) * r1, cy + math.sin(a) * r1
            x2, y2 = cx + math.cos(a) * r2, cy + math.sin(a) * r2
            d.line((x1, y1, x2, y2), fill=color, width=3 * SCALE)
        d.line((cx - 170 * SCALE, cy, cx - 55 * SCALE, cy), fill=color, width=3 * SCALE)
        d.line((cx + 55 * SCALE, cy, cx + 170 * SCALE, cy), fill=color, width=3 * SCALE)
        d.line((cx, cy - 170 * SCALE, cx, cy - 55 * SCALE), fill=color, width=3 * SCALE)
        d.line((cx, cy + 55 * SCALE, cx, cy + 170 * SCALE), fill=color, width=3 * SCALE)
    elif kind == "ruler":
        d.rounded_rectangle((56 * SCALE, 148 * SCALE, 366 * SCALE, 220 * SCALE), radius=8 * SCALE, outline=color, width=5 * SCALE)
        for i in range(16):
            x = (76 + i * 18) * SCALE
            tick = 44 * SCALE if i % 4 == 0 else 28 * SCALE if i % 2 == 0 else 18 * SCALE
            d.line((x, 148 * SCALE, x, 148 * SCALE + tick), fill=color, width=3 * SCALE)
        d.text((78 * SCALE, 234 * SCALE), "CM / FIELD SCALE", font=font("mono", 23 * SCALE), fill=color)
    elif kind == "crop":
        l = 122 * SCALE
        pad = 60 * SCALE
        for sx, sy in [(pad, pad), (size - pad, pad), (pad, size - pad), (size - pad, size - pad)]:
            xdir = 1 if sx == pad else -1
            ydir = 1 if sy == pad else -1
            d.line((sx, sy, sx + xdir * l, sy), fill=color, width=lw)
            d.line((sx, sy, sx, sy + ydir * l), fill=color, width=lw)
    if label:
        fnt, tw, th = fit_font(d, label, "condensed", 320 * SCALE, 34 * SCALE, minimum=18 * SCALE)
        d.text((cx - tw / 2, 352 * SCALE - th / 2), label, font=fnt, fill=color)
    png = save_png(img, name)
    svg = save_svg(
        name,
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 420">
  <title>{name}</title>
  <desc>{kind} graphic marker in {color_key}</desc>
  <g fill="none" stroke="{COLORS[color_key]}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.94">
    <text x="210" y="380" fill="{COLORS[color_key]}" stroke="none" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-size="28">{label or ""}</text>
  </g>
</svg>
''',
    )
    return Asset(name, "graphic_marker", f"{kind} marker", png, svg)


def render_scan_ticks(name: str, color_key: str) -> Asset:
    w, h = 960 * SCALE, 140 * SCALE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(COLORS[color_key], 225)
    d.line((24 * SCALE, 70 * SCALE, w - 24 * SCALE, 70 * SCALE), fill=color, width=3 * SCALE)
    for i in range(41):
        x = (40 + i * 22) * SCALE
        height = 42 * SCALE if i % 5 == 0 else 26 * SCALE if i % 2 == 0 else 16 * SCALE
        d.line((x, 70 * SCALE - height // 2, x, 70 * SCALE + height // 2), fill=color, width=3 * SCALE)
    d.text((42 * SCALE, 94 * SCALE), "FRAME TRACKING TICKS", font=font("mono", 24 * SCALE), fill=color)
    png = save_png(img, name)
    return Asset(name, "video_overlay", "frame tracking tick ruler", png, None)


def render_seal_tape(name: str, color_key: str, text: str) -> Asset:
    w, h = 980 * SCALE, 180 * SCALE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(COLORS[color_key], 220)
    d.rounded_rectangle((12 * SCALE, 32 * SCALE, w - 12 * SCALE, 142 * SCALE), radius=10 * SCALE, outline=color, width=5 * SCALE)
    for x in range(30 * SCALE, w - 30 * SCALE, 48 * SCALE):
        d.line((x, 36 * SCALE, x + 24 * SCALE, 140 * SCALE), fill=hex_to_rgba(COLORS[color_key], 80), width=10 * SCALE)
    fnt, tw, th = fit_font(d, text, "sans_bold", 800 * SCALE, 46 * SCALE, minimum=25 * SCALE)
    d.text(((w - tw) / 2, 82 * SCALE - th / 2), text, font=fnt, fill=color)
    png = save_png(img, name)
    return Asset(name, "file_label", f"{text} seal tape", png, None)


def build_assets() -> list[Asset]:
    assets: list[Asset] = []
    assets.extend(
        [
            render_rect_stamp("stamp_confirmed_red", "CONFIRMED", "red", "BUREAU OF ANTARCTIC SURVEY", -7),
            render_rect_stamp("stamp_rejected_red", "REJECTED", "red", "REVIEW BOARD NOTICE", 8),
            render_rect_stamp("stamp_approved_green", "APPROVED", "green", "FIELD AUTHORIZATION", -5),
            render_rect_stamp("stamp_denied_black", "DENIED", "black", "ACCESS CONTROL", 6),
            render_rect_stamp("stamp_archived_navy", "ARCHIVED", "navy", "PERMANENT RECORD", -4),
            render_rect_stamp("stamp_classified_black", "CLASSIFIED", "black", "LEVEL IV / SEALED", -9),
            render_rect_stamp("stamp_sample_logged_amber", "SAMPLE LOGGED", "amber", "CHAIN OF CUSTODY", 4),
            render_rect_stamp("stamp_evidence_logged_navy", "EVIDENCE LOGGED", "navy", "HZ-6 CASE FILE", -6),
            render_rect_stamp("stamp_void_red", "VOID", "red", "SUPERSEDED COPY", 10),
            render_rect_stamp("stamp_released_green", "RELEASED", "green", "PUBLIC EXTRACT", -3),
        ]
    )
    assets.extend(
        [
            render_round_stamp("round_stamp_field_verified_navy", "ANTARCTIC FIELD UNIT", "VERIFIED", "HZ-6 SAMPLE LINE", "navy", 5),
            render_round_stamp("round_stamp_access_revoked_red", "ACCESS CONTROL", "REVOKED", "ARCHIVE USE ONLY", "red", -7),
            render_round_stamp("round_stamp_specimen_cleared_green", "SPECIMEN CONTROL", "CLEARED", "LAB TRANSFER", "green", 4),
            render_round_stamp("round_stamp_quarantine_amber", "BIOSECURITY REVIEW", "HOLD", "QUARANTINE", "amber", -5),
            render_round_stamp("round_stamp_chain_of_custody_black", "BUREAU RECORDS", "CUSTODY", "SIGNED COPY", "black", 6),
        ]
    )
    assets.extend(
        [
            render_label("file_label_evidence_navy", "EVIDENCE FILE", "CASE: HZ-6 / STATUS: OPEN", "navy", "file"),
            render_label("file_label_restricted_red", "RESTRICTED ACCESS", "CLEARANCE: LEVEL IV", "red", "file"),
            render_label("file_label_sample_amber", "SAMPLE TRANSFER", "SPECIMEN: ROOT PLATE / FROST", "amber", "tag"),
            render_label("file_label_video_record_navy", "VIDEO RECORD", "ROLL: R06 / FRAME: 0001-0037", "navy", "video"),
            render_label("file_label_archive_copy_black", "ARCHIVE COPY", "BOX: BY-1952-HZ6 / COPY A", "black", "file"),
            render_seal_tape("seal_tape_classified_red", "red", "CLASSIFIED ARCHIVE SEAL"),
            render_seal_tape("seal_tape_chain_of_custody_navy", "navy", "CHAIN OF CUSTODY"),
        ]
    )
    assets.extend(
        [
            render_corner("video_rec_corner_red", "red", "rec"),
            render_corner("video_safe_frame_navy", "navy", "safe"),
            render_timecode("video_timecode_navy", "navy", "00:07:19:12 / HZ6-R06"),
            render_timecode("video_frame_id_black", "black", "FRAME 017 / CONTACT EVENT"),
            render_scan_ticks("video_tracking_ticks_ice", "ice"),
            render_icon("video_scanning_reticle_navy", "navy", "reticle", "SCAN"),
        ]
    )
    assets.extend(
        [
            render_icon("marker_warning_amber", "amber", "warning", "WARNING"),
            render_icon("marker_crosshair_navy", "navy", "crosshair", "GRID"),
            render_icon("marker_arrow_red", "red", "arrow", "POINT"),
            render_icon("marker_arrow_navy", "navy", "arrow", "TRACE"),
            render_icon("marker_specimen_pin_green", "green", "pin", "SAMPLE"),
            render_icon("marker_measure_scale_black", "black", "ruler", None),
            render_icon("marker_photo_crop_red", "red", "crop", None),
        ]
    )
    return assets


def main() -> None:
    ensure_dirs()
    random.seed(RANDOM_SEED)
    assets = build_assets()
    manifest = {
        "title": "Baiyuan / HZ-6 transparent English extension assets",
        "background": "transparent alpha",
        "language": "English only",
        "count": len(assets),
        "assets": [
            {
                "name": asset.name,
                "category": asset.category,
                "description": asset.description,
                "png": str(asset.png.relative_to(ROOT)).replace("\\", "/"),
                "svg": str(asset.svg.relative_to(ROOT)).replace("\\", "/") if asset.svg else None,
            }
            for asset in assets
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "count": len(assets)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
