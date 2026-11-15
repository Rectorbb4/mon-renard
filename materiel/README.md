# Matériel : capteurs portés

Tout ce qu'il faut pour mesurer le pouls, la variabilité cardiaque, la conductance de la peau et les
mouvements, puis l'envoyer à l'appli. Prix relevés le 15 novembre 2026.

## Liste d'achat

| Pièce | Où | Prix |
|---|---|---|
| Ceinture cardio Coospo H6 (envoie les intervalles entre battements) | [Amazon](https://www.amazon.fr/dp/B07JPD924Y) | 26,99 € |
| Carte XIAO ESP32-C6, connecteurs soudés | [Gotronic](https://www.gotronic.fr/art-carte-xiao-esp32c6-soude-47621.htm) | 8,90 € |
| Shield Grove pour XIAO (charge la batterie) | [Gotronic](https://www.gotronic.fr/art-shield-grove-xiao-103020312-32393.htm) | 4,90 € |
| Capteur GSR Grove, électrodes de doigts fournies | [Gotronic](https://www.gotronic.fr/art-module-de-conductivite-de-la-peau-gsr-grove-101020052-21341.htm) | 9,90 € |
| Accéléromètre Grove LIS3DHTR | [Gotronic](https://www.gotronic.fr/art-accelerometre-3-axes-grove-114020121-31763.htm) | 4,20 € |
| Batterie LiPo 3,7 V 1000 mAh (52,5 × 34,5 × 6,2 mm) | [Gotronic](https://www.gotronic.fr/art-accu-lipo-3-7-vcc-1000-mah-pr523450-5813.htm) | 9,90 € |
| *Option* : capteur de pouls optique MAX30102 | [Amazon](https://www.amazon.fr/dp/B07RDJLSHY) | 6,99 € |
| *Option* : 5 câbles Grove vers fils femelles (pour le MAX30102) | [Gotronic](https://www.gotronic.fr/art-5-cables-30-cm-grove-4-contacts-femelles-19069.htm) | 4,20 € |

À prévoir aussi : un bracelet à scratch de 25 mm, un peu d'adhésif double face mousse, un câble USB-C
qui transfère les données.

## Où placer les capteurs

![Où placer les capteurs](placement-capteurs.png)

1. **Ceinture cardio** : sur la peau, juste sous les pectoraux, le capteur au milieu de la poitrine.
   Mouiller les deux électrodes avant de la mettre. Pile CR2032 : environ 300 heures.
2. **Boîtier** : sur le dessus de l'avant-bras, juste au-dessus du poignet, du côté de la main qui
   travaille le moins. Les câbles sortent côté main, la prise USB-C est côté coude. L'accéléromètre est dedans.
   Autonomie estimée : 20 à 30 heures (à mesurer), recharge en 3 heures environ.
3. **Électrodes GSR** : sur la première phalange de l'index et du majeur. Peau propre, sans crème.
4. **Pouls optique** (option) : sur la pulpe de l'annulaire, la lumière contre la peau, tenu sans serrer.

La conductance de la peau bouge beaucoup quand la main travaille : elle est faite pour des moments au calme.

## Le boîtier à imprimer en 3D (`boitier/`)

| Fichier | Pièce |
|---|---|
| `boitier-base.stl` | le boîtier, avec les passants du bracelet (66 × 65 × 32 mm) |
| `boitier-plateau.stl` | le plateau posé au-dessus de la batterie, qui porte la carte et les capteurs |
| `boitier-couvercle.stl` | le couvercle, qui s'emboîte |
| `boitier-couvercle-grave.stl` | le même couvercle avec « MON RENARD » gravé (le logiciel d'impression devra peut-être réparer de petites jonctions) |

![Boîtier en vue éclatée](boitier/apercu-eclate.png)

**Impression** : PETG de préférence (supporte mieux la sueur et la chaleur que le PLA), couches de 0,2 mm,
3 périmètres, remplissage 20 %, **sans supports**. Les fichiers sont déjà orientés : la base ouverture vers le haut,
le couvercle à l'envers (la lèvre vers le haut), le plateau à plat. Un fablab l'imprime pour quelques euros.

**Montage**
1. Souder les deux fils de la batterie sur les pastilles BAT du shield (fil rouge sur +, noir sur −).
2. Enficher la carte XIAO sur le shield.
3. Brancher le capteur GSR sur la prise A0, l'accéléromètre sur une prise I2C. Option : le MAX30102 sur
   l'autre prise I2C avec un câble à fils femelles (rouge → VIN, noir → GND, blanc → SDA, jaune → SCL).
4. Poser la batterie au fond du boîtier, entre les butées, et faire passer ses fils par l'encoche du plateau.
5. Poser le plateau. Coller le shield avec de l'adhésif mousse, poussé contre la butée : la prise USB-C,
   l'interrupteur et le voyant de charge arrivent dans la fente. Coller le capteur GSR et l'accéléromètre
   sur la bande libre, à côté.
6. Faire sortir les câbles des doigts par les deux encoches du côté opposé à la prise USB, puis emboîter
   le couvercle (l'encoche sur le côté sert à le soulever avec un ongle).

Les cotes viennent des fiches des fabricants ; la hauteur des connecteurs de la carte n'étant pas publiée,
le boîtier garde de la marge. Pour modifier le dessin : `npm install @jscad/modeling@2.12.5 @jscad/stl-serializer@2.1.20`
dans un dossier de travail, puis `node boitier.mjs <dossier de sortie>`.
