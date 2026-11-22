// Ce que veut dire chaque section et chaque relevé de Suivi, en mots simples. Jamais un diagnostic.

export interface Explanation {
  question: string;
  intro: string[];
  terms?: { name: string; text: string }[];
  /** La limite à garder en tête. */
  caution?: string;
}

const URGENCE = 'appelle un médecin, ou le 15 en urgence';

export const EXPLANATIONS = {
  source: {
    question: 'Ajusté à toi ou Bague, quelle différence ?',
    intro: ['Les deux onglets partent des mêmes relevés. Seule la lecture de ta nuit et de ton pouls change.'],
    terms: [
      {
        name: 'Ajusté à toi',
        text: 'Ta nuit s’arrête à ton vrai réveil : l’heure que tu as notée, sinon celle repérée à ton pouls. Le temps resté au lit ensuite ne compte plus comme du sommeil. Le pouls vient de la ceinture quand tu la portes, de la bague sinon.'
      },
      {
        name: 'Bague',
        text: 'Les chiffres de la bague, sans correction. Ils servent à vérifier que l’appli récupère bien les mêmes valeurs que QRing.'
      }
    ]
  },
  terrier: {
    question: 'Comment lire cette scène ?',
    intro: ['C’est ta journée vue en coupe, de la veille au soir jusqu’à minuit. Glisse le doigt dessus pour lire chaque instant.'],
    terms: [
      { name: 'Le relief', text: 'Ton pouls. Plus il monte, plus ton cœur bat vite. Les lignes marquent 60, 100 et 140 battements par minute.' },
      { name: 'L’herbe', text: 'Tes pas, par demi-heure. Plus le brin est haut, plus tu as marché.' },
      { name: 'La galerie', text: 'Ta nuit. Elle s’enfonce selon la phase : éveillé tout en haut, puis paradoxal, léger et profond.' },
      { name: 'Le renard', text: 'Il dort dans ta plus longue phase de sommeil profond.' },
      { name: 'Les ronds', text: 'Tes check-ins, colorés selon ton humeur.' },
      { name: 'Les losanges', text: 'Tes moments « je le sens ».' }
    ]
  },
  nuit: {
    question: 'Comment lire ta nuit ?',
    intro: ['La frise montre tes phases dans l’ordre, du coucher au réveil. Touche un bloc pour lire sa durée et ses heures.'],
    terms: [
      { name: 'Dormies', text: 'Le temps de sommeil, sans les moments éveillés.' },
      { name: 'Au lit', text: 'Toute la durée notée par la bague, du coucher au lever, même quand tu ne dormais plus.' },
      { name: 'Réveil', text: 'Repéré quand ton pouls grimpe en fin de nuit et ne redescend pas. Tu peux le corriger si l’heure est fausse.' },
      { name: 'Éveillé', text: 'Les courts réveils. En avoir plusieurs par nuit est courant, on ne s’en souvient pas toujours.' },
      { name: 'Léger', text: 'La transition entre l’éveil et le sommeil plus profond. C’est souvent la plus grande part de la nuit.' },
      { name: 'Profond', text: 'Le moment où le corps récupère le plus. Il se concentre plutôt en début de nuit.' },
      { name: 'Paradoxal', text: 'Le cerveau est très actif, les muscles relâchés : c’est là qu’on rêve le plus. Il joue un rôle dans la mémoire et les émotions, et s’allonge en fin de nuit.' }
    ],
    caution: 'La bague devine ces phases à partir de ton pouls et de tes mouvements. Seul un examen du sommeil les mesure vraiment : regarde surtout la tendance sur plusieurs nuits.'
  },
  poulsNuit: {
    question: 'Pourquoi regarder le pouls de la nuit ?',
    intro: [
      'Pendant le sommeil, ton cœur ralentit. C’est le moment où ton pouls dépend le moins de ce que tu fais, donc le plus facile à comparer d’une nuit à l’autre.',
      'Un pouls plus haut que d’habitude peut suivre un repas tardif, de l’alcool, du stress, de la fièvre ou une nuit agitée. Une courte remontée vient souvent d’un mouvement, d’un rêve ou d’un réveil.',
      'Dans Ajusté à toi, cette courbe suit la ceinture si tu la portais, la bague sinon.'
    ]
  },
  coeur: {
    question: 'Comment lire ton pouls ?',
    intro: ['Le pouls, c’est le nombre de battements de ton cœur par minute (bpm). Il change sans arrêt selon ce que tu fais et ce que tu ressens.'],
    terms: [
      { name: 'Moyenne', text: 'Le pouls moyen de toutes les mesures du jour.' },
      { name: 'Minimum', text: 'Le plus bas du jour, souvent pendant ton sommeil.' },
      { name: 'Maximum', text: 'Le plus haut du jour, souvent pendant un effort ou une émotion.' },
      { name: 'La courbe', text: 'Dans Ajusté à toi, elle suit la ceinture quand tu la portes, avec une valeur par minute, et la bague sinon. Dans Bague, elle ne montre que les mesures de la bague, plus espacées et donc plus saccadées. Un trou veut dire que rien ne mesurait à ce moment-là.' },
      { name: 'Le pointillé', text: 'L’heure de ton réveil, dans l’onglet Ajusté à toi.' }
    ],
    caution: `La bague mesure par intervalles et peut rater un pic court. En cas de palpitations, de malaise ou de douleur dans la poitrine, ${URGENCE}.`
  },
  variabilite: {
    question: 'C’est quoi, la variabilité ?',
    intro: [
      'Ton cœur ne bat pas comme un métronome. À 60 battements par minute, un battement peut arriver après 950 millisecondes, le suivant après 1 040. La variabilité mesure ces petits écarts, en millisecondes (ms).',
      'Elle reflète en partie la façon dont ton corps passe de l’activation au repos. Elle a tendance à monter quand tu récupères bien, et à baisser avec la fatigue, le stress, l’alcool, une maladie ou une nuit courte.'
    ],
    terms: [
      { name: 'Moyenne, minimum, maximum', text: 'Les valeurs du jour. Dans Ajusté à toi, la ceinture passe avant la bague quand tu la portes : elle voit chaque battement. Ton habitude et tes signaux restent calculés sur la bague, pour comparer des jours comparables.' },
      { name: 'Faible, Normal, Bon, Excellent', text: 'Les repères de QRing, avec la part des mesures dans chacun. Ce n’est pas une norme médicale : selon l’âge et la personne, une valeur basse peut être tout à fait habituelle.' }
    ],
    caution: 'Compare-la seulement à toi-même, sur plusieurs jours. Un chiffre isolé ne dit pas grand-chose.'
  },
  oxygene: {
    question: 'À quoi correspond l’oxygène ?',
    intro: [
      'C’est la part de ton sang qui transporte de l’oxygène, qu’on appelle SpO2. Au repos, on lit le plus souvent entre 95 et 100 %.',
      'La bague l’estime avec une petite lumière à travers le doigt. Un mouvement, un doigt froid ou une bague mal placée peuvent donner une valeur trop basse.'
    ],
    terms: [
      { name: 'Moyenne, minimum, maximum', text: 'Sur la journée, en gardant le plus bas et le plus haut réels de chaque heure.' },
      { name: 'Les barres', text: 'Une barre par heure.' },
      { name: 'Les pourcentages', text: 'La part des mesures du jour dans chaque tranche.' }
    ],
    caution: `Si tu manques d’air, ne te fie pas à la bague : ${URGENCE}.`
  },
  stress: {
    question: 'Comment se calcule le stress ?',
    intro: [
      'C’est un score de 0 à 100 donné par la bague à partir de tes battements. Sa formule n’est pas publique. QRing l’appelle « Pression », mais ce n’est pas ta tension artérielle.',
      'Un effort, un café ou une forte émotion, même joyeuse, peuvent le faire monter.'
    ],
    terms: [
      { name: 'Moyenne, minimum, maximum', text: 'Les scores du jour relevés par la bague.' },
      { name: 'Détendu, Normal, Moyen, Élevé', text: 'Les tranches de QRing, avec la part des mesures du jour dans chacune.' }
    ],
    caution: 'La bague ne sait pas ce que tu ressens. Regarde ce score à côté de ton humeur, sur plusieurs jours.'
  },
  activite: {
    question: 'Comment sont comptés tes pas ?',
    intro: ['La bague compte tes pas par quart d’heure. Ils sont regroupés ici par heure.'],
    terms: [
      { name: 'Pas', text: 'Le total de la journée. Un geste de la main peut compter comme un pas, et pousser un chariot peut en faire compter moins.' },
      { name: 'Distance', text: 'L’estimation de la bague pour ces pas.' },
      { name: 'Une barre', text: 'Les pas d’une heure. Touche-la pour lire son chiffre.' }
    ]
  },
  moments: {
    question: 'Comment lire tes moments ?',
    intro: ['Quand tu lances une pause avec ta bague, ton renard garde ton pouls des 10 secondes d’avant et des 10 secondes d’après. L’idée : voir si ton corps change avant que tu le sentes.'],
    terms: [
      { name: 'Le trait du geste', text: 'L’instant où tu as tapoté. À gauche ce qui précède, à droite ce qui suit.' },
      { name: 'Tous tes moments', text: 'Chaque fine courbe est un moment, comparé à son propre pouls d’avant. La courbe épaisse en montre le milieu.' },
      { name: 'Un moment seul', text: 'Touche-le dans la liste pour voir son pouls et ce qu’on sait d’autre sur cet instant.' },
      { name: 'Variabilité avant et après', text: 'Elle apparaît quand le capteur a transmis chaque battement, ce que fait la ceinture.' }
    ],
    caution: 'À partir de 5 moments, ton renard cherche une tendance. Ce sera une piste à confirmer, pas une certitude.'
  },
  mesures: {
    question: 'Comment lire ces mesures ?',
    intro: ['Chaque ligne donne le chiffre du jour choisi, une petite courbe de tes 14 derniers jours et l’écart avec ton habitude.'],
    terms: [
      { name: 'Ton habitude', text: 'Le milieu de tes 28 jours précédents (la médiane). Une journée très inhabituelle ne la déforme donc pas. Il faut au moins 5 jours de mesures.' },
      { name: 'Toucher une ligne', text: 'Ouvre son explication et sa courbe sur 7 jours, 30 jours ou 3 mois.' }
    ]
  },
  regarder: {
    question: 'Comment ces repères sont choisis ?',
    intro: ['Ton renard compare tes 3 derniers jours à tes 4 semaines d’avant. Il attend qu’un écart dure pour le signaler, afin de ne pas s’alarmer d’une seule mauvaise nuit.'],
    terms: [
      { name: 'Ton rythme', text: 'Tes dernières nuits face à ton habitude. Une heure d’écart sur au moins 2 nuits compte comme un changement. Il regarde aussi si ton énergie ou ton humeur montent ou baissent en même temps.' },
      { name: 'Nuits courtes et élan qui monte', text: 'Ce duo mérite ton attention même quand tu te sens bien.' },
      { name: 'Les autres signaux', text: 'Sur 3 jours de suite : pouls au repos 7 battements au-dessus de ton habitude, variabilité 25 % en dessous ou stress 15 points au-dessus. Ou bien au moins 4 moments « je le sens » en 3 jours.' }
    ],
    caution: 'Ce sont des repères pour t’aider à anticiper, jamais un diagnostic. Si un changement dure ou t’inquiète, parles-en à ton médecin.'
  },
  semaines: {
    question: 'Comment lire ce tableau ?',
    intro: ['Chaque colonne est un jour, chaque ligne une mesure. Le jour le plus récent est à droite.'],
    terms: [
      { name: 'Les couleurs', text: 'Bleu : plus bas que d’habitude. Orange : plus haut. Gris : proche de ton habitude. Plus la couleur est franche, plus l’écart est grand.' },
      { name: 'Humeur et énergie', text: 'Elles viennent de tes check-ins : bleu pour bas, orange pour haut, gris pour le milieu.' },
      { name: 'Une case vide', text: 'Rien de relevé ce jour-là.' }
    ],
    caution: 'Plus haut ne veut pas dire mieux. Ce tableau montre seulement les écarts, pour repérer tes montées et tes baisses.'
  },
  ensemble: {
    question: 'Comment ces liens sont trouvés ?',
    intro: [
      'Sur tes 60 derniers jours, ton renard sépare les jours en deux groupes, par exemple tes nuits les plus courtes et les plus longues. Il compare ensuite ton humeur ou ton énergie entre les deux.',
      'Il ne montre un lien que si l’écart est net, avec au moins 10 jours de check-ins et de mesures.'
    ],
    caution: 'Un lien n’est pas une cause : une nuit courte peut suivre une humeur haute autant que la provoquer.'
  }
} satisfies Record<string, Explanation>;

export type ExplanationId = keyof typeof EXPLANATIONS;
