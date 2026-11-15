// Tutti v2 song library: source text, parser and helpers (pure ES module, no imports).
// SONG_SOURCE is copied byte-for-byte from PLAN-LESSONS.md section 2.8. Do not retype it.

export const SONG_SOURCE = `@song hot-cross-buns | Hot Cross Buns | English traditional | 4/4 | key 0 | bpm 80 | pickup 0
rh: E4:q D4:q C4:h | E4:q D4:q C4:h | C4:q C4:q C4:q C4:q | D4:q D4:q D4:q D4:q | E4:q D4:q C4:h

@song mary-lamb | Mary Had a Little Lamb | American traditional (1830s) | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:q D4:q C4:q D4:q | E4:q E4:q E4:h | D4:q D4:q D4:h | E4:q G4:q G4:h | E4:q D4:q C4:q D4:q | E4:q E4:q E4:q E4:q | D4:q D4:q E4:q D4:q | C4:w

@song lightly-row | Lightly Row | German traditional | 4/4 | key 0 | bpm 88 | pickup 0
rh: G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q D4:q E4:q F4:q | G4:q G4:q G4:h | G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q E4:q G4:q G4:q | E4:q E4:q E4:h | D4:q D4:q D4:q D4:q | D4:q E4:q F4:h | E4:q E4:q E4:q E4:q | E4:q F4:q G4:h | G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q E4:q G4:q G4:q | C4:w

@song au-clair | Au clair de la lune (first phrase, twice) | French traditional | 4/4 | key 0 | bpm 84 | pickup 0
rh: C4:q C4:q C4:q D4:q | E4:h D4:h | C4:q E4:q D4:q D4:q | C4:w | C4:q C4:q C4:q D4:q | E4:h D4:h | C4:q E4:q D4:q D4:q | C4:w

@song ode-to-joy | Ode to Joy (theme, simplified rhythm) | L. van Beethoven, 1824 | 4/4 | key 0 | bpm 92 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q D4:q D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q C4:q C4:h

@song aunt-rhody | Go Tell Aunt Rhody | Traditional (tune by J.-J. Rousseau, 1752) | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:h E4:q D4:q | C4:h C4:h | D4:h D4:q F4:q | E4:q D4:q C4:h | G4:h G4:q F4:q | E4:h E4:h | D4:q C4:q D4:q E4:q | C4:w

@song jingle-bells | Jingle Bells (chorus, even rhythm) | J. L. Pierpont, 1857 | 4/4 | key 0 | bpm 100 | pickup 0
rh: E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q D4:q | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:q | E4:q D4:q D4:q E4:q | D4:h G4:h | E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q D4:q | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:q | G4:q G4:q F4:q D4:q | C4:w

@song low-pipes | Low Pipes | Tutti study (original) | 4/4 | key 0 | bpm 80 | pickup 0
lh: C3:h G3:h | F3:h G3:h | C3:q C3:q G3:q G3:q | F3:h C3:h | G3:q F3:q G3:h | C3:q F3:q G3:h | G3:q G3:q F3:q F3:q | C3:w

@derive hot-cross-buns-lh | from hot-cross-buns | semis -12 | to lh
@derive ode-to-joy-lh | from ode-to-joy | semis -12 | to lh
@derive au-clair-lh | from au-clair | semis -12 | to lh

@song middle-c-meeting | Middle C Meeting | Tutti study (original) | 4/4 | key 0 | bpm 80 | pickup 0
rh: C4:q D4:q E4:q D4:q | C4:h r:h | r:w | r:h C4:h | D4:q E4:q F4:q G4:q | E4:h C4:h | r:w | C4:w
lh: r:w | r:h G3:h | F3:q E3:q D3:q C3:q | G3:h r:h | r:w | r:w | G3:q F3:q E3:q D3:q | r:w

@song ode-relay | Ode to Joy (relay: right hand, then left hand) | L. van Beethoven, 1824 | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q D4:q D4:h | r:w | r:w | r:w | r:w
lh: r:w | r:w | r:w | r:w | E3:q E3:q F3:q G3:q | G3:q F3:q E3:q D3:q | C3:q C3:q D3:q E3:q | D3:q C3:q C3:h

@song mary-relay | Mary Had a Little Lamb (relay) | American traditional (1830s) | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:q D4:q C4:q D4:q | E4:q E4:q E4:h | r:w | r:w | E4:q D4:q C4:q D4:q | E4:q E4:q E4:q E4:q | r:w | C4:w
lh: r:w | r:w | D3:q D3:q D3:h | E3:q G3:q G3:h | r:w | r:w | D3:q D3:q E3:q D3:q | r:w

@song twinkle | Twinkle, Twinkle, Little Star | French traditional (1761) | 4/4 | key 0 | bpm 92 | pickup 0
rh: C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h

@song b-in-the-middle | B in the Middle | Tutti study (original) | 4/4 | key 0 | bpm 84 | pickup 0
rh: G4:q A4:q B4:h | B4:q A4:q G4:h | G4:q B4:q A4:q G4:q | A4:h G4:h | G4:q A4:q B4:q B4:q | A4:q G4:q A4:h | B4:q A4:q G4:q A4:q | G4:w

@song london-bridge | London Bridge (even rhythm) | English traditional | 4/4 | key 0 | bpm 96 | pickup 0
rh: G4:q A4:q G4:q F4:q | E4:q F4:q G4:h | D4:q E4:q F4:h | E4:q F4:q G4:h | G4:q A4:q G4:q F4:q | E4:q F4:q G4:h | D4:h G4:h | E4:h C4:h

@derive lightly-row-g | from lightly-row | semis 7 | to rh
@derive mary-lamb-g | from mary-lamb | semis 7 | to rh

@song old-hundredth-c | Old Hundredth (Doxology), melody in C | Genevan Psalter, 1551 | 4/4 | key 0 | bpm 80 | pickup 0
rh: C5:h C5:q B4:q | A4:q G4:q C5:h | D5:h E5:h | E5:h E5:q E5:q | D5:q C5:q F5:h | E5:h D5:h | C5:h D5:q E5:q | D5:q C5:q A4:h | B4:h C5:h | G5:h E5:q C5:q | D5:q F5:q E5:h | D5:h C5:h

@song lines-and-spaces | Lines and Spaces | Tutti study (original) | 4/4 | key 0 | bpm 84 | pickup 0
rh: E4:q G4:q B4:q D5:q | F5:h D5:h | F4:q A4:q C5:q E5:q | G5:h E5:h | F5:q D5:q B4:q G4:q | E4:h G4:h | E5:q C5:q A4:q F4:q | C5:w

@song joy-to-the-world | Joy to the World (opening) | ANTIOCH, arr. L. Mason, 1836 | 4/4 | key 0 | bpm 84 | pickup 0
rh: C5:h B4:q. A4:8 | G4:h. F4:q | E4:h D4:h | C4:h. G4:q | A4:h. A4:q | B4:h. B4:q | C5:w

@song silent-night | Silent Night | F. X. Gruber, 1818 | 3/4 | key 0 | bpm 84 | pickup 0
rh: G4:q. A4:8 G4:q | E4:h. | G4:q. A4:8 G4:q | E4:h. | D5:h D5:q | B4:h. | C5:h C5:q | G4:h. | A4:h A4:q | C5:q. B4:8 A4:q | G4:q. A4:8 G4:q | E4:h. | A4:h A4:q | C5:q. B4:8 A4:q | G4:q. A4:8 G4:q | E4:h. | D5:h D5:q | F5:q. D5:8 B4:q | C5:h. | E5:h. | C5:q G4:q E4:q | G4:q. F4:8 D4:q | C4:h. | C4:h.

@song amazing-grace | Amazing Grace | NEW BRITAIN, 1829 | 3/4 | key 0 | bpm 80 | pickup 1
rh: C4:q | F4:h A4:8 F4:8 | A4:h G4:q | F4:h D4:q | C4:h C4:q | F4:h A4:8 F4:8 | A4:h G4:q | C5:h. | C5:h A4:q | C5:q. A4:8 C5:8 A4:8 | F4:h C4:q | D4:q. F4:8 F4:8 D4:8 | C4:h C4:q | F4:h A4:8 F4:8 | A4:h G4:q | F4:h. | F4:h

@derive twinkle-lh | from twinkle | semis -12 | to lh
@derive b-in-the-middle-lh | from b-in-the-middle | semis -12 | to lh
@derive london-bridge-lh | from london-bridge | semis -12 | to lh

@song walking-down | Walking Down | Tutti study (original) | 4/4 | key 0 | bpm 80 | pickup 0
lh: C3:q B2:q A2:q G2:q | A2:q B2:q C3:h | G2:q A2:q B2:q C3:q | D3:h G2:h | C3:q G2:q A2:q B2:q | C3:q D3:q E3:h | F3:q E3:q D3:q G2:q | C3:w

@derive old-hundredth-lh | from old-hundredth-c | semis -24 | to lh

@song bottom-of-the-staff | Bottom of the Staff | Tutti study (original) | 4/4 | key 0 | bpm 80 | pickup 0
lh: F2:h A2:h | C3:h A2:h | G2:q A2:q B2:q C3:q | F2:w | F2:q G2:q A2:q B2:q | C3:h F3:h | E3:q D3:q C3:q G2:q | C3:w

@song twinkle-relay | Twinkle, Twinkle (relay) | French traditional (1761) | 4/4 | key 0 | bpm 88 | pickup 0
rh: C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h | r:w | r:w | r:w | r:w | C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h
lh: r:w | r:w | r:w | r:w | G3:q G3:q F3:q F3:q | E3:q E3:q D3:h | G3:q G3:q F3:q F3:q | E3:q E3:q D3:h | r:w | r:w | r:w | r:w

@song hot-cross-buns-drone | Hot Cross Buns with a held bass | English traditional | 4/4 | key 0 | bpm 76 | pickup 0
rh: E4:q D4:q C4:h | E4:q D4:q C4:h | C4:q C4:q C4:q C4:q | D4:q D4:q D4:q D4:q | E4:q D4:q C4:h
lh: C3:w | C3:w | C3:w | G3:w | C3:w

@song ode-drone | Ode to Joy with a held bass | L. van Beethoven, 1824 | 4/4 | key 0 | bpm 80 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q D4:q D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q C4:q C4:h
lh: C3:w | G3:w | C3:w | G3:w | C3:w | G3:w | C3:w | G3:q C3:h.

@song twinkle-hands | Twinkle, Twinkle in tenths | French traditional (1761) | 4/4 | key 0 | bpm 80 | pickup 0
rh: C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h
lh: C3:w | F3:h E3:h | D3:h C3:h | B2:h C3:h | E3:h D3:h | C3:h B2:h | E3:h D3:h | C3:h B2:h | C3:w | F3:h E3:h | D3:h C3:h | B2:h C3:h

@song lightly-row-hands | Lightly Row, hands together | German traditional | 4/4 | key 0 | bpm 80 | pickup 0
rh: G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q D4:q E4:q F4:q | G4:q G4:q G4:h | G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q E4:q G4:q G4:q | C4:w
lh: E3:h C3:h | D3:h G3:h | C3:w | E3:h C3:h | E3:h C3:h | D3:h G3:h | C3:w | C3:w

@song jingle-bells-hands | Jingle Bells, hands together | J. L. Pierpont, 1857 | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q D4:q | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:q | E4:q D4:q D4:q E4:q | D4:h G4:h | E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q D4:q | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:q | G4:q G4:q F4:q D4:q | C4:w
lh: C3:w | C3:w | C3:w | C3:w | F3:w | F3:q C3:h. | G3:w | G3:w | C3:w | C3:w | C3:w | C3:w | F3:w | F3:q C3:h. | G3:w | C3:w

@song good-king-wenceslas | Good King Wenceslas | Tempus adest floridum, Piae Cantiones 1582 | 4/4 | key 1 | bpm 96 | pickup 0
rh: G4:q G4:q G4:q A4:q | G4:q G4:q D4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | G4:q G4:q G4:q A4:q | G4:q G4:q D4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | D5:q C5:q B4:q A4:q | B4:q A4:q G4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | D4:q D4:q E4:q F#4:q | G4:q G4:q A4:h | D5:q C5:q B4:q A4:q | G4:h C5:h | G4:w

@derive old-hundredth-g | from old-hundredth-c | semis -5 | to rh | key 1

@song g-major-walk | G Major Walk | Tutti study (original) | 4/4 | key 1 | bpm 80 | pickup 0
lh: G3:q F#3:q E3:q D3:q | E3:q F#3:q G3:h | G2:q A2:q B2:q C3:q | D3:h G2:h | B2:q C3:q D3:q E3:q | F#3:h G3:h | E3:q D3:q C3:q D3:q | G2:w

@derive ode-to-joy-f | from ode-to-joy | semis 5 | to rh | key -1

@song frere-jacques | Frère Jacques | French traditional | 4/4 | key -1 | bpm 92 | pickup 0
rh: F4:q G4:q A4:q F4:q | F4:q G4:q A4:q F4:q | A4:q Bb4:q C5:h | A4:q Bb4:q C5:h | C5:8 D5:8 C5:8 Bb4:8 A4:q F4:q | C5:8 D5:8 C5:8 Bb4:8 A4:q F4:q | F4:q C4:q F4:h | F4:q C4:q F4:h

@song f-major-bass | F Major Bass | Tutti study (original) | 4/4 | key -1 | bpm 80 | pickup 0
lh: F3:q G3:q A3:q Bb3:q | C4:h A3:h | Bb3:q A3:q G3:q F3:q | C3:h F3:h | F3:q A3:q C4:q A3:q | Bb3:h G3:h | A3:q Bb3:q C4:q C3:q | F3:w

@song greensleeves | Greensleeves (first strain) | English traditional, 16th century | 3/4 | key 0 | bpm 92 | pickup 1
rh: A4:q | C5:h D5:q | E5:q. F#5:8 E5:q | D5:h B4:q | G4:q. A4:8 B4:q | C5:h A4:q | A4:q. G#4:8 A4:q | B4:h G#4:q | E4:h A4:q | C5:h D5:q | E5:q. F#5:8 E5:q | D5:h B4:q | G4:q. A4:8 B4:q | C5:q. B4:8 A4:q | G#4:q. F#4:8 G#4:q | A4:h. | A4:h

@song neighbours-rh | Sharp and Flat Neighbours (right hand) | Tutti study (original) | 4/4 | key 0 | bpm 76 | pickup 0
rh: D5:q C#5:q D5:q E5:q | F5:h D5:h | G4:q Bb4:q D5:q Eb5:q | D5:w

@song neighbours-lh | Sharp and Flat Neighbours (left hand) | Tutti study (original) | 4/4 | key 0 | bpm 76 | pickup 0
lh: C3:q Eb3:q G3:q Ab3:q | G3:h C3:h | A3:q B3:q C#4:q B3:q | A3:w

@song yankee-doodle | Yankee Doodle | Traditional, 18th century | 4/4 | key 0 | bpm 96 | pickup 0
rh: C4:q C4:q D4:q E4:q | C4:q E4:q D4:q G3:q | C4:q C4:q D4:q E4:q | C4:h B3:h | C4:q C4:q D4:q E4:q | F4:q E4:q D4:q C4:q | B3:q G3:q A3:q B3:q | C4:h C4:h

@song auld-lang-syne | Auld Lang Syne (verse) | Scottish traditional | 4/4 | key 0 | bpm 88 | pickup 1
rh: G3:q | C4:q. C4:8 C4:q E4:q | D4:q. C4:8 D4:q E4:q | C4:q. C4:8 E4:q G4:q | A4:h. A4:q | G4:q. E4:8 E4:q C4:q | D4:q. C4:8 D4:q E4:q | C4:q. A3:8 A3:q G3:q | C4:h.

@derive hot-cross-buns-high-lh | from hot-cross-buns | semis 0 | to lh
@derive au-clair-high-lh | from au-clair | semis 0 | to lh

@derive joy-to-the-world-high | from joy-to-the-world | semis 12 | to rh

@song deep-pipes | Deep Pipes | Tutti study (original) | 4/4 | key 0 | bpm 72 | pickup 0
lh: C3:h G2:h | E2:h G2:h | C2:q D2:q E2:q F2:q | G2:h C2:h | C2:h E2:h | D2:h G2:h | E2:q D2:q C2:q D2:q | C2:w

@song ode-tenths | Ode to Joy in tenths | L. van Beethoven, 1824 | 4/4 | key 0 | bpm 80 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:8 D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:8 C4:h
lh: C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:w | C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:h C3:h

@song mary-chords | Mary Had a Little Lamb with chords | American traditional (1830s) | 4/4 | key 0 | bpm 80 | pickup 0
rh: E4:q D4:q C4:q D4:q | E4:q E4:q E4:h | D4:q D4:q D4:h | E4:q G4:q G4:h | E4:q D4:q C4:q D4:q | E4:q E4:q E4:q E4:q | D4:q D4:q E4:q D4:q | C4:w
lh: C3+E3+G3:w | C3+E3+G3:w | G2+B2+D3:w | C3+E3+G3:w | C3+E3+G3:w | C3+E3+G3:w | G2+B2+D3:w | C3+E3+G3:w

@song old-hundredth-duet | Old Hundredth, melody and bass | Genevan Psalter, 1551; bass line arranged for Tutti | 4/4 | key 1 | bpm 72 | pickup 0
rh: G4:h G4:q F#4:q | E4:q D4:q G4:h | A4:h B4:h | B4:h B4:q B4:q | A4:q G4:q C5:h | B4:h A4:h | G4:h A4:q B4:q | A4:q G4:q E4:h | F#4:h G4:h | D5:h B4:q G4:q | A4:q C5:q B4:h | A4:h G4:h
lh: G3:h E3:q D3:q | C3:q B2:q E3:h | D3:h G3:h | G3:h E3:q G3:q | F#3:q E3:q A2:h | D3:h D3:h | E3:h F#3:q G3:q | D3:q E3:q C3:h | D3:h G2:h | G3:h G3:q E3:q | F#3:q C3:q D3:h | D3:h G2:h

@song amazing-grace-hands | Amazing Grace, hands together | NEW BRITAIN, 1829; bass arranged for Tutti | 3/4 | key -1 | bpm 76 | pickup 1
rh: C4:q | F4:h A4:8 F4:8 | A4:h G4:q | F4:h D4:q | C4:h C4:q | F4:h A4:8 F4:8 | A4:h G4:q | C5:h. | C5:h A4:q | C5:q. A4:8 C5:8 A4:8 | F4:h C4:q | D4:q. F4:8 F4:8 D4:8 | C4:h C4:q | F4:h A4:8 F4:8 | A4:h G4:q | F4:h. | F4:h
lh: r:q | F3:h. | F3:h. | Bb3:h. | F3:h. | F3:h. | F3:h. | C3:h. | C3:h. | F3:h. | F3:h. | Bb3:h. | F3:h. | F3:h. | C3:h. | F3:h. | F3:h

@song silent-night-hands | Silent Night, hands together | F. X. Gruber, 1818; bass arranged for Tutti | 3/4 | key 0 | bpm 76 | pickup 0
rh: G4:q. A4:8 G4:q | E4:h. | G4:q. A4:8 G4:q | E4:h. | D5:h D5:q | B4:h. | C5:h C5:q | G4:h. | A4:h A4:q | C5:q. B4:8 A4:q | G4:q. A4:8 G4:q | E4:h. | A4:h A4:q | C5:q. B4:8 A4:q | G4:q. A4:8 G4:q | E4:h. | D5:h D5:q | F5:q. D5:8 B4:q | C5:h. | E5:h. | C5:q G4:q E4:q | G4:q. F4:8 D4:q | C4:h. | C4:h.
lh: C3:h. | C3:h. | C3:h. | C3:h. | G2:h. | G2:h. | C3:h. | C3:h. | F3:h. | F3:h. | C3:h. | C3:h. | F3:h. | F3:h. | C3:h. | C3:h. | G2:h. | G2:h. | C3:h. | C3:h. | C3:h. | G2:h. | C3:h. | C3:h.

@song ode-full | Ode to Joy, complete theme, hands together | L. van Beethoven, 1824; bass arranged for Tutti | 4/4 | key 0 | bpm 84 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:8 D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:8 C4:h | D4:q D4:q E4:q C4:q | D4:q E4:8 F4:8 E4:q C4:q | D4:q E4:8 F4:8 E4:q D4:q | C4:q D4:q G3:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:8 C4:h
lh: C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:w | C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:h C3:h | G2:h C3:h | G2:h C3:h | G2:h C3:q G2:q | C3:q B2:q G2:h | C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:h C3:h

@song first-noel | The First Noel (first phrase), hands together | English traditional, publ. 1823; bass arranged for Tutti | 3/4 | key 0 | bpm 84 | pickup 1
rh: E4:8 D4:8 | C4:q. D4:8 E4:8 F4:8 | G4:h A4:8 B4:8 | C5:q B4:q A4:q | G4:h A4:8 B4:8 | C5:q B4:q A4:q | G4:q A4:q B4:q | C5:q G4:q F4:q | E4:h
lh: r:q | C3:h. | C3:h. | F3:h. | C3:h. | F3:h. | G2:h. | C3:h. | C3:h

@song good-king-hands | Good King Wenceslas, hands together | Piae Cantiones 1582; bass arranged for Tutti | 4/4 | key 1 | bpm 88 | pickup 0
rh: G4:q G4:q G4:q A4:q | G4:q G4:q D4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | G4:q G4:q G4:q A4:q | G4:q G4:q D4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | D5:q C5:q B4:q A4:q | B4:q A4:q G4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | D4:q D4:q E4:q F#4:q | G4:q G4:q A4:h | D5:q C5:q B4:q A4:q | G4:h C5:h | G4:w
lh: G3:w | G3:w | C3:h. D3:q | G2:w | G3:w | G3:w | C3:h. D3:q | G2:w | G3:w | D3:h G3:h | C3:h. D3:q | G2:w | B2:h C3:q D3:q | E3:h D3:h | G3:w | E3:h C3:h | G2:w`;

