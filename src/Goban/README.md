

This directory contains the legacy 2D front-end `Goban` functionality, retained
from upstream. It is **not** used by the 3D sandbox (`examples/`), which renders
its own SVG slices and a three.js lattice — but it still builds and is the
reference for how the 2D renderer is structured. The `CanvasRenderer` was
removed in this fork; only the `SVGRenderer` remains.

The main class here is the `Goban` class, however because there is a lot of
code and functionality that get's bundled up into a `Goban`, we've broken up
that functionality across several files which implement different units of
functionality and we use class inheritance to stack them up to something
usable.




```mermaid
---
title: Goban functionality layers
---
classDiagram
    SVGRenderer --|> Goban : Rendering implementation
    Goban --|> OGSConnectivity : extends
    OGSConnectivity --|> InteractiveBase: extends
    InteractiveBase --|> GobanBase: extends
    
    

    class SVGRenderer {
        Final rendering functionality
    }

    class Goban {
        Full functionality exposed
        Common DOM manipulation functionality for our renderers
    }

    class OGSConnectivity {
        Encapsulates socket connection logic
    }

    class InteractiveBase {
        General purpose interactive functionality
        No DOM expectations at this layer
    }

    class GobanBase {
        Very abstract base that the Engine can use to interact with the Goban
    }
```
