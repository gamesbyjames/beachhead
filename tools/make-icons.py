"""Generate home-screen icons from the original Beachhead crosshair design.

Requires Pillow only when regenerating the checked-in PNGs; it is not needed
to build or play the game.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def make_icon(size: int, filename: str) -> None:
    scale = 4
    image = Image.new("RGB", (size * scale, size * scale), "#142c32")
    draw = ImageDraw.Draw(image)
    unit = size * scale / 192

    def coords(*values: float) -> tuple[int, ...]:
        return tuple(round(value * unit) for value in values)

    colour = "#efcc8b"
    width = max(1, round(5 * unit))
    draw.ellipse(coords(51, 51, 141, 141), outline=colour, width=width)
    for line in [(96, 30, 96, 68), (96, 124, 96, 162), (30, 96, 68, 96), (124, 96, 162, 96)]:
        draw.line(coords(*line), fill=colour, width=width)
    draw.ellipse(coords(90, 90, 102, 102), fill=colour)
    image.resize((size, size), Image.Resampling.LANCZOS).save(OUT / filename, optimize=True)


for dimension, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
    make_icon(dimension, name)
