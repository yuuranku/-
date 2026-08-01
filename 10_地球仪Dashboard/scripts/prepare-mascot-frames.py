from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


SOURCE = Path(r"C:\Users\yuuranko\Documents\白渊\吉祥物\待机动画")
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "mascot"

# Creation order is the intended seven-frame idle loop.
FRAME_NAMES = [
    "2cad2390-96fb-4699-8b73-ec4e6afeeff8.png",
    "5e3a84bc-7082-4d5c-845e-cc9d0e65c55a.png",
    "f3aef54f-8f3c-4be5-840f-f00d2c1501f9.png",
    "df75d3fb-18d3-4049-b64c-b4842fd35209.png",
    "d911f34d-3f4c-475c-93f5-8550e1b0ce3a.png",
    "0e0e5efb-f2aa-41ea-add8-0323c2efb511.png",
    "497011dc-5f79-4efc-8f8b-d46aa65f01e1.png",
]


def remove_edge_connected_white(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    ink = rgba.convert("L").point(lambda value: 255 if value < 222 else 0)
    # Close tiny breaks in the black outline before tracing the outside. This
    # prevents a white body panel from leaking into the transparent background
    # in individual animation frames.
    barrier = ink.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    barrier_pixels = barrier.load()
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_background_candidate(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return min(red, green, blue) >= 222 and barrier_pixels[x, y] == 0

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if seen[index] or not is_background_candidate(x, y):
            return
        seen[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    for y in range(height):
        row = y * width
        for x in range(width):
            if seen[row + x]:
                pixels[x, y] = (0, 0, 0, 0)

    # The binder handle has a real opening. It is enclosed by black line art,
    # so it cannot be reached by the outside trace and must be removed
    # separately. Find the large enclosed white component in the upper area.
    white = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            red, green, blue, _ = pixels[x, y]
            if min(red, green, blue) >= 222:
                white[y * width + x] = 1

    component_seen = bytearray(width * height)
    handle_seed = None
    handle_area = 0
    for y in range(int(height * 0.46)):
        for x in range(width):
            index = y * width + x
            if not white[index] or component_seen[index]:
                continue
            component_seen[index] = 1
            component_queue: deque[tuple[int, int]] = deque([(x, y)])
            component = []
            min_x = max_x = x
            min_y = max_y = y
            while component_queue:
                cx, cy = component_queue.popleft()
                component.append((cx, cy))
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        neighbor = ny * width + nx
                        if white[neighbor] and not component_seen[neighbor]:
                            component_seen[neighbor] = 1
                            component_queue.append((nx, ny))
            area = len(component)
            if (
                area > handle_area
                and max_y < height * 0.46
                and max_x - min_x > width * 0.12
                and max_y - min_y > height * 0.20
            ):
                handle_area = area
                handle_seed = component[len(component) // 2]

    if handle_seed:
        hole_seen = bytearray(width * height)
        hole_queue: deque[tuple[int, int]] = deque([handle_seed])
        hole_seen[handle_seed[1] * width + handle_seed[0]] = 1
        while hole_queue:
            x, y = hole_queue.popleft()
            red, green, blue, _ = pixels[x, y]
            if min(red, green, blue) >= 180:
                pixels[x, y] = (0, 0, 0, 0)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        neighbor = ny * width + nx
                        if not hole_seen[neighbor]:
                            nr, ng, nb, _ = pixels[nx, ny]
                            if min(nr, ng, nb) >= 180:
                                hole_seen[neighbor] = 1
                                hole_queue.append((nx, ny))

    return rgba


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(FRAME_NAMES, start=1):
        source = SOURCE / name
        target = OUTPUT / f"idle-{index:02}.png"
        remove_edge_connected_white(Image.open(source)).save(target, optimize=True)
        print(target)


if __name__ == "__main__":
    main()
