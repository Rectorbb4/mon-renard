// Boîtier de poignet « Mon renard » : base, plateau et couvercle, en STL (millimètres).
// Repère : x = longueur (0 = face intérieure du côté USB), y = largeur, z = hauteur.
import fs from 'node:fs';
import jscad from '@jscad/modeling';
import stlSerializer from '@jscad/stl-serializer';

const { cuboid, roundedCuboid, cylinder } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { translate, rotateX, mirrorZ } = jscad.transforms;
const { vectorText } = jscad.text;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;
const { path2 } = jscad.geometries;

const out = process.argv[2] ?? '.';

// Dimensions intérieures et épaisseurs
const L = 62; // longueur intérieure
const W = 50; // largeur intérieure
const T = 2; // parois
const F = 2; // fond
const H = 30; // hauteur intérieure (fond → dessous du couvercle)
const TOP = F + H; // haut des parois
const LEDGE = F + 7; // dessus des appuis du plateau (7 mm pour la batterie de 6,2 mm)
const TRAY = 1.6; // épaisseur du plateau
const R = 2; // arrondi extérieur (égal à la paroi : les arrondis s'arrêtent pile sur les faces intérieures)
const CL = 0.25; // jeu d'emboîtement

// Pavé par ses coins [x0,y0,z0] → [x1,y1,z1]
const box = ([x0, y0, z0], [x1, y1, z1]) =>
  cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const rbox = ([x0, y0, z0], [x1, y1, z1], r) =>
  roundedCuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], roundRadius: r, segments: 24 });

// Pavé aux arêtes verticales arrondies (dessus et dessous plats)
function vbox([x0, y0, z0], [x1, y1, z1], r) {
  const outline = jscad.primitives.roundedRectangle({ size: [x1 - x0, y1 - y0], center: [(x0 + x1) / 2, (y0 + y1) / 2], roundRadius: r, segments: 32 });
  return translate([0, 0, z0], extrudeLinear({ height: z1 - z0 }, outline));
}

// ---------- Base ----------
const shell = vbox([-T, -T, 0], [L + T, W + T, TOP], R);
const cavity = box([0, 0, F], [L, W, TOP + 1]);

// Passants pour un bracelet de 25 mm, sur les deux grands côtés
function strapLoop(side) {
  const cx = L / 2;
  // Le passant dépasse de 5,5 mm : une fente de 3,5 mm contre la paroi, puis une barre de 2 mm
  const [y0, y1] = side < 0 ? [-T - 5.5, -T + 0.5] : [W + T - 0.5, W + T + 5.5];
  const block = vbox([cx - 15, y0, 0], [cx + 15, y1, 8], 1.5);
  const slotY0 = side < 0 ? -T - 3.5 : W + T;
  const slot = box([cx - 13, slotY0, -1], [cx + 13, slotY0 + 3.5, 9]);
  return subtract(block, slot);
}

// Appuis du plateau : un cadre de 1,6 mm le long des parois
const ledges = subtract(box([0, 0, F], [L, W, LEDGE]), box([1.6, 1.6, F - 1], [L - 1.6, W - 1.6, LEDGE + 1]));

// Butées de la batterie (52,5 × 34,5 mm), centrée
const bx0 = (L - 52.5) / 2 - 0.4;
const bx1 = (L + 52.5) / 2 + 0.4;
const by0 = (W - 34.5) / 2 - 0.4;
const by1 = (W + 34.5) / 2 + 0.4;
const stops = union(
  box([bx0 - 1.2, 14, F], [bx0, W - 14, F + 3]),
  box([bx1, 14, F], [bx1 + 1.2, W - 14, F + 3]),
  box([16, by0 - 1.2, F], [L - 16, by0, F + 3]),
  box([16, by1, F], [L - 16, by1 + 1.2, F + 3])
);

// Fente USB-C + interrupteur + voyant de charge (côté x = 0, face au bout de la carte XIAO)
const usbSlot = box([-T - 1, 5.5, 11.5], [0.5, 21.5, 28]);
// Encoches ouvertes vers le haut pour les câbles des doigts (côté x = L)
const cableNotchA = box([L - 0.5, 10.5, 20], [L + T + 1, 17.5, TOP + 1]); // pouls optique
const cableNotchB = box([L - 0.5, 34, 20], [L + T + 1, 41, TOP + 1]); // électrodes GSR
// Encoche pour l'ongle, pour soulever le couvercle
const nail = box([L / 2 - 6, -T - 1, TOP - 1.4], [L / 2 + 6, 0, TOP + 1]);

