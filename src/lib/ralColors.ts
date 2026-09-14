// Palette RAL Classic — 215 teintes
export const RAL_COLORS: Record<string, { hex: string; dark: boolean; white?: boolean }> = {
  '1000':{ hex:'#CDB77F', dark:false }, '1001':{ hex:'#C8A86B', dark:false }, '1002':{ hex:'#C99840', dark:false }, '1003':{ hex:'#F9A800', dark:false },
  '1004':{ hex:'#E49300', dark:false }, '1005':{ hex:'#CB7B28', dark:true  }, '1006':{ hex:'#E2781E', dark:true  }, '1007':{ hex:'#E7831A', dark:true  },
  '1011':{ hex:'#AF7C36', dark:true  }, '1012':{ hex:'#E0C12A', dark:false }, '1013':{ hex:'#EDE3CE', dark:false }, '1014':{ hex:'#DED09E', dark:false },
  '1015':{ hex:'#E6D2AE', dark:false }, '1016':{ hex:'#EACC00', dark:false }, '1017':{ hex:'#F4A100', dark:false }, '1018':{ hex:'#F4DC00', dark:false },
  '1019':{ hex:'#9E8E78', dark:true  }, '1020':{ hex:'#BAAC74', dark:false }, '1021':{ hex:'#F4CA00', dark:false }, '1023':{ hex:'#FFC000', dark:false },
  '1024':{ hex:'#B89050', dark:true  }, '1026':{ hex:'#FFFF00', dark:false }, '1027':{ hex:'#A88332', dark:true  }, '1028':{ hex:'#FF9B00', dark:false },
  '1032':{ hex:'#E4AC00', dark:false }, '1033':{ hex:'#F4800A', dark:true  }, '1034':{ hex:'#EBA850', dark:false }, '1035':{ hex:'#9E8850', dark:true  },
  '1036':{ hex:'#786030', dark:true  }, '1037':{ hex:'#E88000', dark:true  },
  '2000':{ hex:'#D46800', dark:true  }, '2001':{ hex:'#BE3C00', dark:true  }, '2002':{ hex:'#CB2A00', dark:true  }, '2003':{ hex:'#E45C20', dark:true  },
  '2004':{ hex:'#E44800', dark:true  }, '2005':{ hex:'#FF2800', dark:true  }, '2007':{ hex:'#FFA000', dark:false }, '2008':{ hex:'#D04010', dark:true  },
  '2009':{ hex:'#E04400', dark:true  }, '2010':{ hex:'#D05828', dark:true  }, '2011':{ hex:'#E06000', dark:true  }, '2012':{ hex:'#CC5434', dark:true  },
  '2013':{ hex:'#983428', dark:true  },
  '3000':{ hex:'#AA2010', dark:true  }, '3001':{ hex:'#9C1C10', dark:true  }, '3002':{ hex:'#9C1C18', dark:true  }, '3003':{ hex:'#801010', dark:true  },
  '3004':{ hex:'#701014', dark:true  }, '3005':{ hex:'#5C1014', dark:true  }, '3007':{ hex:'#3C0C10', dark:true  }, '3009':{ hex:'#6C3028', dark:true  },
  '3011':{ hex:'#782020', dark:true  }, '3012':{ hex:'#C49080', dark:true  }, '3013':{ hex:'#902820', dark:true  }, '3014':{ hex:'#C48080', dark:true  },
  '3015':{ hex:'#D4A0A0', dark:false }, '3016':{ hex:'#A03428', dark:true  }, '3017':{ hex:'#C44050', dark:true  }, '3018':{ hex:'#C43050', dark:true  },
  '3020':{ hex:'#CC0000', dark:true  }, '3022':{ hex:'#D46858', dark:true  }, '3024':{ hex:'#FF2020', dark:true  }, '3026':{ hex:'#FF2020', dark:true  },
  '3027':{ hex:'#AC1440', dark:true  }, '3028':{ hex:'#CC2020', dark:true  }, '3031':{ hex:'#AC3030', dark:true  }, '3032':{ hex:'#701414', dark:true  },
  '3033':{ hex:'#C44030', dark:true  },
  '4001':{ hex:'#886090', dark:true  }, '4002':{ hex:'#943054', dark:true  }, '4003':{ hex:'#CE4090', dark:true  }, '4004':{ hex:'#641040', dark:true  },
  '4005':{ hex:'#8060A0', dark:true  }, '4006':{ hex:'#982070', dark:true  }, '4007':{ hex:'#4C1048', dark:true  }, '4008':{ hex:'#803080', dark:true  },
  '4009':{ hex:'#A07898', dark:true  }, '4010':{ hex:'#BE3090', dark:true  }, '4011':{ hex:'#806898', dark:true  }, '4012':{ hex:'#6C6080', dark:true  },
  '5000':{ hex:'#2E4D8C', dark:true  }, '5001':{ hex:'#1C4068', dark:true  }, '5002':{ hex:'#1428A0', dark:true  }, '5003':{ hex:'#1E3060', dark:true  },
  '5004':{ hex:'#141828', dark:true  }, '5005':{ hex:'#1040A0', dark:true  }, '5007':{ hex:'#3C6090', dark:true  }, '5008':{ hex:'#243040', dark:true  },
  '5009':{ hex:'#285080', dark:true  }, '5010':{ hex:'#0C4080', dark:true  }, '5011':{ hex:'#1C2444', dark:true  }, '5012':{ hex:'#3478B8', dark:true  },
  '5013':{ hex:'#1C2C60', dark:true  }, '5014':{ hex:'#6078A8', dark:true  }, '5015':{ hex:'#1470C0', dark:true  }, '5017':{ hex:'#0858A0', dark:true  },
  '5018':{ hex:'#3C8888', dark:true  }, '5019':{ hex:'#1C5C90', dark:true  }, '5020':{ hex:'#1C3840', dark:true  }, '5021':{ hex:'#287880', dark:true  },
  '5022':{ hex:'#201C60', dark:true  }, '5023':{ hex:'#3C5888', dark:true  }, '5024':{ hex:'#6090B0', dark:true  }, '5025':{ hex:'#2C6878', dark:true  },
  '5026':{ hex:'#10304C', dark:true  },
  '6000':{ hex:'#3C7060', dark:true  }, '6001':{ hex:'#286030', dark:true  }, '6002':{ hex:'#286428', dark:true  }, '6003':{ hex:'#4C5840', dark:true  },
  '6004':{ hex:'#1C4440', dark:true  }, '6005':{ hex:'#1C3C28', dark:true  }, '6006':{ hex:'#303828', dark:true  }, '6007':{ hex:'#28361C', dark:true  },
  '6008':{ hex:'#30301C', dark:true  }, '6009':{ hex:'#243018', dark:true  }, '6010':{ hex:'#447828', dark:true  }, '6011':{ hex:'#6C8C50', dark:true  },
  '6012':{ hex:'#303C34', dark:true  }, '6013':{ hex:'#8C8C60', dark:true  }, '6014':{ hex:'#484840', dark:true  }, '6015':{ hex:'#3C3C30', dark:true  },
  '6016':{ hex:'#1C7048', dark:true  }, '6017':{ hex:'#487830', dark:true  }, '6018':{ hex:'#5C9030', dark:true  }, '6019':{ hex:'#C0D8A8', dark:false },
  '6020':{ hex:'#304428', dark:true  }, '6021':{ hex:'#7C9868', dark:true  }, '6022':{ hex:'#3C3018', dark:true  }, '6024':{ hex:'#308050', dark:true  },
  '6025':{ hex:'#487038', dark:true  }, '6026':{ hex:'#1C5840', dark:true  }, '6027':{ hex:'#80C8C0', dark:false }, '6028':{ hex:'#2C5430', dark:true  },
  '6029':{ hex:'#1C7830', dark:true  }, '6032':{ hex:'#287850', dark:true  }, '6033':{ hex:'#408880', dark:true  }, '6034':{ hex:'#80C0B8', dark:false },
  '6035':{ hex:'#1C4A20', dark:true  }, '6036':{ hex:'#1C5048', dark:true  }, '6037':{ hex:'#008040', dark:true  }, '6038':{ hex:'#00C840', dark:false },
  '7000':{ hex:'#788C90', dark:true  }, '7001':{ hex:'#8C9898', dark:false }, '7002':{ hex:'#808070', dark:true  }, '7003':{ hex:'#787868', dark:true  },
  '7004':{ hex:'#989898', dark:false }, '7005':{ hex:'#686C64', dark:true  }, '7006':{ hex:'#747060', dark:true  }, '7008':{ hex:'#6C6040', dark:true  },
  '7009':{ hex:'#5C6058', dark:true  }, '7010':{ hex:'#585C54', dark:true  }, '7011':{ hex:'#505860', dark:true  }, '7012':{ hex:'#585C60', dark:true  },
  '7013':{ hex:'#585448', dark:true  }, '7015':{ hex:'#50545C', dark:true  }, '7016':{ hex:'#383E44', dark:true  }, '7021':{ hex:'#2C3038', dark:true  },
  '7022':{ hex:'#4C4C48', dark:true  }, '7023':{ hex:'#808078', dark:true  }, '7024':{ hex:'#484C54', dark:true  }, '7026':{ hex:'#384044', dark:true  },
  '7030':{ hex:'#989080', dark:true  }, '7031':{ hex:'#606870', dark:true  }, '7032':{ hex:'#B8B4A0', dark:false }, '7033':{ hex:'#888C7C', dark:true  },
  '7034':{ hex:'#908C70', dark:true  }, '7035':{ hex:'#C8C8C0', dark:false }, '7036':{ hex:'#A0949C', dark:false }, '7037':{ hex:'#7C7C7C', dark:true  },
  '7038':{ hex:'#B4B4A8', dark:false }, '7039':{ hex:'#6C6860', dark:true  }, '7040':{ hex:'#9898A4', dark:false }, '7042':{ hex:'#8C8C8C', dark:true  },
  '7043':{ hex:'#545454', dark:true  }, '7044':{ hex:'#C0BCB0', dark:false }, '7045':{ hex:'#909090', dark:true  }, '7046':{ hex:'#808088', dark:true  },
  '7047':{ hex:'#C8C8C8', dark:false }, '7048':{ hex:'#888078', dark:true  },
  '8000':{ hex:'#886040', dark:true  }, '8001':{ hex:'#985028', dark:true  }, '8002':{ hex:'#784848', dark:true  }, '8003':{ hex:'#7C4820', dark:true  },
  '8004':{ hex:'#8C4830', dark:true  }, '8007':{ hex:'#6C4028', dark:true  }, '8008':{ hex:'#7C5030', dark:true  }, '8009':{ hex:'#604034', dark:true  },
  '8010':{ hex:'#5C3828', dark:true  }, '8011':{ hex:'#4C2C20', dark:true  }, '8012':{ hex:'#642424', dark:true  }, '8014':{ hex:'#402820', dark:true  },
  '8015':{ hex:'#602420', dark:true  }, '8016':{ hex:'#482420', dark:true  }, '8017':{ hex:'#402020', dark:true  }, '8019':{ hex:'#382C28', dark:true  },
  '8022':{ hex:'#201818', dark:true  }, '8023':{ hex:'#A04820', dark:true  }, '8024':{ hex:'#7C5038', dark:true  }, '8025':{ hex:'#7C6050', dark:true  },
  '8028':{ hex:'#483828', dark:true  }, '8029':{ hex:'#7C3C28', dark:true  },
  '9001':{ hex:'#ECDCCC', dark:false, white:true }, '9002':{ hex:'#E0D8D0', dark:false }, '9003':{ hex:'#F0EEE8', dark:false, white:true }, '9004':{ hex:'#2C2C2C', dark:true },
  '9005':{ hex:'#0C0C0C', dark:true  }, '9006':{ hex:'#A0A0A0', dark:false }, '9007':{ hex:'#888888', dark:true  }, '9010':{ hex:'#F4F0E8', dark:false, white:true },
  '9011':{ hex:'#1C1C1C', dark:true  }, '9016':{ hex:'#F4F4F0', dark:false, white:true }, '9017':{ hex:'#1C1C1C', dark:true  }, '9018':{ hex:'#D8D8D0', dark:false },
  '9022':{ hex:'#909088', dark:true  }, '9023':{ hex:'#808080', dark:true  },
};

