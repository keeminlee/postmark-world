// engine-files.mjs — the files that must TRAVEL TOGETHER for the world engine
// to run in a copied tree.
//
// Several fixtures build a throwaway repo and run `marks-fold.mjs` or
// `mark-lint.mjs` inside it as a real subprocess (which is the point: they test
// the tool a resident's crossing actually runs, not an in-process stand-in).
// Each of them used to carry its OWN hand-written list of files to copy, eight
// copies of the same fact — so the day marks-fold.mjs gained an import, six
// fixtures failed with ERR_MODULE_NOT_FOUND in a temp directory and none of
// them was wrong about anything the world does.
//
// One list, imported. Add a module to the engine's import graph and add it
// here; there is no second place that has to be found.

export const ENGINE_FILES = [
  "geometry.mjs",
  "mark-standing.mjs",
  "marks-fold.mjs",
  "determination.mjs",
  "consent.mjs",
];

// Fixtures that additionally exercise the gate or the sketchbook wall name the
// tool they are testing on top of the engine.
export const withTool = (...names) => [...ENGINE_FILES, ...names];