const base = subtract(
  union(subtract(shell, cavity), strapLoop(-1), strapLoop(1), ledges, stops),
  usbSlot,
  cableNotchA,
  cableNotchB,
  nail
);

// ---------- Plateau (posé sur les appuis, au-dessus de la batterie) ----------
const trayPlate = box([0.3, 0.3, LEDGE], [L - 0.3, W - 0.3, LEDGE + TRAY]);
const wireNotch = box([0, 29, LEDGE - 1], [7, 37, LEDGE + TRAY + 1]); // passage des fils de batterie
// Trou pour soulever le plateau du bout d'un doigt ou d'un tournevis (coin libre, côté USB)
const liftHole = cylinder({ radius: 3.5, height: 5, center: [8, 43, LEDGE + 1], segments: 32 });
const z1 = LEDGE + TRAY;
const rails = union(
  box([2, 26.2, z1], [56, 27.4, z1 + 2]), // sépare la carte des capteurs
  box([58.9, 2, z1], [60.1, 25, z1 + 2]) // butée : la carte reste contre la fente USB
);
const tray = union(subtract(trayPlate, wireNotch, liftHole), rails);

// ---------- Couvercle ----------
const lidPlate = vbox([-T, -T, TOP], [L + T, W + T, TOP + 2], R);
const lip = subtract(box([CL, CL, TOP - 3], [L - CL, W - CL, TOP]), box([CL + 1.2, CL + 1.2, TOP - 4], [L - CL - 1.2, W - CL - 1.2, TOP + 1]));

// Gravure « MON RENARD » sur le dessus
const strokes = vectorText({ height: 5.5, input: 'MON RENARD' });
// Chaque trait est élargi segment par segment (élargir une ligne brisée entière perd les angles aigus, comme dans le M)
const shapes = strokes.flatMap((pts) =>
  pts.slice(1).map((pt, i) => expand({ delta: 0.42, corners: 'round', segments: 8 }, path2.fromPoints({}, [pts[i], pt])))
);
// Union en 2D puis une seule extrusion : maillage plus propre
let text = extrudeLinear({ height: 1.2 }, union(shapes));
let tb = jscad.measurements.measureBoundingBox(text);
// Le texte doit tenir sur 46 mm de large
const k = 46 / (tb[1][0] - tb[0][0]);
text = jscad.transforms.scale([k, k, 1], text);
tb = jscad.measurements.measureBoundingBox(text);
console.log('texte', (tb[1][0] - tb[0][0]).toFixed(1), '×', (tb[1][1] - tb[0][1]).toFixed(1), 'mm');
text = translate([L / 2 - (tb[0][0] + tb[1][0]) / 2, W / 2 - (tb[0][1] + tb[1][1]) / 2, TOP + 2 - 0.6], text);
const lidPlain = union(lidPlate, lip);
const lid = subtract(lidPlain, text);

// ---------- Export ----------
const write = (name, solid) => {
  // Maillage fermé (jonctions en T réparées) pour que le logiciel d'impression n'ait rien à corriger
  const geom = jscad.modifiers.generalize({ snap: true, triangulate: true }, solid);
  const data = stlSerializer.serialize({ binary: true }, geom);
  fs.writeFileSync(`${out}/${name}`, Buffer.concat(data.map((d) => Buffer.from(d))));
  const bb = jscad.measurements.measureBoundingBox(geom);
  const size = bb[1].map((v, i) => (v - bb[0][i]).toFixed(1));
  console.log(name, 'taille', size.join(' × '), 'mm');
};
write('boitier-base.stl', base);
write('boitier-plateau.stl', translate([0, 0, -LEDGE], tray));
// Couvercle retourné pour l'impression : le dessus à plat sur le plateau, la lèvre vers le haut
write('boitier-couvercle.stl', translate([0, 0, TOP + 2], mirrorZ(lidPlain)));
// Variante gravée « MON RENARD » (le logiciel d'impression devra peut-être réparer de minuscules jonctions)
write('boitier-couvercle-grave.stl', translate([0, 0, TOP + 2], mirrorZ(lid)));
// Vue assemblée (pour l'aperçu seulement)
write('apercu-assemble.stl', union(base, tray));
fs.writeFileSync(`${out}/apercu-couvercle-en-place.stl`, Buffer.concat(stlSerializer.serialize({ binary: true }, lid).map((d) => Buffer.from(d))));