// ── QuartzColor → RAL : correspondances connues ───────────────────────────
// Clé = numéro RAL, valeur = code QuartzColor associé (affiché sur le swatch)
const RAL_QUARTZ: Record<string, string> = {
  '1015': '326',
  '1018': '321',
  '1023': '319',
  '3001': '605',
  '3020': '606',
  '5015': '479',
  '5017': '466',
  '6001': '709',
  '7035': '232',
  '7037': '222',
  '7040': '2012',
  '7043': '280',
  '9005': '990',
};

// ── QuartzColor — codes sans équivalent RAL standard ──────────────────────
// Les couleurs qui ont un RAL explicite dans leur label (ex: "232 (RAL 7035)")
// sont gérées automatiquement via le pattern "RAL XXXX" ci-dessous.
// Seules les couleurs SANS RAL (ou dont le code numérique entrerait en conflit
// avec un RAL existant) sont listées ici avec leur hexadécimal approximatif.
const QUARTZ_COLORS: Record<string, { hex: string; dark: boolean }> = {
  '340': { hex: '#D4A847', dark: false }, // Pastel Yellow
  '452': { hex: '#8AAFC0', dark: false }, // Pastel Blue
  '637': { hex: '#B54020', dark: true  }, // Tile Red
  '740': { hex: '#7A9468', dark: true  }, // Pastel Green
  '754': { hex: '#2E5C28', dark: true  }, // Forest Green
};

