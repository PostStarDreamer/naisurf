from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
TARGET_LONG_EDGE = 720
BASELINE_PATH = ROOT / "src" / "game" / "asset-baseline.json"

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


def is_light_edge_pixel(rgb: tuple[int, int, int]) -> bool:
    red, green, blue = rgb
    return min(rgb) >= 196 and max(rgb) - min(rgb) <= 42


def clean_boundary_halo(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    pixels = np.asarray(source).copy()
    height, width = pixels.shape[:2]
    alpha = pixels[:, :, 3]

    for _ in range(3):
        candidates: list[tuple[int, int]] = []
        for y in range(height):
            for x in range(width):
                if alpha[y, x] == 0:
                    continue
                edge = False
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if nx < 0 or ny < 0 or nx >= width or ny >= height:
                            edge = True
                            break
                        if alpha[ny, nx] == 0:
                            edge = True
                            break
                    if edge:
                        break
                if edge and is_light_edge_pixel(tuple(pixels[y, x, :3])):
                    candidates.append((x, y))

        if not candidates:
            break

        replacements: dict[tuple[int, int], tuple[int, int, int]] = {}
        for x, y in candidates:
            best: tuple[int, int, int] | None = None
            best_luma = 256
            for radius in range(1, 6):
                for ny in range(max(0, y - radius), min(height, y + radius + 1)):
                    for nx in range(max(0, x - radius), min(width, x + radius + 1)):
                        if alpha[ny, nx] == 0:
                            continue
                        rgb = tuple(int(value) for value in pixels[ny, nx, :3])
                        if is_light_edge_pixel(rgb):
                            continue
                        luma = sum(rgb) / 3
                        if luma < best_luma:
                            best = rgb
                            best_luma = luma
                if best is not None:
                    break
            if best is not None:
                replacements[(x, y)] = best

        for (x, y), rgb in replacements.items():
            pixels[y, x, :3] = rgb

    return Image.fromarray(pixels, "RGBA")


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    rgb = image.convert("RGB")
    alpha = image.getchannel("A")
    premultiplied = Image.merge(
        "RGB",
        [
            ImageChops.multiply(channel, alpha)
            for channel in rgb.split()
        ],
    ).resize(size, Image.Resampling.LANCZOS)
    resized_alpha = alpha.resize(size, Image.Resampling.LANCZOS)
    premultiplied_pixels = np.asarray(premultiplied).astype(np.float32)
    alpha_pixels = np.asarray(resized_alpha).astype(np.float32)
    restored = np.zeros((*alpha_pixels.shape, 4), dtype=np.uint8)
    opaque = alpha_pixels > 127.5
    restored[:, :, 3] = np.where(opaque, 255, 0).astype(np.uint8)
    safe_alpha = np.maximum(alpha_pixels, 1)
    restored[:, :, :3] = np.clip(
        premultiplied_pixels / safe_alpha[:, :, None] * 255,
        0,
        255,
    ).astype(np.uint8)
    restored[~opaque, :3] = 0
    return Image.fromarray(restored, "RGBA")


def sharpen_against_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    sharpened = image.convert("RGB").filter(
        ImageFilter.UnsharpMask(radius=1.1, percent=85, threshold=3)
    )
    return Image.merge("RGBA", (*sharpened.split(), alpha))


def mask_signature(image: Image.Image, size: int = 64) -> str:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.nonzero(alpha > 0)
    if not len(xs):
        return "0" * ((size * size + 7) // 8)
    cropped = image.crop(
        (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    )
    resized = cropped.getchannel("A").resize(
        (size, size), Image.Resampling.LANCZOS
    )
    bits = (np.asarray(resized) >= 128).reshape(-1)
    packed = np.packbits(bits.astype(np.uint8), bitorder="big")
    return packed.tobytes().hex()


def process(relative_path: str) -> dict[str, object]:
    path = ROOT / relative_path
    original = Image.open(path).convert("RGBA")
    original_size = original.size
    original_alpha = np.asarray(original.getchannel("A"))
    original_coverage = float((original_alpha > 0).mean())
    original_mask = mask_signature(original)

    cleaned = clean_boundary_halo(original)
    scale = TARGET_LONG_EDGE / max(original_size)
    target_size = (
        round(original_size[0] * scale),
        round(original_size[1] * scale),
    )
    enlarged = sharpen_against_alpha(resize_premultiplied(cleaned, target_size))
    enlarged = clean_boundary_halo(enlarged)

    padded_size = (
        max(target_size[0] + 6, round(target_size[0] * 1.03)),
        max(target_size[1] + 6, round(target_size[1] * 1.03)),
    )
    margin_x = (padded_size[0] - target_size[0]) // 2
    margin_y = (padded_size[1] - target_size[1]) // 2
    padded = Image.new(
        "RGBA",
        padded_size,
        (0, 0, 0, 0),
    )
    padded.alpha_composite(enlarged, (margin_x, margin_y))
    output_alpha = np.asarray(padded.getchannel("A"))
    padded.putalpha(Image.fromarray(np.where(output_alpha > 0, 255, 0).astype(np.uint8)))
    padded.save(path, format="PNG", optimize=True)

    final_alpha = np.asarray(padded.getchannel("A"))
    output_coverage = float((final_alpha > 0).mean())
    return {
        "path": relative_path,
        "original": {
            "width": original_size[0],
            "height": original_size[1],
            "coverage": original_coverage,
            "mask": original_mask,
        },
        "output": {
            "width": padded.width,
            "height": padded.height,
            "coverage": output_coverage,
        },
    }


def main() -> None:
    records = [process(relative_path) for relative_path in FILES]
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_PATH.write_text(
        json.dumps({"maskSize": 64, "assets": records}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Processed {len(records)} PNG assets to >= {TARGET_LONG_EDGE}px")


if __name__ == "__main__":
    main()
