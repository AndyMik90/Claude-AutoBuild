"""Backward compatibility shim - import from analysis.analyzer instead."""

from analysis.analyzer import *  # noqa: F403
from analysis.analyzer import main

if __name__ == "__main__":
    main()