/**
 * Retourne les infos couleur d'un label de variante.
 *
 * Priorité :
 *  1. Pattern explicite "RAL XXXX" → évite les faux-positifs (ex: "2012 (RAL 7040)"
 *     doit retourner gris 7040, pas orange 2012)
 *  2. Code QuartzColor en début de label (3-4 chiffres) → QUARTZ_COLORS
 *  3. Fallback : premier nombre à 4 chiffres → RAL_COLORS (ancien comportement)
 */
export function getRalInfo(text: string): { hex: string; dark: boolean; white?: boolean; num: string; quartz?: string } | undefined {
  // 1. Motif explicite "RAL XXXX"
  const ralMatch = text.match(/RAL\s*(\d{4})/i);
  if (ralMatch) {
    const c = RAL_COLORS[ralMatch[1]];
    if (c) return { ...c, num: ralMatch[1], quartz: RAL_QUARTZ[ralMatch[1]] };
  }
  // 2. Code QuartzColor en début de label (ex: "340 (Pastel Yellow)")
  const leadMatch = text.match(/^(\d{3,4})/);
  if (leadMatch && QUARTZ_COLORS[leadMatch[1]]) {
    const c = QUARTZ_COLORS[leadMatch[1]];
    return { ...c, num: leadMatch[1] };
  }
  // 3. Fallback : tout nombre à 4 chiffres → RAL
  const m = text.match(/(\d{4})/);
  if (!m) return undefined;
  const c = RAL_COLORS[m[1]];
  if (!c) return undefined;
  return { ...c, num: m[1], quartz: RAL_QUARTZ[m[1]] };
}