// ---------------------------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------------------------

const DUR_BEATS = { w: 4, 'h.': 3, h: 2, 'q.': 1.5, q: 1, 8: 0.5 };
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const BLACK_PCS = [1, 3, 6, 8, 10];
const PITCH_RE = /^([A-G])([#b])?(-?\d)$/;
const FEATURE_ORDER = ['q', 'h', 'w', 'h.', 'q.', '8', 'rest', '3/4', 'pickup', 'key1', 'key-1', 'grand', 'together', 'chord'];

const pcOf = (m) => ((m % 12) + 12) % 12;

function fail(id, bar, msg) {
  const where = bar ? `, bar ${bar}` : '';
  throw new Error(`song "${id}"${where}: ${msg}`);
}

function parsePitch(str, id, bar) {
  const m = PITCH_RE.exec(str);
  if (!m) fail(id, bar, `bad pitch "${str}"`);
  const midi = (Number(m[3]) + 1) * 12 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { midi, accidental: m[2] || null };
}

function parseToken(tok, id, bar) {
  const cut = tok.lastIndexOf(':');
  if (cut <= 0) fail(id, bar, `bad token "${tok}"`);
  const pitchPart = tok.slice(0, cut);
  const dur = tok.slice(cut + 1);
  if (!Object.prototype.hasOwnProperty.call(DUR_BEATS, dur)) fail(id, bar, `bad duration in token "${tok}"`);
  if (pitchPart === 'r') return { midis: [], accidentals: [], dur, beats: DUR_BEATS[dur] };
  const midis = [];
  const accidentals = [];
  for (const p of pitchPart.split('+')) {
    const { midi, accidental } = parsePitch(p, id, bar);
    midis.push(midi);
    accidentals.push(accidental);
  }
  return { midis, accidentals, dur, beats: DUR_BEATS[dur] };
}

function parsePart(text, id) {
  const bars = text.split('|').map((b) => b.trim());
  return bars.map((b, i) => {
    if (!b) fail(id, i + 1, 'empty bar');
    return b.split(/\s+/).map((tok) => parseToken(tok, id, i + 1));
  });
}

const barBeats = (bar) => bar.reduce((s, t) => s + t.beats, 0);

function validateSong(song) {
  const barLen = (song.time[0] * 4) / song.time[1];
  const hands = Object.keys(song.parts);
  if (!hands.length) fail(song.id, 0, 'no parts');
  let count = null;
  for (const hand of hands) {
    const bars = song.parts[hand];
    if (count === null) count = bars.length;
    else if (bars.length !== count) fail(song.id, 0, `${hand} has ${bars.length} bars but another part has ${count}`);
    bars.forEach((bar, i) => {
      let want = barLen;
      if (song.pickup > 0 && i === 0) want = song.pickup;
      else if (song.pickup > 0 && i === bars.length - 1) want = barLen - song.pickup;
      if (barBeats(bar) !== want) fail(song.id, i + 1, `${hand} bar has ${barBeats(bar)} beats, expected ${want}`);
    });
  }
}

function numField(str, name, id) {
  const m = new RegExp(`^${name}\\s+(-?\\d+)$`).exec(str.trim());
  if (!m) fail(id, 0, `bad "${name}" field "${str}"`);
  return Number(m[1]);
}

function deriveSong(id, line) {
  const f = line.split('|').map((s) => s.trim());
  return { id, from: f[1], semisStr: f[2], to: f[3], keyStr: f[4] };
}

function transposeBar(bar, semis, key) {
  return bar.map((tok) => {
    const midis = tok.midis.map((m) => m + semis);
    const accidentals = midis.map((m) => (BLACK_PCS.includes(pcOf(m)) ? (key >= 0 ? '#' : 'b') : null));
    return { midis, accidentals, dur: tok.dur, beats: tok.beats };
  });
}

/** Parse the 2.8 song format. Throws Error naming the song id (and bar) on bad input. */
export function parseSongs(text) {
  const out = {};
  let cur = null;
  const finish = () => {
    if (cur) {
      validateSong(cur);
      out[cur.id] = cur;
    }
    cur = null;
  };
  const lines = String(text).split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].trim();
    if (!line) continue;
    if (line.startsWith('@song')) {
      finish();
      const f = line.slice(5).split('|').map((s) => s.trim());
      const id = f[0];
      if (!id) throw new Error(`line ${ln + 1}: song without an id`);
      if (out[id]) fail(id, 0, 'duplicate id');
      if (f.length !== 7) fail(id, 0, `header needs 7 fields, got ${f.length}`);
      const tm = /^(\d+)\/(\d+)$/.exec(f[3]);
      if (!tm) fail(id, 0, `bad time "${f[3]}"`);
      cur = {
        id, title: f[1], credit: f[2], original: f[2].startsWith('Tutti study'),
        time: [Number(tm[1]), Number(tm[2])],
        key: numField(f[4], 'key', id), bpm: numField(f[5], 'bpm', id), pickup: numField(f[6], 'pickup', id),
        parts: {},
      };
    } else if (line.startsWith('@derive')) {
      finish();
      const d = deriveSong(line.slice(7).split('|')[0].trim(), line.slice(7));
      const src = out[d.from.replace(/^from\s+/, '')];
      if (!src) fail(d.id, 0, `unknown source "${d.from}"`);
      const semis = numField(d.semisStr, 'semis', d.id);
      const to = d.to.replace(/^to\s+/, '');
      if (to !== 'rh' && to !== 'lh') fail(d.id, 0, `bad hand "${d.to}"`);
      const key = d.keyStr ? numField(d.keyStr, 'key', d.id) : src.key;
      const srcHands = Object.keys(src.parts);
      if (srcHands.length !== 1) fail(d.id, 0, 'derive source must have exactly one part');
      const bars = src.parts[srcHands[0]].map((bar) => transposeBar(bar, semis, key));
      const song = {
        id: d.id, title: src.title, credit: src.credit, original: src.original, time: src.time.slice(),
        key, bpm: src.bpm, pickup: src.pickup, parts: { [to]: bars }, derived: { from: src.id, semis, to },
      };
      validateSong(song);
      out[d.id] = song;
    } else if (line.startsWith('rh:') || line.startsWith('lh:')) {
      if (!cur) throw new Error(`line ${ln + 1}: part line outside a song`);
      const hand = line.slice(0, 2);
      if (cur.parts[hand]) fail(cur.id, 0, `duplicate ${hand} line`);
      cur.parts[hand] = parsePart(line.slice(3), cur.id);
    } else {
      throw new Error(`line ${ln + 1}: unrecognised line "${line.slice(0, 30)}"`);
    }
  }
  finish();
  return out;
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

export const SONGS = deepFreeze(parseSongs(SONG_SOURCE));

export function getSong(id) {
  return Object.prototype.hasOwnProperty.call(SONGS, id) ? SONGS[id] : undefined;
}

// ---------------------------------------------------------------------------------------------
// Slicing, events, pitches, features
// ---------------------------------------------------------------------------------------------

const STAFF_OF = { rh: 'treble', lh: 'bass' };

/** Song containing only bars [from, to] (1-based, inclusive). Pickup becomes 0 unless from === 1.
 *  Bar numbers and token indices in the result are relative to the slice (bar 1 = bar `from`);
 *  the result carries `sliced: { from, to }` so callers can map back. */
export function songBars(song, range) {
  const total = Math.max(...Object.values(song.parts).map((p) => p.length));
  const from = range ? range[0] : 1;
  const to = range ? range[1] : total;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > total || from > to) {
    throw new RangeError(`song "${song.id}": bad bar range [${from}, ${to}] (song has ${total} bars)`);
  }
  const parts = {};
  for (const hand of Object.keys(song.parts)) parts[hand] = song.parts[hand].slice(from - 1, to);
  const out = { ...song, parts, pickup: from === 1 ? song.pickup : 0, sliced: { from, to } };
  return out;
}

