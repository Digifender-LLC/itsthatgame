// Level plan for the offline generator. `filled` lists the capacities of the pegs that start
// full (colour k has exactly `filled[k]` rings), `empties` the capacities of extra pegs that
// start empty. `hide: [pegs, depth]` hides the bottom `depth` rings on `pegs` random pegs.
// `lock` locks a peg (index into filled ++ empties) until a (logical) colour is complete.
// `par` is the band the solver's solution length should fall in (curve tuning).
export interface Spec {
  filled: number[];
  empties: number[];
  hide?: [number, number];
  lock?: { peg: number; color: number }[];
  par: [number, number];
  exactNodes?: number;
}

const u = (n: number, cap: number): number[] => new Array<number>(n).fill(cap);

export const SPECS: Spec[] = [
  // World 1: Sunny Meadow (the basics, gentle)
  { filled: u(2, 3), empties: [3], par: [3, 6] },
  { filled: u(3, 3), empties: [3, 3], par: [5, 8] },
  { filled: u(3, 3), empties: [3, 3], par: [7, 9] },
  { filled: u(3, 4), empties: [4, 4], par: [7, 10] },
  { filled: u(4, 3), empties: [3, 3], par: [8, 11] },
  { filled: u(4, 3), empties: [3, 3], par: [10, 13] },
  { filled: u(4, 4), empties: [4, 4], par: [11, 14] },
  { filled: u(5, 3), empties: [3, 3], par: [12, 15] },
  { filled: u(5, 4), empties: [4, 4], par: [14, 17] },
  { filled: u(5, 4), empties: [4, 4], par: [16, 19] },
  // World 2: Copper Hills (pegs of different heights)
  { filled: [3, 4, 5], empties: [4, 5], par: [8, 11] },
  { filled: [4, 5, 3, 4], empties: [5, 4], par: [11, 14] },
  { filled: [3, 4, 4, 5], empties: [5, 3], par: [12, 15] },
  { filled: [4, 5, 3, 5], empties: [4, 5], par: [13, 16] },
  { filled: [3, 4, 5, 4, 3], empties: [5, 4], par: [15, 18] },
  { filled: [5, 3, 4, 5, 4], empties: [4, 5], par: [17, 20] },
  { filled: [3, 4, 5, 4, 5, 3], empties: [5, 4], par: [19, 23] },
  { filled: [4, 5, 4, 3, 5, 4], empties: [5, 4], par: [21, 25] },
  { filled: [3, 4, 5, 4, 5, 4], empties: [5, 3], par: [22, 26] },
  { filled: [5, 4, 5, 4, 3, 4, 5], empties: [5, 4], par: [25, 30] },
  // World 3: Mystery Mine (hidden rings)
  { filled: u(3, 3), empties: [3, 3], hide: [2, 1], par: [6, 9] },
  { filled: u(3, 4), empties: [4, 4], hide: [3, 2], par: [8, 11] },
  { filled: u(4, 3), empties: [3, 3], hide: [3, 1], par: [9, 12] },
  { filled: u(4, 4), empties: [4, 4], hide: [4, 2], par: [11, 15] },
  { filled: u(5, 3), empties: [3, 3], hide: [4, 1], par: [12, 15] },
  { filled: u(5, 4), empties: [4, 4], hide: [5, 2], par: [15, 19] },
  { filled: [3, 4, 5, 4], empties: [5, 4], hide: [4, 2], par: [12, 16] },
  { filled: u(5, 4), empties: [4, 4], hide: [5, 3], par: [16, 20] },
  { filled: u(6, 3), empties: [3, 3], hide: [6, 1], par: [16, 20] },
  { filled: u(6, 4), empties: [4, 4], hide: [6, 2], par: [20, 26] },
  // World 4: Locksmith's Row (a peg that opens when a colour is complete)
  { filled: u(3, 3), empties: [3, 3], lock: [{ peg: 4, color: 0 }], par: [7, 10] },
  { filled: u(4, 3), empties: [3, 3], lock: [{ peg: 5, color: 1 }], par: [9, 13] },
  { filled: u(4, 4), empties: [4, 4], lock: [{ peg: 5, color: 2 }], par: [11, 15] },
  { filled: u(5, 3), empties: [3, 3], lock: [{ peg: 6, color: 0 }], par: [12, 16] },
  { filled: u(5, 4), empties: [4, 4], lock: [{ peg: 6, color: 3 }], par: [15, 20] },
  { filled: [3, 4, 5, 4], empties: [5, 5], lock: [{ peg: 5, color: 0 }], par: [12, 16] },
  {
    filled: u(5, 4),
    empties: [4, 4, 4],
    lock: [
      { peg: 6, color: 0 },
      { peg: 7, color: 1 },
    ],
    par: [16, 21],
  },
  { filled: u(6, 3), empties: [3, 3], lock: [{ peg: 7, color: 2 }], par: [16, 21] },
  { filled: u(6, 4), empties: [4, 4], lock: [{ peg: 7, color: 4 }], par: [20, 27] },
  {
    filled: u(6, 4),
    empties: [4, 4, 4],
    lock: [
      { peg: 7, color: 0 },
      { peg: 8, color: 3 },
    ],
    par: [22, 28],
  },
  // World 5: Crystal Falls (twists combine)
  {
    filled: [3, 4, 5, 4],
    empties: [5, 4],
    hide: [3, 1],
    lock: [{ peg: 5, color: 1 }],
    par: [12, 17],
  },
  { filled: u(4, 4), empties: [4, 4], hide: [4, 2], lock: [{ peg: 5, color: 0 }], par: [12, 17] },
  { filled: [4, 5, 4, 3, 5], empties: [5, 4], hide: [4, 2], par: [18, 23] },
  { filled: u(5, 4), empties: [4, 4], hide: [5, 2], lock: [{ peg: 6, color: 2 }], par: [18, 24] },
  {
    filled: [5, 4, 5, 4, 3, 4],
    empties: [5, 4],
    hide: [4, 2],
    lock: [{ peg: 7, color: 3 }],
    par: [22, 28],
  },
  { filled: u(6, 4), empties: [4, 4], hide: [6, 2], par: [24, 30] },
  {
    filled: [3, 4, 5, 4, 5, 4],
    empties: [5, 4],
    hide: [5, 3],
    lock: [{ peg: 7, color: 0 }],
    par: [24, 30],
  },
  {
    filled: u(6, 4),
    empties: [4, 4, 4],
    hide: [6, 2],
    lock: [
      { peg: 7, color: 1 },
      { peg: 8, color: 4 },
    ],
    par: [26, 32],
  },
  { filled: [5, 4, 5, 4, 3, 4, 5], empties: [5, 4], hide: [5, 2], par: [28, 34] },
  { filled: u(6, 5), empties: [5, 5], hide: [6, 3], lock: [{ peg: 7, color: 2 }], par: [28, 35] },
  // World 6: Grand Hall (everything, tight space)
  { filled: u(5, 4), empties: [4], hide: [3, 1], par: [18, 26] },
  { filled: u(6, 3), empties: [3], hide: [4, 1], par: [18, 26] },
  { filled: [4, 5, 4, 5, 4, 5], empties: [5], hide: [4, 2], par: [24, 32] },
  { filled: u(6, 4), empties: [4, 4], hide: [5, 2], lock: [{ peg: 7, color: 0 }], par: [26, 34] },
  { filled: [5, 4, 5, 4, 3, 4], empties: [5], hide: [5, 2], par: [26, 34] },
  { filled: u(7, 4), empties: [4, 4], hide: [5, 2], par: [30, 38] },
  {
    filled: [5, 4, 5, 4, 3, 4, 5],
    empties: [5, 4],
    hide: [7, 2],
    lock: [{ peg: 8, color: 6 }],
    par: [30, 38],
  },
  {
    filled: u(7, 4),
    empties: [4, 4, 4],
    hide: [7, 2],
    lock: [
      { peg: 8, color: 0 },
      { peg: 9, color: 3 },
    ],
    par: [32, 40],
  },
  { filled: u(7, 5), empties: [5, 5], hide: [7, 3], par: [34, 42] },
  {
    filled: u(7, 5),
    empties: [5, 5, 5],
    hide: [7, 3],
    lock: [
      { peg: 8, color: 0 },
      { peg: 9, color: 2 },
    ],
    par: [36, 46],
  },
];