// ── Noms français des teintes RAL Classic ─────────────────────────────────
const RAL_NOMS: Record<string, string> = {
  '1000':'Beige vert', '1001':'Beige', '1002':'Jaune sable', '1003':'Jaune de sécurité', '1004':'Jaune or',
  '1005':'Jaune miel', '1006':'Jaune maïs', '1007':'Jaune narcisse', '1011':'Beige brun', '1012':'Jaune citron',
  '1013':'Blanc perlé', '1014':'Ivoire', '1015':'Ivoire clair', '1016':'Jaune soufre', '1017':'Jaune safran',
  '1018':'Jaune zinc', '1019':'Beige gris', '1020':'Jaune olive', '1021':'Jaune colza', '1023':'Jaune signalisation',
  '1024':'Jaune ocre', '1026':'Jaune brillant', '1027':'Jaune curry', '1028':'Jaune melon', '1032':'Jaune genêt',
  '1033':'Jaune dahlia', '1034':'Jaune pastel', '1035':'Beige nacré', '1036':'Or nacré', '1037':'Jaune soleil',
  '2000':'Orangé jaune', '2001':'Orangé rouge', '2002':'Orangé sang', '2003':'Orangé pastel', '2004':'Orangé pur',
  '2005':'Orangé brillant', '2007':'Orangé clair brillant', '2008':'Orangé rouge clair', '2009':'Orangé signalisation',
  '2010':'Orangé de sécurité', '2011':'Orangé foncé', '2012':'Orangé saumon', '2013':'Orangé nacré',
  '3000':'Rouge feu', '3001':'Rouge de sécurité', '3002':'Rouge carmin', '3003':'Rouge rubis', '3004':'Rouge pourpre',
  '3005':'Rouge vin', '3007':'Rouge noir', '3009':'Rouge oxyde', '3011':'Rouge brun', '3012':'Rouge beige',
  '3013':'Rouge tomate', '3014':'Vieux rose', '3015':'Rose clair', '3016':'Rouge corail', '3017':'Rosé',
  '3018':'Rouge fraise', '3020':'Rouge signalisation', '3022':'Rouge saumon', '3024':'Rouge brillant',
  '3026':'Rouge clair brillant', '3027':'Rouge framboise', '3028':'Rouge pur', '3031':'Rouge oriental',
  '3032':'Rouge rubis nacré', '3033':'Rose nacré',
  '4001':'Lilas rouge', '4002':'Violet rouge', '4003':'Violet bruyère', '4004':'Violet bordeaux', '4005':'Lilas bleu',
  '4006':'Pourpre signalisation', '4007':'Violet pourpre', '4008':'Violet de sécurité', '4009':'Violet pastel',
  '4010':'Télémagenta', '4011':'Violet nacré', '4012':'Mûre nacré',
  '5000':'Bleu violet', '5001':'Bleu vert', '5002':'Bleu outremer', '5003':'Bleu saphir', '5004':'Bleu noir',
  '5005':'Bleu de sécurité', '5007':'Bleu brillant', '5008':'Bleu gris', '5009':'Bleu azur', '5010':'Bleu gentiane',
  '5011':'Bleu acier', '5012':'Bleu clair', '5013':'Bleu cobalt', '5014':'Bleu pigeon', '5015':'Bleu ciel',
  '5017':'Bleu signalisation', '5018':'Bleu turquoise', '5019':'Bleu capri', '5020':'Bleu océan', '5021':"Bleu d'eau",
  '5022':'Bleu nocturne', '5023':'Bleu distant', '5024':'Bleu pastel', '5025':'Gentiane nacré', '5026':'Bleu nuit nacré',
  '6000':'Vert patine', '6001':'Vert émeraude', '6002':'Vert feuillage', '6003':'Vert olive', '6004':'Vert bleu',
  '6005':'Vert mousse', '6006':'Olive gris', '6007':'Vert bouteille', '6008':'Vert brun', '6009':'Vert sapin',
  '6010':'Vert herbe', '6011':'Vert réséda', '6012':'Vert noir', '6013':'Vert jonc', '6014':'Olive jaune',
  '6015':'Olive noir', '6016':'Vert turquoise', '6017':'Vert mai', '6018':'Vert jaune', '6019':'Vert blanc',
  '6020':'Vert oxyde chromique', '6021':'Vert pâle', '6022':'Olive brun', '6024':'Vert signalisation',
  '6025':'Vert fougère', '6026':'Vert opale', '6027':'Vert clair', '6028':'Vert pin', '6029':'Vert menthe',
  '6032':'Vert de sécurité', '6033':'Turquoise menthe', '6034':'Turquoise pastel', '6035':'Vert nacré',
  '6036':'Vert opal nacré', '6037':'Vert pur', '6038':'Vert brillant',
  '7000':'Gris petit-gris', '7001':'Gris argent', '7002':'Gris olive', '7003':'Gris mousse', '7004':'Gris de sécurité',
  '7005':'Gris souris', '7006':'Gris beige', '7008':'Gris kaki', '7009':'Gris vert', '7010':'Gris tente',
  '7011':'Gris fer', '7012':'Gris basalte', '7013':'Gris brun', '7015':'Gris ardoise', '7016':'Gris anthracite',
  '7021':'Gris noir', '7022':"Gris terre d'ombre", '7023':'Gris béton', '7024':'Gris graphite', '7026':'Gris granit',
  '7030':'Gris pierre', '7031':'Gris bleu', '7032':'Gris silex', '7033':'Gris ciment', '7034':'Gris jaune',
  '7035':'Gris clair', '7036':'Gris platine', '7037':'Gris poussière', '7038':'Gris agate', '7039':'Gris quartz',
  '7040':'Gris fenêtre', '7042':'Gris signalisation A', '7043':'Gris signalisation B', '7044':'Gris soie',
  '7045':'Télégris 1', '7046':'Télégris 2', '7047':'Télégris 4', '7048':'Gris souris nacré',
  '8000':'Brun vert', '8001':'Brun terre de Sienne', '8002':'Brun de sécurité', '8003':'Brun argile',
  '8004':'Brun cuivré', '8007':'Brun fauve', '8008':'Brun olive', '8011':'Brun noisette', '8012':'Brun rouge',
  '8014':'Brun sépia', '8015':'Marron', '8016':'Brun acajou', '8017':'Brun chocolat', '8019':'Brun gris',
  '8022':'Brun noir', '8023':'Brun orangé', '8024':'Brun beige', '8025':'Brun pâle', '8028':'Brun terre',
  '8029':'Cuivre nacré',
  '9001':'Blanc crème', '9002':'Blanc gris', '9003':'Blanc de sécurité', '9004':'Noir de sécurité', '9005':'Noir foncé',
  '9006':'Aluminium blanc', '9007':'Aluminium gris', '9010':'Blanc pur', '9011':'Noir graphite',
  '9016':'Blanc signalisation', '9017':'Noir signalisation', '9018':'Blanc papyrus', '9022':'Gris clair nacré',
  '9023':'Gris foncé nacré',
};

