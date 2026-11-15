"""Run ComfyUI as a Local Flow managed background service.

ComfyUI's optional 3D node packs can add several minutes to startup on some
Windows installations. Local Flow's built-in image and MiniMax H3 video
workflows do not use them, so this launcher skips those built-in packs while
keeping image/video nodes and installed custom nodes available. Users can
re-enable the 3D packs in Local Flow Settings.
"""

import asyncio
import faulthandler
import importlib.metadata
import logging
import os
import signal
import sys
import time
from pathlib import Path


COMFY_ROOT = Path(os.environ.get("LOCAL_FLOW_COMFY_ROOT", "")).resolve()
if not COMFY_ROOT.is_dir() or not (COMFY_ROOT / "main.py").is_file():
    raise RuntimeError("Local Flow could not locate the installed ComfyUI main.py")

os.chdir(COMFY_ROOT)
sys.path.insert(0, str(COMFY_ROOT))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("DO_NOT_TRACK", "1")
os.environ.setdefault("TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL", "1")
faulthandler.dump_traceback_later(45, file=sys.stderr, repeat=True)

# main.py's argument parser consumes sys.argv during import. Present the same
# command line that a normal ComfyUI launch would see, with main.py as argv[0].
comfy_args = sys.argv[1:]
sys.argv = [str(COMFY_ROOT / "main.py"), *comfy_args]

import comfy.options  # noqa: E402

comfy.options.enable_args_parsing()
from comfy.cli_args import args  # noqa: E402

if (
    os.name == "nt"
    and args.cuda_device is None
    and args.default_device is None
    and os.environ.get("CUDA_VISIBLE_DEVICES") is None
):
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"
    logging.warning(
        "On Windows Local Flow is using ComfyUI's default single-GPU mode. "
        "Use --cuda-device all in Settings to override it."
    )
if args.default_device is not None and args.cuda_device != "all":
    devices = list(range(32))
    devices.remove(args.default_device)
    devices.insert(0, args.default_device)
    os.environ["CUDA_VISIBLE_DEVICES"] = ",".join(map(str, devices))
    os.environ["HIP_VISIBLE_DEVICES"] = os.environ["CUDA_VISIBLE_DEVICES"]
if args.cuda_device not in (None, "all"):
    os.environ["CUDA_VISIBLE_DEVICES"] = str(args.cuda_device)

import cuda_malloc  # noqa: E402
import main  # noqa: E402
import nodes  # noqa: E402

# ComfyUI's cuda_malloc_warning helper resolves this global when the server
# starts. A normal `python main.py` launch imports it in main's __main__ block.
main.cuda_malloc = cuda_malloc

_load_custom_node = nodes.load_custom_node
OPTIONAL_3D_NODES = {
    "nodes_trellis2.py",
    "nodes_mesh_postprocess.py",
    "nodes_mesh_io.py",
    "nodes_camera.py",
    "nodes_camera_angle.py",
    "nodes_save_3d.py",
    "nodes_gaussian_splat.py",
    "nodes_triposplat.py",
    "nodes_depth_anything_3.py",
    "nodes_moge.py",
    "nodes_sam3d_body.py",
    "nodes_hunyuan3d.py",
    "nodes_stable3d.py",
    "nodes_load_3d.py",
}
if os.environ.get("LOCAL_FLOW_COMFY_LOAD_3D") == "1":
    OPTIONAL_3D_NODES.clear()


async def _load_custom_node_without_optional_trellis(module_path, *args, **kwargs):
    module_name = Path(module_path).name.casefold()
    module_parent = kwargs.get("module_parent", "custom_nodes")
    if module_parent == "comfy_extras" and module_name in OPTIONAL_3D_NODES:
        logging.info(
            "[Local Flow] Skipping optional ComfyUI 3D node package: %s",
            module_name,
        )
        return True
    started = time.monotonic()
    logging.info("[Local Flow] Loading ComfyUI node package: %s", module_name)
    try:
        return await _load_custom_node(module_path, *args, **kwargs)
    finally:
        logging.info(
            "[Local Flow] Finished ComfyUI node package: %s (%.1fs)",
            module_name,
            time.monotonic() - started,
        )


nodes.load_custom_node = _load_custom_node_without_optional_trellis


def main_entry():
    logging.info("Python version: %s", sys.version)
    try:
        import comfyui_version

        logging.info("ComfyUI version: %s", comfyui_version.__version__)
    except Exception:
        pass
    for package in ("comfy-aimdo", "comfy-kitchen"):
        try:
            logging.info("%s version: %s", package, importlib.metadata.version(package))
        except Exception:
            pass

    event_loop, prompt_server, start_all = main.start_comfyui()
    try:
        startup = start_all()
        main.app.logger.print_startup_warnings()
        event_loop.run_until_complete(startup)
        faulthandler.cancel_dump_traceback_later()
    except KeyboardInterrupt:
        logging.info("\nStopped server")
    finally:
        prompt_server.asset_manager.shutdown()


if __name__ == "__main__":
    main_entry()
