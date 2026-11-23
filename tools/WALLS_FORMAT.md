# Wall file format (for Import walls)

Grim Toll's **Manage Walls → Import walls** reads a JSON file. You can make one three ways:

1. **Trace it yourself:** open `tools/wall-tracer.html` in a browser (double-click it), pick the map image, tune the sliders until the red lines sit on the walls, then *Download walls*. Works best on dark-background maps with lighter floors. Doors are not traced.
2. **Ask an AI (ChatGPT etc.):** upload the map image and paste the prompt below.
3. **Export** from another map in Manage Walls and import it somewhere else.

After importing, add doors by hand (Door tool) and check the result on the map.

## The format

```json
{
  "format": "grim-toll-walls",
  "version": 1,
  "walls": [
    {
      "type": "line",
      "points": [
        { "x_pct": 10.0, "y_pct": 12.5 },
        { "x_pct": 48.2, "y_pct": 12.5 },
        { "x_pct": 48.2, "y_pct": 40.0 },
        { "x_pct": 10.0, "y_pct": 40.0 },
        { "x_pct": 10.0, "y_pct": 12.5 }
      ],
      "blocksVision": true,
      "blocksMovement": true
    }
  ]
}
```

- `x_pct`, `y_pct` are **percent of the image** (0-100): `x_pct` from the left edge as a share of the width, `y_pct` from the top edge as a share of the height. Not pixels.
- `type: "line"` is a polyline of 2 or more points. To close a room, repeat the first point at the end. `"rect"` takes exactly 2 opposite corners.
- Optional: `blocksVision` and `blocksMovement` (both default `true`), and `"door": true` (with optional `"open": true`, `"secret": true`) for a short 2-point door segment.
- Bad entries are skipped and counted; a file is never half-applied.

## Prompt to give ChatGPT (with the map image attached)

> I'm attaching a dungeon map image. Produce wall data for it as JSON in exactly this format (no other text):
> `{"format":"grim-toll-walls","version":1,"walls":[{"type":"line","points":[{"x_pct":0,"y_pct":0},{"x_pct":10,"y_pct":0}],"blocksVision":true,"blocksMovement":true}]}`
> Rules: coordinates are percentages of the image width (`x_pct`) and height (`y_pct`), 0 to 100, measured from the top-left corner, with one decimal place. Trace the boundary where walkable floor meets solid rock/wall: one `line` per wall run, using as many points as needed, repeating the first point to close a loop. Keep walls on the grid lines where the map has a grid, with straight horizontal and vertical segments. Do not include doors, furniture, or decorations. Use only `line` walls.
>
> If you can, check your numbers by measuring the image's pixel width and height with code, and compute each percentage from pixel positions rather than estimating by eye.
