"""OpenTimelineIO sidecar for pipeline_shell.

  otio_cli.py version                    JSON: OTIO version and the adapters it can load
  otio_cli.py inspect FILE [--rate]      JSON summary of a timeline (tracks, clips, ranges)
  otio_cli.py convert IN OUT [--rate]    convert between formats (adapters by extension)

An EDL carries no frame rate, so reading one requires --rate. OTIO would otherwise assume 24.

Run through uv so the pinned environment is used:
  uv run --project tools/otio python tools/otio/otio_cli.py inspect cut.otio

Output is JSON on stdout. Failures print one line to stderr and exit non-zero.
"""

import argparse
import json
import sys

import opentimelineio as otio


def rt_seconds(rt):
    return None if rt is None else round(rt.to_seconds(), 6)


def time_range(tr):
    if tr is None:
        return None
    return {
        "start": rt_seconds(tr.start_time),
        "duration": rt_seconds(tr.duration),
        "rate": tr.duration.rate,
    }


def describe_item(item):
    out = {
        "kind": item.schema_name(),
        "name": item.name,
        "range": time_range(item.trimmed_range()),
    }
    if isinstance(item, otio.schema.Clip):
        ref = item.media_reference
        out["media"] = getattr(ref, "target_url", None) if ref is not None else None
    return out


def cmd_version(_args):
    adapters = sorted(otio.adapters.available_adapter_names())
    print(json.dumps({"otio": otio.__version__, "adapters": adapters}))


def read_timeline(path, rate):
    if path.lower().endswith(".edl"):
        if rate is None:
            raise SystemExit(f"error: {path} is an EDL, which has no frame rate of its own; pass --rate")
        return otio.adapters.read_from_file(path, rate=rate)
    # Only the EDL reader takes a rate; the others reject the keyword.
    return otio.adapters.read_from_file(path)


def cmd_inspect(args):
    tl = read_timeline(args.file, args.rate)
    if not isinstance(tl, otio.schema.Timeline):
        raise SystemExit(f"error: {args.file} holds a {tl.schema_name()}, not a Timeline")
    tracks = []
    for track in tl.tracks:
        tracks.append({
            "name": track.name,
            "kind": track.kind,
            "items": [describe_item(i) for i in track],
        })
    print(json.dumps({
        "name": tl.name,
        "duration": rt_seconds(tl.duration()),
        "rate": tl.duration().rate,
        "global_start": rt_seconds(tl.global_start_time),
        "tracks": tracks,
    }))


def cmd_convert(args):
    tl = read_timeline(args.input, args.rate)
    otio.adapters.write_to_file(tl, args.output)
    print(json.dumps({"input": args.input, "output": args.output}))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("version").set_defaults(fn=cmd_version)
    p = sub.add_parser("inspect")
    p.add_argument("file")
    p.add_argument("--rate", type=float, help="frame rate, required for an EDL")
    p.set_defaults(fn=cmd_inspect)
    p = sub.add_parser("convert")
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--rate", type=float, help="frame rate, required for an EDL input")
    p.set_defaults(fn=cmd_convert)
    args = parser.parse_args()
    try:
        args.fn(args)
    except SystemExit:
        raise
    except Exception as e:  # one-line error for the Node caller
        print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
