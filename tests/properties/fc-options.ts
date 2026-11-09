export const fcOptions = {
  numRuns: Math.max(100, Number(process.env.FC_RUNS ?? 500)),
  seed: Number(process.env.FC_SEED ?? 20261108),
  ...(process.env.FC_PATH ? { path: process.env.FC_PATH } : {}),
};
