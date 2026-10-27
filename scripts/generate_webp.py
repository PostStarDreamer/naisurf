from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
GAME_LONG_EDGE = 480
DISPLAY_QUALITY = 84
GAME_QUALITY = 82

FILES = [
    "public/assets/showcase/egg.png",
    "public/assets/showcase/mouse.png",
    "public/assets/showcase/chicken.png",
    "public/assets/showcase/dog.png",
    "public/assets/showcase/frog.png",
    "public/assets/characters/egg-surf.png",
    "public/assets/characters/mouse-surf.png",
    "public/assets/characters/chicken-surf.png",
    "public/assets/characters/dog-surf.png",
    "public/assets/characters/frog-surf.png",
    "public/assets/monster-lure-three-quarter.png",
    "public/assets/monster-chase-closed-front.png",
    "public/assets/monster-chase-open-front.png",
    "public/assets/monster-capture-back-three-quarter.png",
    "public/assets/monster-hero-side.png",
    "public/assets/monster-recoil-three-quarter.png",
]


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    rgb = image.convert("RGB")
    alpha = image.getchannel("A")
    premultiplied = Image.merge(
        "RGB",
        [ImageChops.multiply(channel, alpha) for channel in rgb.split()],
    ).resize(size, Image.Resampling.LANCZOS)
    resized_alpha = alpha.resize(size, Image.Resampling.LANCZOS)
    premultiplied_pixels = np.asarray(premultiplied).astype(np.float32)
    alpha_pixels = np.asarray(resized_alpha).astype(np.float32)
    restored = np.zeros((*alpha_pixels.shape, 4), dtype=np.uint8)
    opaque = alpha_pixels > 127.5
    restored[:, :, 3] = np.where(opaque, 255, 0).astype(np.uint8)
    restored[:, :, :3] = np.clip(
        premultiplied_pixels / np.maximum(alpha_pixels, 1)[:, :, None] * 255,
        0,
        255,
    ).astype(np.uint8)
    restored[~opaque, :3] = 0
    return Image.fromarray(restored, "RGBA")


def save_webp(image: Image.Image, path: Path, quality: int) -> None:
    image.save(
        path,
        format="WEBP",
        quality=quality,
        method=6,
        alpha_quality=100,
        exact=True,
    )


def game_path(path: Path) -> Path:
    return path.with_name(f"{path.stem}.game.webp")


def display_path(path: Path) -> Path:
    return path.with_suffix(".webp")


def main() -> None:
    source_bytes = 0
    output_bytes = 0
    game_bytes = 0

    for relative_path in FILES:
        source_path = ROOT / relative_path
        source = Image.open(source_path).convert("RGBA")
        source_bytes += source_path.stat().st_size

        display = display_path(source_path)
        save_webp(source, display, DISPLAY_QUALITY)
        output_bytes += display.stat().st_size

        scale = GAME_LONG_EDGE / max(source.size)
        target_size = (
            round(source.width * scale),
            round(source.height * scale),
        )
        game = game_path(source_path)
        save_webp(resize_premultiplied(source, target_size), game, GAME_QUALITY)
        game_bytes += game.stat().st_size

    print(
        f"Generated {len(FILES)} display WebP ({output_bytes / 1024:.0f} KiB) "
        f"and {len(FILES)} game WebP ({game_bytes / 1024:.0f} KiB) "
        f"from {source_bytes / 1024:.0f} KiB PNG sources."
    )


if __name__ == "__main__":
    main()
