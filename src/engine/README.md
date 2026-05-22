The goban engine module contains all of the logic for playing the game. The
legacy 2D side is upstream-derived (`BoardState`, `GobanEngine`, `MoveTree`,
formats, and the OGS protocol messages it once spoke). The 3D Go research work
lives alongside it: `Topology` (the 2D/3D neighbor abstraction), `BoardState3D`
(parallel 3D board), and `Scorer3D` (Tromp-Taylor scoring). See
`../../docs/ARCHITECTURE.md`.

The code in this module **MUST** be able to be compiled and largely operate
in both browser and node environments. 