/**
 * Nomme en toutes lettres la teinte d'un libellé de variante.
 *
 * Le sélecteur dit « RAL 7042 » ; le chantier, lui, commande du « gris
 * signalisation A ». Deux teintes voisines se confondent vite sur un code à
 * quatre chiffres, beaucoup moins sur un nom.
 *
 * Plus strict que `getRalInfo` : on ne nomme que ce qui est EXPLICITEMENT une
 * teinte RAL (« RAL 7042 », ou un libellé fait des seuls quatre chiffres).
 * Un « seau de 1000 ml » ne doit pas devenir du « Beige vert ». Un code Quartz
 * sans RAL (« 340 (Pastel Yellow) ») porte déjà son nom : il est rendu tel
 * quel. Un numéro RAL absent de la table n'est pas nommé — on ne devine pas.
 */
export function libelleTeinte(label: string): string | undefined {
  const texte = String(label || '').trim();
  const ral = texte.match(/RAL\s*(\d{4})/i) ?? texte.match(/^(\d{4})$/);
  if (ral) {
    const nom = RAL_NOMS[ral[1]];
    return nom ? `RAL ${ral[1]} ${nom}` : undefined;
  }
  const quartz = texte.match(/^(\d{3,4})\b/);
  if (quartz && QUARTZ_COLORS[quartz[1]]) return texte;
  return undefined;
}
