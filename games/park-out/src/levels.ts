// Park Out levels. Each level is six 6-character rows: '.' empty, 'T' the target vehicle
// (horizontal, must reach the right edge), other letters other vehicles (length 2 or 3).
// `optimal` is the minimum move count found by breadth-first search (a move is one vehicle
// sliding any distance); levels.test.ts re-runs the solver and fails if it disagrees.
// Layouts were produced by a seeded random search for solvable lots with chosen optimal
// lengths, then kept only if the solver confirmed them. They are our own.

export interface LevelDef {
  id: number;
  rows: readonly string[];
  optimal: number;
}

export const LEVELS: readonly LevelDef[] = [
  { id: 1, optimal: 2, rows: ["..HH.A", "FFG..A", ".DGTTA", "EDGC..", "EBBC..", ".III.."] },
  { id: 2, optimal: 3, rows: ["FBBB.A", "F..CCA", "..ETTA", "..E.DD", "...GG.", "......"] },
  { id: 3, optimal: 4, rows: ["EBBB.A", "E....A", "..DTTA", "..D.CC", "...FF.", "...GGG"] },
  { id: 4, optimal: 5, rows: [".....A", ".....A", "D..TTA", "D.CCBB", "D.....", "...EEE"] },
  { id: 5, optimal: 6, rows: ["...FFA", "G....A", "GTT..A", ".ECCBB", ".E....", "...DDD"] },
  { id: 6, optimal: 7, rows: ["II....", "..EE.A", "TT...A", "..GG.A", ".FFDBB", ".HHDCC"] },
  { id: 7, optimal: 8, rows: [".IIEEE", ".....A", "F..TTA", "F.GG.A", "...DBB", "HH.DCC"] },
  { id: 8, optimal: 9, rows: [".II...", ".....A", "F..TTA", "FEGG.A", ".E.DBB", "HH.DCC"] },
  { id: 9, optimal: 10, rows: [".....A", "HH..GA", ".TT.GA", ".ECCBB", ".E....", ".FFDDD"] },
  { id: 10, optimal: 11, rows: [".....A", "II..HA", ".TT.HA", ".ECCBB", ".E.GGG", ".FFDDD"] },
  { id: 11, optimal: 12, rows: ["..JJ.A", "KHH.GA", "KTT.GA", "IECCBB", "IE....", "IFFDDD"] },
  { id: 12, optimal: 13, rows: ["..BBB.", "..DAF.", "TTDAF.", "E...HH", "ECCIG.", "...IG."] },
  { id: 13, optimal: 14, rows: ["..D...", "G.D..A", "G..TTA", ".EEB.A", ".F.BCC", ".F.B.."] },
  { id: 14, optimal: 15, rows: ["...JJ.", "HHI..A", ".EITTA", "FEIGGA", "FC.DBB", ".C.D.."] },
  { id: 15, optimal: 16, rows: [".BBBDD", "..E.G.", "TTE.GA", "FCCHHA", "FJJ...", "...II."] },
  { id: 16, optimal: 17, rows: [".DDBBC", "..AH.C", "TTAH.C", "..AH..", ".F..EE", ".FGG.."] },
  { id: 17, optimal: 18, rows: ["..JJ.A", "HHI..A", ".EITTA", "FEI.GG", "FCCDBB", "...D.."] },
  { id: 18, optimal: 19, rows: ["..JJ.A", "HHI..A", ".EITTA", "FEIDGG", "FCCDBB", "......"] },
  { id: 19, optimal: 20, rows: ["CCC...", "DDAF.B", "TTAFIB", "EEAFIB", "G.....", "G..HH."] },
  { id: 20, optimal: 22, rows: [".DDBBC", ".EE.JC", "TTAGJC", "FFAG..", "H.AG..", "H..II."] },
  { id: 21, optimal: 24, rows: ["BBBDD.", "..E.GA", "TTE.GA", "F.HHJJ", "FIIK.C", "...K.C"] },
  { id: 22, optimal: 26, rows: [".GGGA.", "IIB.AD", "TTB..D", "K.FEED", "K.FCHH", ".JJC.."] },
  { id: 23, optimal: 29, rows: ["II.ADK", "EEEADK", ".TT.DK", "...CGG", "J.BCHH", "J.BFF."] },
  { id: 24, optimal: 33, rows: ["..IJKK", "..IJ..", "TTI.CA", "F.BBCA", "FDDG.H", "EEEG.H"] },
];
