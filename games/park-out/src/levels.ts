// Park Out levels: 60 lots in six worlds. Each level is N rows of N characters (6 or 7):
// '.' empty, '#' an immovable bollard, 'T' the hero car (exits through the gate on the
// right edge of its row), 'U' a second hero (exits through the gate on the left edge), other
// letters ordinary vehicles (length 2 or 3). `optimal` is the minimum move count found by
// breadth-first search (a move is one vehicle sliding any distance) and is the "par" shown
// to the player; levels.test.ts re-runs the solver and fails if it disagrees.
// Layouts were generated offline by a seeded hill-climbing search aiming at the par curve
// below, then kept only if the solver confirmed the exact par. They are our own.

export interface LevelDef {
  id: number;
  rows: readonly string[];
  optimal: number;
}

export const WORLDS = [
  { name: "Corner Lot", from: 1 },
  { name: "Bollard Row", from: 11 },
  { name: "Twin Gates", from: 21 },
  { name: "Big Garage", from: 31 },
  { name: "Airport Deck", from: 41 },
  { name: "Gridlock", from: 51 },
] as const;

export const LEVELS: readonly LevelDef[] = [
  { id: 1, optimal: 2, rows: ["..A...", "..A...", "..A..B", "..CCCB", ".TT..B", "......"] },
  { id: 2, optimal: 2, rows: [".AAA..", "B.TT.C", "B.DDDC", "......", "......", "......"] },
  { id: 3, optimal: 3, rows: ["AA....", ".B....", ".B....", "..C.DD", "TTCE..", "...E.."] },
  { id: 4, optimal: 4, rows: ["A...BB", "ACCCD.", "..TTDE", "....DE", "...FFE", "......"] },
  { id: 5, optimal: 5, rows: [".....A", "..BB.A", ".C....", ".CDDEE", "..TT.F", "...GGF"] },
  { id: 6, optimal: 6, rows: ["...ABB", "...ACD", "..TTCD", "..E...", "..EFF.", "......"] },
  { id: 7, optimal: 7, rows: ["AAA...", ".....B", "...TTB", ".....B", "CDDEEE", "CFFFGG"] },
  { id: 8, optimal: 8, rows: ["......", "ABB...", "A.C..D", "..CEFD", "TTCEFG", ".HHE.G"] },
  { id: 9, optimal: 9, rows: ["AABC..", "D.BCEE", "DTT.FG", "....FG", "..H.II", "..H..."] },
  { id: 10, optimal: 10, rows: [".ABBCC", "DAEEEF", "D...GF", "DTTHGF", "...HII", "..JJJ."] },
  { id: 11, optimal: 9, rows: [".AAA..", "..BC.D", "TTBCED", "..#.EF", ".G...F", ".G.#.."] },
  { id: 12, optimal: 10, rows: ["ABBCC.", "ADEEE#", "AD..F.", "GD..FH", "G.TTIH", ".#..I."] },
  { id: 13, optimal: 11, rows: ["#.#...", ".A.B..", "CA.BDD", "CEFB.G", ".EFTTG", "..FHH."] },
  { id: 14, optimal: 12, rows: ["A#.BB.", "A.CCDE", "..TTDE", "F.GGD.", "FHI...", "FHIJJ#"] },
  { id: 15, optimal: 13, rows: ["......", "...#.A", "BBBC.A", "TTDC.A", "E.D...", "E.FF.#"] },
  { id: 16, optimal: 14, rows: [".ABBB#", "#A.CDE", ".FFCDE", ".TTC..", "G..HHH", "GIIJJ."] },
  { id: 17, optimal: 14, rows: ["..ABCC", "#.AB..", "DDEEFG", "..H.FG", "TTH..G", "##...."] },
  { id: 18, optimal: 15, rows: ["..AA..", "..BBB.", "TTCD.E", ".#CD.E", "FGGHHH", "F..##."] },
  { id: 19, optimal: 16, rows: ["AAAB..", "#CCB..", "#.DBEE", ".#DFFG", "..TT.G", "....HH"] },
  { id: 20, optimal: 17, rows: [".AAA.B", "C.DEEB", "C.D#.B", "TTDFGH", "...FGH", ".#..#."] },
  { id: 21, optimal: 10, rows: [".ABBB.", ".AUU..", "CTTDE.", "C..DE.", "C..FFF", ".GG..."] },
  { id: 22, optimal: 11, rows: ["ABBB..", "ACCCDD", "...UUE", "FFG..E", "TTG..E", "..HH.."] },
  { id: 23, optimal: 12, rows: [".AABBC", "DDE..C", "TTE..C", "FGUU..", "FGHH..", "FGII.."] },
  { id: 24, optimal: 13, rows: [".AABBC", ".DTT.C", "EDFUUC", "EGF...", ".GFHHH", ".III.."] },
  { id: 25, optimal: 14, rows: ["A..BC.", "ATTBC.", "A..BUU", "DD..EE", "FFF...", "...GG."] },
  { id: 26, optimal: 15, rows: ["..#A.B", "TT.A.B", "C.DDD.", "C..EUU", "F..E..", "FGGG.."] },
  { id: 27, optimal: 16, rows: ["AAAB..", "...BCD", "EFTTCD", "EF.GUU", ".F.GHH", "#....."] },
  { id: 28, optimal: 17, rows: [".ABCCC", "DAB...", "DA..UU", "D.#EE.", "TT.F.G", ".HHF.G"] },
  { id: 29, optimal: 18, rows: ["...#..", ".AAABB", "TTCD.E", "FGCD.E", "FG..UU", "F....."] },
  { id: 30, optimal: 19, rows: [".ABB#C", ".ATT.C", "DAEFFF", "D.EGHH", "D.EGUU", "......"] },
  {
    id: 31,
    optimal: 12,
    rows: [".A..BB.", ".ACCDDE", ".FFF..E", "...GGH.", "IIJJJHK", ".TTL.HK", "...L..."],
  },
  {
    id: 32,
    optimal: 13,
    rows: [".....A.", "B.TTCA.", "B.DDCA.", "..E....", "..EFGG.", "HHEF...", ".IIF..."],
  },
  {
    id: 33,
    optimal: 14,
    rows: ["...A...", "BTTACD.", "BEE.CD.", ".FGG.D.", ".F...H.", ".FIIJH.", "KKK.JLL"],
  },
  {
    id: 34,
    optimal: 15,
    rows: ["....ABC", ".DTTABC", ".D..A.C", ".D.EEF.", ".GHHHFI", ".GJKKKI", "LLJ...."],
  },
  {
    id: 35,
    optimal: 16,
    rows: ["...ABCC", "...ABD.", ".EFGGDH", ".EFIIDH", ".EF.J..", ".TT.JKL", ".....KL"],
  },
  {
    id: 36,
    optimal: 17,
    rows: ["..AB.C.", "..AB.CD", "EEAFFGD", ".H.TTGD", ".H.....", "IH.JKKK", "I..J..."],
  },
  {
    id: 37,
    optimal: 18,
    rows: ["..A..B.", "TTAC.BD", ".E.CFFD", ".EGHHH.", "I.G....", "IJJJ..K", "......K"],
  },
  {
    id: 38,
    optimal: 19,
    rows: [".AAABBC", ".DEE..C", ".D..TTC", ".F.GG..", ".FHHI..", ".F.JIKK", "...JI.."],
  },
  {
    id: 39,
    optimal: 20,
    rows: ["AA.B...", "C..BD..", "CTTBD.E", "..FFD.E", "GGG...E", "HI.JJJ.", "HI....."],
  },
  {
    id: 40,
    optimal: 21,
    rows: [".ABBB..", ".ACCDEE", "..F.D..", "GGF.HI.", "JJF.HI.", "TT..HKL", ".....KL"],
  },
  {
    id: 41,
    optimal: 15,
    rows: ["A.BB..#", "A.CC#D.", "TT..EDF", "GGH#E.F", "..HIIIJ", "....KLJ", "MMM.KL."],
  },
  {
    id: 42,
    optimal: 16,
    rows: [".#.ABB.", "...ACC.", "DD.AEE.", "..#FFG.", "...TTGH", "...IIIH", ".JJJ.#."],
  },
  {
    id: 43,
    optimal: 17,
    rows: ["..AA.B.", "TTCDEBF", ".GCDE.F", "#GCDHHH", "...I..#", "...I...", "JJJKK.."],
  },
  {
    id: 44,
    optimal: 18,
    rows: ["#..AB..", "...ABCC", "#..AD..", "EEFFD.G", ".#.HIIG", "TT.H...", ".JJ...."],
  },
  {
    id: 45,
    optimal: 19,
    rows: ["#AB....", "CAB.DDE", "C#BFF.E", "CGG.HIE", "TTJKHI.", "LLJK#I.", "..MM..."],
  },
  {
    id: 46,
    optimal: 20,
    rows: [".A.BC..", ".A.BCDD", "EAUUCF.", "E....FG", "EHH..IG", "JJ.TTIG", "....#.."],
  },
  {
    id: 47,
    optimal: 21,
    rows: ["....A..", "BB..ACC", "...DDE.", "FFFGGEH", ".IJJTTH", ".I...UU", "KKK..##"],
  },
  {
    id: 48,
    optimal: 22,
    rows: [".AA....", "#.B.CCC", "DDB..EF", "TTB..EF", "G.HHH.F", "G.IJUU#", "KKIJ.LL"],
  },
  {
    id: 49,
    optimal: 23,
    rows: ["...A.BB", ".C.A...", "#C.DDE.", ".CFG.EH", "TTFG.IH", "J.FUUI.", "J..KK#."],
  },
  {
    id: 50,
    optimal: 24,
    rows: [".AAA#.#", ".BCDE..", ".BCDEUU", "FBGGEHI", "FJJTTHI", "F...KKK", "......."],
  },
  {
    id: 51,
    optimal: 19,
    rows: ["..A.B#.", "..A.BCC", ".DE..#.", ".DE#.FF", "GDTTH.I", "G.JJH.I", "KKKLL.I"],
  },
  {
    id: 52,
    optimal: 20,
    rows: ["..A...B", "CCADD.B", "E.TT.F.", "EGUUHFI", "EG##HFI", ".G....I", "#..JJKK"],
  },
  {
    id: 53,
    optimal: 21,
    rows: ["AA#.BCC", "....BD.", "TT...D.", "EEFFFDG", ".HHII.G", ".JKKLL#", ".J#...."],
  },
  {
    id: 54,
    optimal: 22,
    rows: ["...A.##", ".BBA.CC", "DEEE...", "DFGGGHH", ".F.TT.I", "J.UU..I", "J....#I"],
  },
  {
    id: 55,
    optimal: 23,
    rows: ["..AA...", "BC..DDD", "BCEE.FF", ".CTTGH.", "II..GH.", "JJK.GL.", "#.K.#L#"],
  },
  {
    id: 56,
    optimal: 24,
    rows: ["...#.AA", "BB#.CCC", "D..EEEF", "D.GGGHF", "DITTJHF", ".I.KJUU", ".LLK..."],
  },
  {
    id: 57,
    optimal: 24,
    rows: ["..AB.CC", "TTAB.DE", "F.GGGDE", "FHHH..E", "FIIJJ.K", "LLL...K", ".#.#.MM"],
  },
  {
    id: 58,
    optimal: 25,
    rows: [".AB...C", ".AB.UUC", "DEEE..F", "DTT.G.F", ".#.HGII", "#.JHG..", "#.JH.KK"],
  },
  {
    id: 59,
    optimal: 26,
    rows: ["AABCC#.", "..B.DD.", "TTBEFG.", "H..EFG.", "H.IIIGJ", "KKLLM.J", "#...M.J"],
  },
  {
    id: 60,
    optimal: 27,
    rows: ["..#AB..", "CCDAB..", "..DTTE.", "FGUUHE.", "FG..HE.", "FGIJKK.", "#.IJ..#"],
  },
];

const hasWalls = (r: readonly string[]) => r.some((row) => row.includes("#"));
const hasU = (r: readonly string[]) => r.some((row) => row.includes("U"));

/** Banner text on the level where a mechanic first appears (shown by the level shell). */
export function introFor(index: number): string | undefined {
  if (index === 0) return "Drag cars out of the way. Free the star car!";
  const firstWalls = LEVELS.findIndex((l) => hasWalls(l.rows));
  const firstTwin = LEVELS.findIndex((l) => hasU(l.rows));
  const firstBig = LEVELS.findIndex((l) => l.rows.length > 6);
  if (index === firstWalls) return "Bollards never move. Plan around them.";
  if (index === firstTwin) return "Two star cars, two gates. Free both!";
  if (index === firstBig) return "A bigger 7x7 lot. Same rules, more traffic.";
  return undefined;
}