/** Events sorted by t, then lh before rh. Rests are omitted. With `bars`, everything (t, bar, idx)
 *  is relative to the sliced song. */
export function songEvents(song, { hands = 'both', bars } = {}) {
  const src = bars ? songBars(song, bars) : song;
  const events = [];
  for (const hand of ['lh', 'rh']) {
    if (!src.parts[hand] || (hands !== 'both' && hands !== hand)) continue;
    let t = 0;
    let idx = 0;
    src.parts[hand].forEach((bar, bi) => {
      for (const tok of bar) {
        if (tok.midis.length) {
          events.push({
            t, beats: tok.beats, midis: tok.midis.slice(), accidentals: tok.accidentals.slice(),
            hand, staff: STAFF_OF[hand], bar: bi + 1, idx,
          });
        }
        t += tok.beats;
        idx++;
      }
    });
  }
  // lh listed first, sort is stable, so equal t keeps lh before rh
  return events.sort((a, b) => a.t - b.t);
}

/** Unique { midi, staff } pairs: treble (rh) first, then bass (lh), ascending within each. */
export function songPitches(song) {
  const seen = new Set();
  const out = [];
  for (const hand of ['rh', 'lh']) {
    if (!song.parts[hand]) continue;
    const staff = STAFF_OF[hand];
    const ms = new Set();
    for (const bar of song.parts[hand]) for (const tok of bar) for (const m of tok.midis) ms.add(m);
    for (const midi of [...ms].sort((a, b) => a - b)) {
      const key = `${staff}:${midi}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ midi, staff });
      }
    }
  }
  return out;
}

/** Feature tags (4.2): duration codes of sounding tokens, rest, 3/4, pickup, key1/key-1, grand,
 *  together, chord. Returned in a fixed canonical order. */
export function songFeatures(song) {
  const f = new Set();
  const hands = Object.keys(song.parts);
  for (const hand of hands) {
    for (const bar of song.parts[hand]) {
      for (const tok of bar) {
        if (!tok.midis.length) f.add('rest');
        else {
          f.add(tok.dur);
          if (tok.midis.length > 1) f.add('chord');
        }
      }
    }
  }
  if (song.time[0] === 3) f.add('3/4');
  if (song.pickup > 0) f.add('pickup');
  if (song.key === 1) f.add('key1');
  if (song.key === -1) f.add('key-1');
  if (song.parts.rh && song.parts.lh) {
    f.add('grand');
    const ev = songEvents(song);
    const rh = ev.filter((e) => e.hand === 'rh');
    const lh = ev.filter((e) => e.hand === 'lh');
    outer: for (const a of rh) {
      for (const b of lh) {
        if (a.t < b.t + b.beats && b.t < a.t + a.beats) {
          f.add('together');
          break outer;
        }
      }
    }
  }
  return FEATURE_ORDER.filter((x) => f.has(x));
}
