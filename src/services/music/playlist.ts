/**
 * The site playlist: the Loot Survivor theme, then one Shiny MIDI beast for
 * each of the 75 Original species (picked at random on 2026-11-19 from the
 * Tracks page's Shiny MIDI tab, preferring named ones), in shuffled order.
 * Named beasts play their Named Song; unnamed ones their Sound Check.
 */
import { NAMED_SONG_REF, SOUND_CHECK_REF } from "../beast/tracks";

export type PlaylistTrack =
  | { kind: "audio"; key: string; title: string; subtitle: string; src: string }
  | { kind: "beast"; key: string; title: string; subtitle: string; tokenId: string; track: string };

type ShinyMidiPick = { tokenId: string; species: string; prefix?: string; suffix?: string };

const SHINY_MIDI_PICKS: ShinyMidiPick[] = [
  { tokenId: "2632811108968168125307442550465722899136257473036984861528670815773", species: "Jiangshi", prefix: "Kraken", suffix: "Bender" },
  { tokenId: "47416863743829038961385636565501658271049705217060322277469998186816", species: "Titan", prefix: "Glyph", suffix: "Grasp" },
  { tokenId: "26341241172086759649719579340165103999726553762696081985187183035124", species: "Qilin", prefix: "Gale", suffix: "Shadow" },
  { tokenId: "59422466399205025164780650146901517054168466914393816671984267478668", species: "Metsavana", prefix: "Gloom", suffix: "Shout" },
  { tokenId: "28868737377644731811889764362644489690191862864259084550931651822068", species: "Skinwalker", prefix: "Blood", suffix: "Sun" },
  { tokenId: "7793126859823900336416082267883906780817434598484375514664937587444", species: "Chimera", prefix: "Rapture", suffix: "Sun" },
  { tokenId: "56052473467520753067303601112039977804445948330825409027496800780564", species: "Nemean Lion", prefix: "Cataclysm", suffix: "Bender" },
  { tokenId: "21589025416423918531988917771361802383729488674526807325410663661978", species: "Gnome", prefix: "Gloom", suffix: "Bite" },
  { tokenId: "49101860610927841917779447919540987430402527912856235941800671643442", species: "Behemoth", prefix: "Rapture", suffix: "Sun" },
  { tokenId: "58579969472476611629468418347434499180301434888491758934907494253163", species: "Golem", prefix: "Soul", suffix: "Whisper" },
  { tokenId: "45626556391926970688080364698261921714096095187694038966501435801949", species: "Leviathan", prefix: "Phoenix", suffix: "Bender" },
  { tokenId: "42664656022457599895006275164621848455771330459300047478746256655596", species: "Rat", prefix: "Death", suffix: "Form" },
  { tokenId: "36661846157471598539937927046715358471354157469488706327832010981661", species: "Jaguar", prefix: "Empyrean", suffix: "Whisper" },
  { tokenId: "14743731480627239406213132654951455969522173141299426746885981422481", species: "Ghoul", prefix: "Pain", suffix: "Sun" },
  { tokenId: "25393436975152673903110975623103798671786608857454206298645602746412", species: "Minotaur", prefix: "Death", suffix: "Roar" },
  { tokenId: "15586227402765382850978635541255371338799228021847645844797634266996", species: "Wraith", prefix: "Hypnotic", suffix: "Whisper" },
  { tokenId: "54262166317656116656593065673863462791182820361423207456877576832912", species: "Cyclops", prefix: "Armageddon", suffix: "Instrument" },
  { tokenId: "40137153389934959598070856791981181166096924688556608254481980834196", species: "Wolf", prefix: "Gloom", suffix: "Grasp" },
  { tokenId: "4317809181579696475646548052803785416225962841929001782878144069646", species: "Basilisk", prefix: "Oblivion", suffix: "Bite" },
  { tokenId: "947815045188325454773795971956342143321663163700628410504256521537", species: "Warlock", prefix: "Dusk", suffix: "Root" },
  { tokenId: "12953416495256875565570848159810581162189011741296381030589354149535", species: "Vampire", prefix: "Havoc", suffix: "Root" },
  { tokenId: "62055278712978222270321752916697094276722390473282900160749485769264", species: "Ogre", prefix: "Wrath", suffix: "Whisper" },
  { tokenId: "53419669590553379854192885137527764907258321700227349076338248057405", species: "Ettin", prefix: "Demon", suffix: "Tear" },
  { tokenId: "3475310044728055970521354285828971660907627893524084257950658412692", species: "Anansi", prefix: "Fate", suffix: "Peak" },
  { tokenId: "34976850896845464796499365589534058748539009369963458689095872217427", species: "Hippogriff", prefix: "Empyrean", suffix: "Bane" },
  { tokenId: "56894970194039347167540478372660247271411929384027615002774939321449", species: "Berserker", prefix: "Plague", suffix: "Song" },
  { tokenId: "62897772627240092230885867414258625249886604533655168419932529673437", species: "Orc", prefix: "Golem", suffix: "Tear" },
  { tokenId: "35819348024720646683693607121813603985685888394127379543073441531523", species: "Fenrir", prefix: "Eagle", suffix: "Root" },
  { tokenId: "17271221056983924565152626691146881952735299406111050938983077905637", species: "Kappa", prefix: "Pain", suffix: "Shout" },
  { tokenId: "49944366980568948328853511588330656085753854019740077407937336558118", species: "Hydra", prefix: "Ghoul", suffix: "Bane" },
  { tokenId: "13901226317264987929880564548033680806728790871169976806156806422592", species: "Goblin", prefix: "Plague", suffix: "Moon" },
  { tokenId: "19904028147605967628986958051777915199878818045644135810786760114810", species: "Kelpie", prefix: "Brood", suffix: "Whisper" },
  { tokenId: "24550933418725311151737775981661693018837150536099288241938336581574", species: "Dragon", prefix: "Damnation", suffix: "Growl" },
  { tokenId: "43941562538585679414091410110241366736133103347549207604773682889333", species: "Colossus", prefix: "Vengeance", suffix: "Instrument" },
  { tokenId: "41822157689198645229373600473676637593832842838268617053603193832076", species: "Spider", prefix: "Miracle", suffix: "Shadow" },
  { tokenId: "38346858292730652905944825347426249185496521063072327423048373108743", species: "Direwolf", prefix: "Brood", suffix: "Glow" },
  { tokenId: "23708433880203989830238762938986852654723353462342396566223281979870", species: "Phoenix", prefix: "Death", suffix: "Instrument" },
  { tokenId: "10425928728391378964404814834031242499127313830690477870883377202529", species: "Werewolf", prefix: "Maelstrom", suffix: "Instrument" },
  { tokenId: "8635620170577408371489650188174421808655968964942923983172320068784", species: "Wendigo", prefix: "Morbid", suffix: "Tear" },
  { tokenId: "39294653850914844651017589848339538693381507243634014419728834838868", species: "Bear", prefix: "Viper", suffix: "Growl" },
  { tokenId: "9583423764765232946298349992836834140953767755429240002820918724409", species: "Rakshasa", prefix: "Horror", suffix: "Instrument" },
  { tokenId: "60370277026486472616546400903016146314810372532919155731386980434901", species: "Troll", prefix: "Behemoth", suffix: "Form" },
  { tokenId: "52577171660809189480250419932314255420787344296255010732670343464519", species: "Jotunn", prefix: "Dusk", suffix: "Bite" },
  { tokenId: "16428724731654216247163336737570238208165593791533843063864725684942", species: "Sprite", prefix: "Blood", suffix: "Roar" },
  { tokenId: "22023439021349035549491682335255528073592770695498709726423946756135", species: "Griffin", prefix: "Cataclysm", suffix: "Glow" },
  { tokenId: "37504349112051020869906990709480654682567920887730637921405245997537", species: "Satori", prefix: "Dire", suffix: "Whisper" },
  { tokenId: "29711238724386434729676027824269764007157176485587245757238203795354", species: "Chupacabra", prefix: "Torment", suffix: "Whisper" },
  { tokenId: "46469061957341731291911978459436284328866639606746231874842356433664", species: "Tarrasque", prefix: "Corpse", suffix: "Peak" },
  { tokenId: "33186545353024235720334847202360517337627222320405563780286904370785", species: "Harpy", prefix: "Gloom", suffix: "Grasp" },
  { tokenId: "43099060589402619829164332050169726068024013013929030503337004598327", species: "Kraken", prefix: "Rage", suffix: "Tear" },
  { tokenId: "50786858483121920135920742599779658043246934600871851202605941277571", species: "Juggernaut", prefix: "Foe", suffix: "Bite" },
  { tokenId: "20746525275563753869331133431974990030322777293436144020867987014254", species: "Pixie", prefix: "Armageddon", suffix: "Bite" },
  { tokenId: "63740268951854233633172445087421522883053456353954879042609929830549", species: "Skeleton", prefix: "Chimeric", suffix: "Grasp" },
  { tokenId: "11268440117209857534531934758395643393876755345007687517237072266460", species: "Banshee", prefix: "Dread", suffix: "Song" },
  { tokenId: "31501545474667847085037348455744488139765538786038121809573382816523", species: "Wyvern", prefix: "Soul", suffix: "Whisper" },
  { tokenId: "28026242861118383454918691179720482213787990561825728850315093246188", species: "Nue", prefix: "Pandemonium", suffix: "Glow" },
  { tokenId: "19061529412518160635027529960952322429951113502404652476804054139047", species: "Leprechaun", prefix: "Viper", suffix: "Bender" },
  { tokenId: "5265619002829644833843596432046518592774563177605389601067676468334", species: "Gorgon", prefix: "Corpse", suffix: "Grasp" },
  { tokenId: "40979650318839872238610928441691723080665431980585834198466632009380", species: "Mantis", prefix: "Dire", suffix: "Root" },
  { tokenId: "22865936150103771851305182530479893855159772677155250429045297725927", species: "Manticore", prefix: "Blood", suffix: "Grasp" },
  { tokenId: "32344052042161078676916727656299117674705511829565757593954231059858", species: "Roc", prefix: "Wrath", suffix: "Song" },
  { tokenId: "34029038263558439766206117739140025068829081804870735663102821221174", species: "Pegasus", prefix: "Lights", suffix: "Bite" },
  { tokenId: "61212774353326406616789846740993293920758938388416987254024503149194", species: "Bigfoot", prefix: "Loath", suffix: "Bender" },
  { tokenId: "44784057256040122179146641506150689018903668399278865454616536826215", species: "Asag", prefix: "Apocalypse", suffix: "Glow" },
  { tokenId: "1790314784242988142303635760060680288132640744023366405679568372806", species: "Typhon", prefix: "Ghoul", suffix: "Whisper" },
  { tokenId: "18219037708554977907661630351317314276124653701914600713258834100302", species: "Fairy", prefix: "Pain", suffix: "Whisper" },
  { tokenId: "30659046738017945236923712460502569609039553600190167853047074637573", species: "Weretiger", prefix: "Fate", suffix: "Roar" },
  { tokenId: "27183749751452134605282552052977838139224271789661736887743997052737", species: "Ammit", prefix: "Gale", suffix: "Song" },
  { tokenId: "55104661236391301407141902804457848279981382417693343768291560457191", species: "Giant", prefix: "Storm", suffix: "Glow" },
  { tokenId: "6950617076582361553095826033367211295356025190833969365237850916453", species: "Lich", prefix: "Vengeance", suffix: "Glow" },
  { tokenId: "48259361875978523732282022284455106669877482763295840915214070088738", species: "Nephilim", prefix: "Apocalypse", suffix: "Bane" },
  { tokenId: "6108113117950071469035842178237604654278629848672925300741147459584", species: "Kitsune" },
  { tokenId: "12110929010257656041322028984126267926660933694970770048650044982004", species: "Draugr", prefix: "Onslaught", suffix: "Bender" },
  { tokenId: "57737478974164489705297569207482350371809157375935098867000072307987", species: "Yeti", prefix: "Maelstrom", suffix: "Bane" },
  { tokenId: "51734669308644042496074876013744293602731705905526912282660133601337", species: "Oni", prefix: "Blood", suffix: "Bite" },
];

export const PLAYLIST: PlaylistTrack[] = [
  { kind: "audio", key: "loot-survivor", title: "Loot Survivor", subtitle: "Theme", src: "/loot-survivor.mp3" },
  ...SHINY_MIDI_PICKS.map((p): PlaylistTrack => {
    const named = Boolean(p.prefix && p.suffix);
    return {
      kind: "beast",
      key: `${p.tokenId}:${named ? "named" : "check"}`,
      title: named ? `"${p.prefix} ${p.suffix}" ${p.species}` : p.species,
      subtitle: `Shiny MIDI · ${named ? "Named Song" : "Sound Check"}`,
      tokenId: p.tokenId,
      track: named ? NAMED_SONG_REF : SOUND_CHECK_REF,
    };
  }),
];
