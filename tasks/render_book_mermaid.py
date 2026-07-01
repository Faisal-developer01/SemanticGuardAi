"""Render Mermaid diagrams in the final SemanticGuard AI book as PNG files.

The output uses a white background and black diagram strokes/text so the
figures match the thesis formatting requirements.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
BOOK = ROOT / "docs" / "SemanticGuard-AI-Book.md"
DIAGRAMS = ROOT / "docs" / "diagrams"
IMAGES = ROOT / "docs" / "images"
CONFIG = DIAGRAMS / "mermaid-black-white-config.json"
PUPPETEER_CONFIG = DIAGRAMS / "puppeteer-config.json"

FIGURE_BLOCK_RE = re.compile(
    r"(?P<caption>\*\*Figure\s+(?P<number>\d+):\s*(?P<title>[^\n]+?)\*\*)"
    r"\s*\n\s*```mermaid\n(?P<diagram>.*?)\n```",
    re.DOTALL,
)

THEME_CONFIG = {
    "theme": "base",
    "themeVariables": {
        "background": "#ffffff",
        "primaryColor": "#ffffff",
        "primaryBorderColor": "#000000",
        "primaryTextColor": "#000000",
        "secondaryColor": "#ffffff",
        "secondaryBorderColor": "#000000",
        "secondaryTextColor": "#000000",
        "tertiaryColor": "#ffffff",
        "tertiaryBorderColor": "#000000",
        "tertiaryTextColor": "#000000",
        "lineColor": "#000000",
        "textColor": "#000000",
        "mainBkg": "#ffffff",
        "nodeBorder": "#000000",
        "clusterBkg": "#ffffff",
        "clusterBorder": "#000000",
        "edgeLabelBackground": "#ffffff",
        "labelTextColor": "#000000",
        "titleColor": "#000000",
        "actorBkg": "#ffffff",
        "actorBorder": "#000000",
        "actorTextColor": "#000000",
        "activationBkgColor": "#ffffff",
        "activationBorderColor": "#000000",
        "signalColor": "#000000",
        "signalTextColor": "#000000",
        "noteBkgColor": "#ffffff",
        "noteTextColor": "#000000",
        "noteBorderColor": "#000000",
        "fontFamily": "Times New Roman, serif",
    },
    "themeCSS": """
        svg { background: #ffffff !important; }
        text, tspan, .label, .label span, .nodeLabel, .edgeLabel, .actor > text {
            fill: #000000 !important;
            color: #000000 !important;
        }
        .node rect, .node circle, .node ellipse, .node polygon, .node path,
        .cluster rect, .actor, .entityBox, .classBox, .er.entityBox {
            fill: #ffffff !important;
            stroke: #000000 !important;
        }
        .edgePath .path, .flowchart-link, .messageLine0, .messageLine1,
        .relation, .loopLine, .classGroup line, .er.relationshipLine {
            stroke: #000000 !important;
        }
        marker path, marker polygon {
            fill: #000000 !important;
            stroke: #000000 !important;
        }
        .note, .loopText, .edgeLabel rect, .labelBkg {
            fill: #ffffff !important;
            stroke: #000000 !important;
        }
    """,
    "flowchart": {"htmlLabels": False, "curve": "linear"},
    "sequence": {"mirrorActors": False, "showSequenceNumbers": False},
    "er": {"layoutDirection": "TB"},
}


def slugify(title: str) -> str:
    normalized = title.lower().replace("–", "-").replace("—", "-")
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    return normalized.strip("-")


def find_headless_browser() -> Path | None:
    cache_root = Path.home() / ".cache" / "puppeteer" / "chrome-headless-shell"
    candidates = sorted(
        cache_root.glob("win64-*/chrome-headless-shell-win64/chrome-headless-shell.exe"),
        reverse=True,
    )
    return candidates[0] if candidates else None


def render_diagram(npx_command: str, source: Path, output: Path) -> None:
    command = [
        npx_command,
        "--yes",
        "@mermaid-js/mermaid-cli",
        "-i",
        str(source),
        "-o",
        str(output),
        "-c",
        str(CONFIG),
        "-b",
        "white",
        "--scale",
        "2",
    ]
    if PUPPETEER_CONFIG.exists():
        command.extend(["-p", str(PUPPETEER_CONFIG)])

    subprocess.run(
        command,
        cwd=ROOT,
        check=True,
    )


def force_black_and_white(image_path: Path) -> None:
    image = Image.open(image_path).convert("RGBA")
    pixels = image.load()
    for x_position in range(image.width):
        for y_position in range(image.height):
            red, green, blue, alpha = pixels[x_position, y_position]
            if alpha == 0:
                pixels[x_position, y_position] = (255, 255, 255, 255)
                continue
            luminance = int((0.299 * red) + (0.587 * green) + (0.114 * blue))
            pixels[x_position, y_position] = (255, 255, 255, 255) if luminance > 245 else (0, 0, 0, 255)
    image.convert("RGB").save(image_path)


def main() -> None:
    npx_command = shutil.which("npx.cmd") or shutil.which("npx")
    if not npx_command:
        raise RuntimeError("npx was not found on PATH; Mermaid CLI cannot be executed.")

    DIAGRAMS.mkdir(parents=True, exist_ok=True)
    IMAGES.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(THEME_CONFIG, indent=2), encoding="utf-8")
    headless_browser = find_headless_browser()
    if headless_browser:
        PUPPETEER_CONFIG.write_text(
            json.dumps(
                {
                    "executablePath": str(headless_browser),
                    "args": ["--no-sandbox", "--disable-setuid-sandbox"],
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    markdown = BOOK.read_text(encoding="utf-8")
    matches = list(FIGURE_BLOCK_RE.finditer(markdown))
    if not matches:
        mermaid_files = sorted(DIAGRAMS.glob("figure-*.mmd"))
        if not mermaid_files:
            raise RuntimeError("No Mermaid figure blocks or extracted .mmd files were found.")
        rendered_files = []
        for mermaid_file in mermaid_files:
            image_file = IMAGES / f"{mermaid_file.stem}.png"
            render_diagram(npx_command, mermaid_file, image_file)
            force_black_and_white(image_file)
            rendered_files.append(image_file)
        print(f"Rendered {len(rendered_files)} Mermaid diagrams from extracted .mmd files:")
        for image_file in rendered_files:
            print(f"- {image_file.relative_to(ROOT)}")
        return

    replacements: list[tuple[str, str]] = []
    rendered_files: list[Path] = []

    for match in matches:
        figure_number = int(match.group("number"))
        title = match.group("title").strip()
        filename = f"figure-{figure_number:02d}-{slugify(title)}"
        mermaid_file = DIAGRAMS / f"{filename}.mmd"
        image_file = IMAGES / f"{filename}.png"

        mermaid_file.write_text(match.group("diagram").strip() + "\n", encoding="utf-8")
        render_diagram(npx_command, mermaid_file, image_file)
        force_black_and_white(image_file)
        rendered_files.append(image_file)

        replacement = f'{match.group("caption")}\n\n![Figure {figure_number}: {title}](images/{image_file.name})'
        replacements.append((match.group(0), replacement))

    updated_markdown = markdown
    for original, replacement in replacements:
        updated_markdown = updated_markdown.replace(original, replacement, 1)
    BOOK.write_text(updated_markdown, encoding="utf-8")

    print(f"Rendered {len(rendered_files)} Mermaid diagrams:")
    for image_file in rendered_files:
        print(f"- {image_file.relative_to(ROOT)}")


if __name__ == "__main__":
    main()