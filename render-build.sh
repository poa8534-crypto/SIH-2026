#!/usr/bin/env bash
# Render build for the NAVIS API service (see render.yaml, D-113).
#
# Runs from the project root (/opt/render/project/src). Everything this script
# writes under that directory survives into the running instance, which is the
# only reason the seed and the model cache below are worth doing at build time
# rather than on first request.
set -euo pipefail

echo "── 1/3 · CPU-only torch ────────────────────────────────────────────────"
# sentence-transformers pulls torch, and the default PyPI wheel for Linux
# bundles the CUDA runtime: ~2.5 GB of nvidia-* packages that this service can
# never use. The +cpu index is the same torch at roughly a tenth the size, and
# it is the difference between a three-minute build and a ten-minute one.
# Version pinned to match requirements.txt's floor reasoning (D-103).
pip install --no-cache-dir torch==2.2.2 \
    --index-url https://download.pytorch.org/whl/cpu

echo "── 2/3 · application dependencies ──────────────────────────────────────"
# torch is already satisfied above, so this resolves everything else against
# PyPI without pulling the CUDA build back in.
pip install --no-cache-dir -r requirements.txt

echo "── 3/3 · seed the demo database ────────────────────────────────────────"
# The SQLite file is gitignored, so a fresh instance starts with no schedule
# and no field reports. `startup()` seeds the 120-activity baseline on its own,
# but not the ingested DPRs — without this the deployed app is an empty shell.
#
# This also warms two caches into the project directory: the MiniLM weights
# (HF_HOME is set to .hfcache in render.yaml) and the activity-embedding matrix
# (.cache/embeddings). Both are what keep the first real request off a cold
# model download.
python backend/scripts/seed.py

echo "── build complete ──────────────────────────────────────────────────────"
