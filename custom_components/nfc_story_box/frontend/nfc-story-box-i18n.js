// NFC Story Box – translations for the cards (Icelandic, English, Swedish).
//
// The cards are written in Icelandic. This file turns the Icelandic phrases in a card's HTML into
// English or Swedish, by exact phrase (whole words only, longest phrase first). Icelandic is
// the source language: nothing is changed for it. Phrases with {#} stand for a number, which can be
// used in the translation as {1}, {2}. Add a language by adding a column.
//
// Card names, titles and everything else that comes from your own cards are left alone.

const IS = 0, EN = 1, SV = 2;

// [Icelandic, English, Swedish]
const PHRASES = [
  // ---- general words
  ["Tónlist", "Music", "Musik"],
  ["tónlist", "music", "musik"],
  ["Saga", "Story", "Saga"],
  ["Sögur", "Stories", "Sagor"],
  ["sögur", "stories", "sagor"],
  ["Stýrikort", "Control", "Kontroll"],
  ["Sería", "Series", "Serie"],
  ["Spilar", "Plays", "Spelar"],
  ["Kort", "Cards", "Kort"],
  ["Miði", "Label", "Etikett"],
  ["Lokið", "Done", "Klart"],
  ["Loka", "Close", "Stäng"],
  ["Hætta", "Quit", "Avsluta"],
  ["Hætta við", "Cancel", "Avbryt"],
  ["Leita", "Search", "Sök"],
  ["Leita…", "Searching…", "Söker…"],
  ["Velja", "Pick", "Välj"],
  ["✓ Valið", "✓ Picked", "✓ Vald"],
  ["Vista breytingar", "Save changes", "Spara ändringar"],
  ["Vista…", "Saving…", "Sparar…"],
  ["Vistað ✓", "Saved ✓", "Sparat ✓"],
  ["Prenta", "Print", "Skriv ut"],
  ["Eyða korti", "Delete card", "Radera kort"],
  ["Allt", "All", "Alla"],
  ["Ekkert", "None", "Inga"],
  ["Engar", "None", "Inga"],
  ["Velja allt", "Select all", "Markera alla"],
  ["Velja allar", "Select all", "Markera alla"],
  // ---- extra tags and cards without a label
  ["eða bæta við sem aukakort á", "or add as an extra card to", "eller lägg till som extra kort på"],
  ["Bæta við", "Add", "Lägg till"],
  ["Fleiri kort eða flögur sem ræsa þetta", "More cards or chips that start this", "Fler kort eller brickor som startar detta"],
  ["+ Bæta við síðast skannaða", "+ Add the last scanned", "+ Lägg till senast skannade"],
  ["Ekkert merki (flaga límd á bók eða hlut, prentast ekki)", "No label (chip glued to a book or object, not printed)", "Ingen etikett (bricka på en bok eller sak, skrivs inte ut)"],
  ["📚 enginn miði", "📚 no label", "📚 ingen etikett"],
  ["ekki skannað enn", "not scanned yet", "inte skannad än"],
  ["Fjarlægja", "Remove", "Ta bort"],
  ["Þessi flaga er þegar á þessu korti.", "This chip is already on this card.", "Den här brickan finns redan på detta kort."],
  ["Korti bætt við.", "Card added.", "Kort tillagt."],
  ["Bara óprentaðir", "Only unprinted", "Bara outskrivna"],
  ["Meira", "More", "Mer"],
  ["Tegund", "Type", "Typ"],
  ["Miðill", "Media", "Media"],
  ["Litur", "Colour", "Färg"],
  ["Blað", "Sheet", "Ark"],
  ["Útlit", "Look", "Utseende"],
  ["Bakhlið", "Back", "Baksida"],
  ["Vinstri", "Left", "Vänster"],
  ["Efst", "Top", "Överkant"],
  ["Eintök", "Copies", "Kopior"],
  ["Sýna færri", "Show fewer", "Visa färre"],
  ["gleyma", "forget", "glöm"],
  ["bók", "book", "bok"],
  ["bækur", "books", "böcker"],
  ["Bók", "Book", "Bok"],
  ["miði", "label", "etikett"],
  ["miðar", "labels", "etiketter"],
  ["blað", "sheet", "ark"],
  ["blöð", "sheets", "ark"],
  ["mín", "min", "min"],
  ["mín.", "min", "min"],
  ["klst", "h", "tim"],
  ["klst.", "h", "tim"],
  ["sek.", "s", "sek."],
  ["kl.", "at", "kl."],

  // ---- label styles, sheets, kinds
  ["Stór mynd", "Big picture", "Stor bild"],
  ["Klassískt", "Classic", "Klassisk"],
  ["Heil mynd", "Full picture", "Hel bild"],
  ["Litríkt", "Colourful", "Färgglad"],
  ["Einfalt", "Simple", "Enkel"],
  ["Klippa sjálf", "Cut yourself", "Klipp själv"],
  ["Úr forsíðu", "From the cover", "Från omslaget"],
  ["Eftir tegund", "By type", "Efter typ"],
  ["+ Sería", "+ Series", "+ Serie"],

  // ---- control cards
  ["Spilar tónlist eða sögu", "Plays music or a story", "Spelar musik eller en saga"],
  ["Stöðvar spilun", "Stops playback", "Stoppar uppspelningen"],
  ["Svefntími: stöðvar eftir smástund", "Sleep timer: stops after a while", "Insomningstimer: stoppar efter en stund"],
  ["Skiptir um hátalara", "Switches speaker", "Byter högtalare"],
  ["Óvænt: spilar eitthvert kort", "Surprise: plays some card", "Överraskning: spelar något kort"],
  ["Þegar kortið er lagt á tækið stöðvast það sem er í spilun.",
    "When the card is put on the box, whatever is playing stops.",
    "När kortet läggs på lådan stannar det som spelas."],
  ["Þegar kortið er lagt á tækið heldur spilunin áfram í þennan tíma og stöðvast svo.",
    "When the card is put on the box, playback goes on for this long and then stops.",
    "När kortet läggs på lådan fortsätter uppspelningen så här länge och stannar sedan."],
  ["Þegar kortið er lagt á tækið færist spilunin á þennan hátalara, og næstu kort spilast þar.",
    "When the card is put on the box, playback moves to this speaker, and the next cards play there.",
    "När kortet läggs på lådan flyttas uppspelningen till den här högtalaren, och nästa kort spelas där."],
  ["Þegar kortið er lagt á tækið spilast eitthvert hinna kortanna af handahófi.",
    "When the card is put on the box, one of the other cards is played at random.",
    "När kortet läggs på lådan spelas något av de andra korten slumpmässigt."],
  ["Hvað gerir kortið?", "What does the card do?", "Vad gör kortet?"],
  ["Mínútur þar til spilun stöðvast", "Minutes until playback stops", "Minuter tills uppspelningen stannar"],
  ["Hátalari", "Speaker", "Högtalare"],
  ["Hátalarinn í stillingunum (til baka)", "The speaker in the settings (back)", "Högtalaren i inställningarna (tillbaka)"],
  ["Þetta kort spilar á", "This card plays on", "Det här kortet spelar på"],
  ["Sama hátalara og hin kortin", "The same speaker as the other cards", "Samma högtalare som de andra korten"],
  ["(ótengdur)", "(not connected)", "(inte ansluten)"],

  // ---- providers and media types
  ["Safnið", "Library", "Biblioteket"],
  ["Skrár", "Files", "Filer"],
  ["Hlaðvarp (RSS)", "Podcast (RSS)", "Podcast (RSS)"],
  ["Innbyggt", "Built-in", "Inbyggd"],
  ["Vefslóð", "Web address", "Webbadress"],
  ["Lagalisti", "Playlist", "Spellista"],
  ["Plata", "Album", "Album"],
  ["Hljóðbók", "Audiobook", "Ljudbok"],
  ["Hlaðvarp", "Podcast", "Podcast"],
  ["Flytjandi", "Artist", "Artist"],
  ["Lag", "Track", "Låt"],
  ["Útvarp", "Radio", "Radio"],
  ["Hljóðbækur", "Audiobooks", "Ljudböcker"],
  ["Plötur", "Albums", "Album"],
  ["Lagalistar", "Playlists", "Spellistor"],
  ["Hlaðvörp", "Podcasts", "Podcasts"],

  // ---- errors and messages
  ["jsPDF hlóðst ekki", "jsPDF did not load", "jsPDF laddades inte"],
  ["náði ekki í PDF-safnið", "could not load the PDF library", "kunde inte hämta PDF-biblioteket"],
  ["Gat ekki vistað stillingar: ", "Could not save the settings: ", "Kunde inte spara inställningarna: "],
  ["Gat ekki vistað: ", "Could not save: ", "Kunde inte spara: "],
  ["Gat ekki búið til PDF: ", "Could not make the PDF: ", "Kunde inte skapa PDF: "],
  ["Gat ekki búið til prófunarblað: ", "Could not make the test sheet: ", "Kunde inte skapa testarket: "],
  ["Gat ekki lesið myndina: ", "Could not read the picture: ", "Kunde inte läsa bilden: "],
  ["Gat ekki spilað: ", "Could not play: ", "Kunde inte spela: "],
  ["Gat ekki lesið afritið: ", "Could not read the backup: ", "Kunde inte läsa säkerhetskopian: "],
  ["NFC Story Box samþættingin er ekki uppsett (Stillingar → Tæki og þjónustur).",
    "The NFC Story Box integration is not set up (Settings → Devices & services).",
    "Integrationen NFC Story Box är inte installerad (Inställningar → Enheter och tjänster)."],
  ["Hleð upp mynd…", "Uploading picture…", "Laddar upp bild…"],
  ["Vistaðu breytingarnar fyrst.", "Save your changes first.", "Spara ändringarna först."],
  ["Leggðu annað kort á.", "Put another card on.", "Lägg på ett annat kort."],
  ["Þetta kort er þegar tengt við", "This card is already linked to", "Det här kortet är redan kopplat till"],
  ["tengt við", "linked to", "kopplat till"],
  ["Tengt við", "Linked to", "Kopplat till"],
  ["Athugið: ", "Note: ", "Observera: "],
  ["er líka á", "is also on", "finns också på"],
  ["Ekkert kort hefur verið lagt á kassann.", "No card has been put on the box.", "Inget kort har lagts på lådan."],
  ["Kortið spilar ekkert enn.", "The card plays nothing yet.", "Kortet spelar ingenting än."],
  ["keyrt.", "run.", "körts."],
  ["Afrit sótt (Downloads).", "Backup downloaded (Downloads).", "Säkerhetskopia nedladdad (Hämtade filer)."],
  ["þetta er ekki afrit af kortum", "this is not a backup of cards", "det här är inte en säkerhetskopia av kort"],
  ["Afrit hlaðið inn ({#} kort). Skoðaðu og ýttu á Vista breytingar til að nota það.",
    "Backup loaded ({1} cards). Have a look and press Save changes to use it.",
    "Säkerhetskopia inläst ({1} kort). Titta igenom och tryck på Spara ändringar för att använda den."],
  ["Ekki vistað:", "Not saved:", "Inte sparat:"],
  ["spilar ekkert", "plays nothing", "spelar ingenting"],
  ["nota sama kort", "use the same card", "använder samma kort"],
  ["vantar heiti", "has no name", "saknar namn"],
  ["Sæki kort og myndir…", "Loading cards and pictures…", "Hämtar kort och bilder…"],
  ["Sæki upplýsingar úr Music Assistant…", "Getting details from Music Assistant…", "Hämtar uppgifter från Music Assistant…"],
  ["Engin kort enn.", "No cards yet.", "Inga kort än."],
  ["Ýttu á", "Press", "Tryck på"],
  ["+ Nýtt kort", "+ New card", "+ Nytt kort"],
  ["eða leggðu kort á kassann.", "or put a card on the box.", "eller lägg ett kort på lådan."],
  ["Smelltu á kort til að breyta · leggðu kort á tækið og það opnast",
    "Click a card to edit it · put a card on the box and it opens",
    "Klicka på ett kort för att redigera · lägg ett kort på lådan så öppnas det"],
  ["(nýtt kort)", "(new card)", "(nytt kort)"],
  ["Nýtt kort", "New card", "Nytt kort"],
  ["nýja kortið", "the new card", "det nya kortet"],
  ["nýju korti", "a new card", "ett nytt kort"],
  ["þetta kort", "this card", "det här kortet"],
  ["Kortið", "The card", "Kortet"],

  // ---- status chips
  ["rólegur tími", "quiet hours", "tyst tid"],
  ["stöðvast kl.", "stops at", "stannar kl."],
  ["mín í dag", "min today", "min idag"],
  ["í dag", "today", "idag"],
  ["í gær", "yesterday", "igår"],

  // ---- wizard (connect cards)
  ["Tengja kort", "Connect cards", "Koppla kort"],
  ["Tengja kortin við NFC", "Connect the cards to NFC", "Koppla korten till NFC"],
  ["Næsta kort ·", "Next card ·", "Nästa kort ·"],
  ["{#} af {#}", "{1} of {2}", "{1} av {2}"],
  ["Leggðu NFC-kortið sem á að vera", "Put the NFC card that should be", "Lägg NFC-kortet som ska vara"],
  ["á kassann.", "on the box.", "på lådan."],
  ["Búið!", "Done!", "Klart!"],
  ["kort tengd.", "cards connected.", "kort kopplade."],
  ["Öll kortin eru tengd.", "All the cards are connected.", "Alla korten är kopplade."],
  ["sleppt – þau má tengja seinna.", "skipped – they can be connected later.", "hoppade över – de kan kopplas senare."],
  ["Nú spila öll kortin þegar þau eru lögð á tækið.", "Now all the cards play when they are put on the box.", "Nu spelas alla kort när de läggs på lådan."],
  ["tengd", "connected", "kopplade"],
  ["sleppt", "skipped", "överhoppade"],
  ["Sleppa þessu", "Skip this one", "Hoppa över"],

  // ---- main page
  ["Tengja kort ({#})", "Connect cards ({1})", "Koppla kort ({1})"],
  ["Prenta ({#})", "Print ({1})", "Skriv ut ({1})"],
  ["Sækja afrit af kortunum", "Download a backup of the cards", "Hämta säkerhetskopia av korten"],
  ["Hlaða inn afriti", "Upload a backup", "Läs in säkerhetskopia"],
  ["Sækja allt aftur", "Reload everything", "Hämta allt igen"],
  ["Stöðva", "Stop", "Stoppa"],
  ["kort ·", "cards ·", "kort ·"],
  ["valin til prentunar", "selected for printing", "valda för utskrift"],
  ["Prófa á hátalara", "Try on the speaker", "Testa på högtalaren"],
  ["Færa framar", "Move earlier", "Flytta framåt"],
  ["Færa aftar", "Move later", "Flytta bakåt"],
  ["Færa upp", "Move up", "Flytta upp"],
  ["Færa niður", "Move down", "Flytta ner"],
  ["Prenta miða", "Print labels", "Skriv ut etiketter"],
  ["Prentast (smelltu til að sleppa)", "Will be printed (click to skip)", "Skrivs ut (klicka för att hoppa över)"],
  ["Prentast ekki (smelltu til að velja)", "Will not be printed (click to pick)", "Skrivs inte ut (klicka för att välja)"],
  ["vantar NFC-kort", "NFC card missing", "NFC-kort saknas"],
  ["í spilun", "playing", "spelas"],
  ["♪ spilar", "♪ playing", "♪ spelas"],
  ["✓ tengt", "✓ linked", "✓ kopplat"],
  ["⚠ vantar kort", "⚠ card missing", "⚠ kort saknas"],
  ["✓ kort tengt", "✓ card linked", "✓ kort kopplat"],
  ["prentað", "printed", "utskrivet"],
  ["Hve oft kortið hefur verið spilað", "How many times the card has been played", "Hur många gånger kortet har spelats"],
  ["· sería,", "· series,", "· serie,"],
  ["· 📡 lagt á tækið", "· 📡 put on the box", "· 📡 lagt på lådan"],
  ["Óvistaðar breytingar á kortum", "Unsaved changes to cards", "Osparade ändringar av kort"],
  ["Miðastillingar vistast sjálfkrafa", "Label settings are saved automatically", "Etikettinställningarna sparas automatiskt"],

  // ---- scan bar
  ["Kortið", "The card", "Kortet"],
  ["er tengt við", "is linked to", "är kopplat till"],
  ["Ýttu á Vista breytingar.", "Press Save changes.", "Tryck på Spara ändringar."],
  ["Nýtt kort lagt á kassann:", "New card put on the box:", "Nytt kort lagt på lådan:"],
  ["Tengja við", "Connect to", "Koppla till"],
  ["Tengja", "Connect", "Koppla"],
  ["+ Búa til nýtt kort", "+ Create a new card", "+ Skapa nytt kort"],
  ["Nota síðasta skannaða", "Use the last scanned", "Använd senast skannade"],
  ["Leggðu kortið á kassann fyrst", "Put the card on the box first", "Lägg kortet på lådan först"],
  ["Tengja við", "Connect to", "Koppla till"],

  // ---- card dialog
  ["Kortið spilar", "The card plays", "Kortet spelar"],
  ["Kortið spilar ekkert enn. Leitaðu hér fyrir neðan eða límdu tengil.",
    "The card plays nothing yet. Search below or paste a link.",
    "Kortet spelar ingenting än. Sök här nedanför eller klistra in en länk."],
  ["Þekki ekki þetta snið", "Don't recognise this format", "Känner inte igen formatet"],
  ["Fannst ekki í Music Assistant", "Not found in Music Assistant", "Hittades inte i Music Assistant"],
  [", en reynt verður að spila það.", ", but it will be tried anyway.", ", men det kommer ändå att försökas spelas."],
  ["Leitaðu að sögu, plötu eða lagalista – eða límdu tengil",
    "Search for a story, album or playlist – or paste a link",
    "Sök efter en saga, ett album eller en spellista – eller klistra in en länk"],
  ["Finna allar bækur í bókaseríu", "Find all the books in a book series", "Hitta alla böcker i en bokserie"],
  ["📚 Finna seríu", "📚 Find series", "📚 Hitta serie"],
  ["📚 Margar bækur heita", "📚 Many books are called", "📚 Många böcker heter"],
  ["– er þetta sería?", "– is this a series?", "– är det här en serie?"],
  ["Sjá allar bækurnar", "See all the books", "Se alla böckerna"],
  ["✓ Fann tengilinn og setti hann á kortið.", "✓ Found the link and put it on the card.", "✓ Hittade länken och satte den på kortet."],
  ["⚠ Music Assistant þekkti ekki þennan tengil.", "⚠ Music Assistant did not recognise this link.", "⚠ Music Assistant kände inte igen länken."],
  ["Nota hann samt", "Use it anyway", "Använd den ändå"],
  ["Bæta við sem næstu bók í seríu", "Add as the next book in the series", "Lägg till som nästa bok i serien"],
  ["Taka úr seríu", "Take out of the series", "Ta bort från serien"],
  ["Sería – spilast í þessari röð", "Series – plays in this order", "Serie – spelas i den här ordningen"],
  ["Sýna allar {#} bækurnar", "Show all {1} books", "Visa alla {1} böckerna"],
  ["Stokka (handahófsröð)", "Shuffle (random order)", "Blanda (slumpmässig ordning)"],
  ["Halda áfram að spila þegar kortið er tekið af", "Keep playing when the card is lifted", "Fortsätt spela när kortet tas bort"],
  ["Muna hvar sagan var og halda áfram þaðan", "Remember where the story was and continue from there", "Kom ihåg var sagan var och fortsätt därifrån"],
  ["Spila næstu bók í seríunni í hvert sinn", "Play the next book in the series each time", "Spela nästa bok i serien varje gång"],
  ["Byrja upp á nýtt", "Start over", "Börja om"],
  ["Hátalari og hljóðstyrkur", "Speaker and volume", "Högtalare och volym"],
  ["Hljóðstyrkur þegar kortið byrjar (%) – autt = óbreyttur",
    "Volume when the card starts (%) – empty = unchanged",
    "Volym när kortet börjar (%) – tomt = oförändrad"],
  ["óbreyttur", "unchanged", "oförändrad"],
  ["Heldur áfram í bók {#},", "Continues in book {1},", "Fortsätter i bok {1},"],
  ["Heldur áfram", "Continues", "Fortsätter"],
  ["í bók", "in book", "i bok"],
  ["inn.", "in.", "in."],
  ["Spilað {#} sinnum", "Played {1} times", "Spelat {1} gånger"],
  ["síðast", "last", "senast"],
  ["alls", "in total", "totalt"],
  ["Ítarlegt", "Advanced", "Avancerat"],
  ["Sería (einn miðill í línu)", "Series (one item per line)", "Serie (ett media per rad)"],
  ["— ekkert —", "— none —", "— inget —"],
  ["(ekki skannað enn)", "(not scanned yet)", "(inte skannad än)"],
  ["notað:", "used by:", "används av:"],
  ["Heiti kortsins", "Name of the card", "Kortets namn"],
  ["t.d. Lína langsokkur", "e.g. Pippi Longstocking", "t.ex. Pippi Långstrump"],
  ["NFC kort", "NFC card", "NFC-kort"],
  ["✓ Þetta kort hefur verið lagt á kassann.", "✓ This card has been put on the box.", "✓ Det här kortet har lagts på lådan."],
  ["Leggðu nýja kortið á kassann og veldu það hér, eða notaðu",
    "Put the new card on the box and pick it here, or use",
    "Lägg det nya kortet på lådan och välj det här, eller använd"],
  ["sem birtist efst á síðunni.", "which appears at the top of the page.", "som visas överst på sidan."],
  ["Tengja við", "Connect to", "Koppla till"],
  ["Sæki", "Loading", "Hämtar"],

  // ---- series finder
  ["📚 Leita að bókum í seríunni", "📚 Searching for books in the series", "📚 Söker efter böcker i serien"],
  ["📚 Sería:", "📚 Series:", "📚 Serie:"],
  ["bækur með", "books with", "böcker med"],
  ["í titlinum", "in the title", "i titeln"],
  ["aðrar fyrir neðan", "others below", "andra nedanför"],
  ["valdar", "picked", "valda"],
  ["röðin hér er röðin sem þær spilast í", "the order here is the order they play in", "ordningen här är ordningen de spelas i"],
  ["Bæta aftan við núverandi", "Add after the current ones", "Lägg till efter de nuvarande"],
  ["Setja", "Put", "Lägg"],
  ["á kortið", "on the card", "på kortet"],
  ["bækur í seríunni", "books in the series", "böcker i serien"],
  ["Mundu að vista.", "Remember to save.", "Kom ihåg att spara."],

  // ---- label tab
  ["Titill á miðanum", "Title on the label", "Titel på etiketten"],
  ["Bakhlið", "Back", "Baksida"],
  ["🖼️ Dragðu mynd hingað eða", "🖼️ Drag a picture here or", "🖼️ Dra en bild hit eller"],
  ["Velja mynd", "Choose picture", "Välj bild"],
  ["Nota forsíðu", "Use the cover", "Använd omslaget"],
  ["Prentað", "Printed", "Utskriven"],
  ["Ekki prentað enn", "Not printed yet", "Inte utskriven än"],

  // ---- print dialog
  ["miðar á", "labels on", "etiketter på"],
  ["miði á", "label on", "etikett på"],
  ["kort valin", "cards selected", "kort valda"],
  ["með bakhliðum", "with backs", "med baksidor"],
  ["Sýna", "Show", "Visa"],
  ["á miðum", "on the labels", "på etiketterna"],
  ["Punktar fyrir bækur í seríu", "Dots for books in a series", "Prickar för böcker i en serie"],
  ["Stærð miða:", "Label size:", "Etikettstorlek:"],
  [", klipptu á punktalínunni", ", cut along the dotted line", ", klipp längs den streckade linjen"],
  [", forskornir límmiðar", ", pre-cut stickers", ", förskurna klistermärken"],
  ["Bakhliðarnar koma á eftir framhliðunum.", "The backs come after the fronts.", "Baksidorna kommer efter framsidorna."],
  ["Staðsetning á blaði (mm)", "Position on the sheet (mm)", "Placering på arket (mm)"],
  ["Bil milli dálka", "Gap between columns", "Avstånd mellan kolumner"],
  ["Bil milli raða", "Gap between rows", "Avstånd mellan rader"],
  ["Prófunarblað (PDF)", "Test sheet (PDF)", "Testark (PDF)"],
  ["Prentaðu prófunarblaðið á venjulegan pappír, leggðu það yfir límmiðablað og berðu upp að ljósi. Lagaðu tölurnar þar til rammarnir falla á límmiðana.",
    "Print the test sheet on plain paper, lay it over a sticker sheet and hold it up to the light. Adjust the numbers until the frames fall on the stickers.",
    "Skriv ut testarket på vanligt papper, lägg det över ett klistermärkesark och håll det mot ljuset. Justera siffrorna tills ramarna hamnar på klistermärkena."],
  ["Fleiri stillingar og stilla prentara", "More settings and printer adjustment", "Fler inställningar och skrivarjustering"],
  ["Engin kort valin. Hakaðu við kortin sem á að prenta.", "No cards selected. Tick the cards to print.", "Inga kort valda. Bocka för korten som ska skrivas ut."],
  ["Bý til PDF með", "Making a PDF with", "Skapar en PDF med"],
  ["miðum…", "labels…", "etiketter…"],
  ["PDF tilbúið:", "PDF ready:", "PDF klar:"],
  ["er í niðurhali (Downloads). Prentaðu í 100 %.", "has been downloaded (Downloads). Print at 100 %.", "har hämtats (Hämtade filer). Skriv ut i 100 %."],
  ["Sent í prentun. Veldu 100 % (raunstærð) í prentglugganum.", "Sent to the printer. Choose 100 % (actual size) in the print dialog.", "Skickat till skrivaren. Välj 100 % (verklig storlek) i utskriftsdialogen."],
  ["PDF tilbúið, en", "PDF ready, but", "PDF klar, men"],
  ["mynd(ir) náðust ekki frá Music Assistant. Opnaðu kortið og veldu aðra mynd.",
    "picture(s) could not be fetched from Music Assistant. Open the card and choose another picture.",
    "bild(er) kunde inte hämtas från Music Assistant. Öppna kortet och välj en annan bild."],
  ["Appið getur ekki prentað beint. Notaðu", "The app cannot print directly. Use", "Appen kan inte skriva ut direkt. Använd"],
  ["Sækja PDF", "Get PDF", "Hämta PDF"],
  ["og prentaðu skrána.", "and print the file.", "och skriv ut filen."],
  ["Augnablik…", "One moment…", "Ett ögonblick…"],
  ["Næst: byrja á miða", "Next: start at label", "Nästa: börja på etikett"],
  ["Byrja á miða", "Start at label", "Börja på etikett"],
  ["Byrja á miða {#}", "Start at label {1}", "Börja på etikett {1}"],
  ["Hálfnotað blað? Smelltu á fyrsta lausa límmiðann á blaði 1. Gráu reitirnir eru þegar notaðir.",
    "Half-used sheet? Click the first free sticker on sheet 1. The grey ones are already used.",
    "Halvt använt ark? Klicka på första lediga klistermärket på ark 1. De grå är redan använda."],
  ["Á blaðinu", "On the sheet", "På arket"],
  ["Prenta miða", "Print labels", "Skriv ut etiketter"],

  // ---- tabs and misc
  ["Hátalari og hljóðstyrkur", "Speaker and volume", "Högtalare och volym"],

  // ---- label drawing
  ["+ %1 í viðbót", "+ %1 more", "+ %1 till"],
  ["▶ Spilar", "▶ Playing", "▶ Spelar"],
  ["“ á", "” on", "” på"],
  ["“ á miðum", "” on the labels", "” på etiketterna"],
  ["%1 %2 á %3 %4", "%1 %2 on %3 %4", "%1 %2 på %3 %4"],
  ["Leggðu mig á kassann og hlustaðu á söguna", "Put me on the box and listen to the story", "Lägg mig på lådan och lyssna på sagan"],
  ["Leggðu mig á kassann og hlustaðu", "Put me on the box and listen", "Lägg mig på lådan och lyssna"],
  ["Ef þú finnur mig: skilaðu mér til eigandans ♥", "If you find me: please return me to my owner ♥", "Om du hittar mig: lämna tillbaka mig till ägaren ♥"],
  ["Eyða", "Delete", "Radera"],
  ["(Vistast þegar þú ýtir á Vista breytingar)", "(Applies when you press Save changes)", "(Gäller när du trycker på Spara ändringar)"],
  ["Kortin á kassanum: hvað þau spila og prentanlegir miðar með forsíðumyndum.",
    "The cards of the box: what they play, and printable labels with cover pictures.",
    "Korten på lådan: vad de spelar och utskrivbara etiketter med omslagsbilder."],

  // ---- quotes
  ["„", "“", "”"],
  ["“", "”", "”"],

  // ---- statistics card
  ["Tölfræði", "Statistics", "Statistik"],
  ["Tímabil", "Period", "Period"],
  ["Gat ekki sótt tölfræði: ", "Could not load statistics: ", "Kunde inte hämta statistiken: "],
  ["Sæki tölfræði …", "Loading statistics …", "Hämtar statistik …"],
  ["Slökkt er á skráningu tölfræði (rofinn ", "Recording of statistics is switched off (the switch ", "Registreringen av statistik är avstängd (omkopplaren "],
  ["Skrá tölfræði", "Record statistics", "Registrera statistik"],
  ["Ekkert nýtt bætist við.", "Nothing new is added.", "Inget nytt läggs till."],
  ["Hér birtist tölfræðin um leið og spilarinn hefur verið notaður. Skráning hófst núna.",
    "The statistics appear here as soon as the player has been used. Recording started now.",
    "Statistiken visas här så fort spelaren har använts. Registreringen startade nu."],
  ["ný vika", "new week", "ny vecka"],
  ["frá vikunni á undan", "compared with the week before", "jämfört med veckan innan"],
  ["Í dag", "Today", "Idag"],
  ["af {#}", "of {1}", "av {1}"],
  ["af dagsmörkum", "of the daily limit", "av dagsgränsen"],
  ["Síðustu 7 dagar", "Last 7 days", "Senaste 7 dagarna"],
  ["Meðaltal á dag", "Average per day", "Genomsnitt per dag"],
  ["{#} af {#} dögum", "{1} of {2} days", "{1} av {2} dagar"],
  ["Spilanir", "Plays", "Spelningar"],
  ["hver", "each", "per gång"],
  ["Hlustun á dag", "Listening per day", "Lyssnande per dag"],
  ["Hlustun á dag, mínútur", "Listening per day, minutes", "Lyssnande per dag, minuter"],
  ["Hvenær spilarinn er notaður, vikudagur og klukkustund", "When the player is used, weekday and hour", "När spelaren används, veckodag och timme"],
  ["Vinsælustu kortin", "Most played cards", "Mest spelade korten"],
  ["tekið fljótt af", "lifted quickly", "snabbt borttaget"],
  ["Oft tekið strax af (undir 30 sek.)", "Often lifted straight away (under 30 s)", "Ofta borttaget direkt (under 30 sek.)"],
  ["eytt", "deleted", "raderat"],
  ["Engin kort spiluð á tímabilinu.", "No cards played in this period.", "Inga kort spelades under perioden."],
  ["Ekki spiluð í {#}+ daga", "Not played in {1}+ days", "Inte spelade på {1}+ dagar"],
  ["aldrei spilað", "never played", "aldrig spelat"],
  ["… og {#} til", "… and {1} more", "… och {1} till"],
  ["Öll kortin hafa verið spiluð nýlega.", "All the cards have been played recently.", "Alla korten har spelats nyligen."],
  ["Hvenær er hlustað?", "When is it listened to?", "När lyssnas det?"],
  ["Sögur í gangi", "Stories in progress", "Pågående sagor"],
  ["Bók {#} af {#}", "Book {1} of {2}", "Bok {1} av {2}"],
  ["komin í", "at", "kommen till"],
  ["Hátalarar", "Speakers", "Högtalare"],
  ["Síðustu spilanir", "Latest plays", "Senaste spelningar"],
  ["Engar spilanir skráðar enn.", "No plays recorded yet.", "Inga spelningar registrerade än."],
  ["Skráð frá", "Recorded since", "Registrerat sedan"],
  ["geymt í 90 daga á þessum Home Assistant", "kept for 90 days on this Home Assistant", "sparas i 90 dagar i den här Home Assistant"],
  ["Já, hreinsa alla tölfræði", "Yes, clear all statistics", "Ja, rensa all statistik"],
  ["Hreinsa tölfræði", "Clear statistics", "Rensa statistik"],
];

const LOCALES = { is: "is-IS", en: "en-GB", sv: "sv-SE" };
const IS_DAYS = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
const IS_MONTHS = ["jan.", "feb.", "mar.", "apr.", "maí", "jún.", "júl.", "ágú.", "sep.", "okt.", "nóv.", "des."];

let current = "is";
const compiled = {};

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(lang) {
  const col = lang === "en" ? EN : SV;
  const plain = new Map();
  const patterns = [];
  for (const row of PHRASES) {
    const from = row[IS], to = row[col];
    if (from.includes("{#}")) {
      const src = escRx(from).replace(/\\\{#\\\}/g, "(\\d+)");
      patterns.push({ len: from.length, rx: new RegExp("(?<![\\p{L}\\p{N}])" + src + "(?![\\p{L}\\p{N}])", "gu"), to });
    } else if (!plain.has(from)) {
      plain.set(from, to);
    }
  }
  patterns.sort((a, b) => b.len - a.len);
  const keys = [...plain.keys()].sort((a, b) => b.length - a.length);
  const part = (k) => (/^\p{L}/u.test(k) ? "(?<![\\p{L}\\p{N}])" : "") + escRx(k) + (/\p{L}$/u.test(k) ? "(?![\\p{L}\\p{N}])" : "");
  const rx = new RegExp(keys.map(part).join("|"), "gu");
  return { plain, patterns, rx };
}

/** Choose the language from Home Assistant's (hass.locale.language or hass.language). Returns true if it changed. */
export function setLang(hass) {
  const code = String((hass && ((hass.locale && hass.locale.language) || hass.language)) || "en").toLowerCase();
  const next = code.startsWith("is") ? "is" : code.startsWith("sv") ? "sv" : "en";
  const changed = next !== current;
  current = next;
  return changed;
}

export const lang = () => current;
export const locale = () => LOCALES[current];
export const dayNames = () =>
  current === "is" ? IS_DAYS : [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(2024, 0, 1 + i).toLocaleDateString(LOCALES[current], { weekday: "short" }));
export const monthNames = () =>
  current === "is" ? IS_MONTHS : [...Array(12).keys()].map((i) => new Date(2024, i, 1).toLocaleDateString(LOCALES[current], { month: "short" }));

/** Translate a piece of text. Icelandic is the source language, so it is returned as it is. */
export function tr(text) {
  if (current === "is" || !text) return text;
  const c = (compiled[current] ||= compile(current));
  let out = String(text);
  for (const p of c.patterns) out = out.replace(p.rx, (...m) => p.to.replace(/\{(\d)\}/g, (_, n) => m[+n]));
  return out.replace(c.rx, (m) => c.plain.get(m));
}

const ATTRS = /\b(title|aria-label|placeholder|alt|label)="([^"]*)"/g;

/** Translate a sentence with %1, %2 … for values that are put in afterwards. */
export const T = (text, ...args) => tr(text).replace(/%(\d)/g, (_, n) => (args[+n - 1] ?? ""));

/** "one" or "many" word for a count: Icelandic ends in 1 (but not 11), the others only at exactly 1. */
export const pl = (n, one, many) => tr(
  (current === "is" ? n % 10 === 1 && n % 100 !== 11 : n === 1) ? one : many,
);

/** Translate the texts and the title/aria-label/placeholder attributes of an HTML string. */
export function trHtml(html) {
  if (current === "is") return html;
  let inStyle = false;
  return String(html).split(/(<\/?[a-zA-Z!][^>]*>)/).map((part, i) => {
    if (i % 2) {
      if (/^<style\b/i.test(part)) inStyle = true;
      else if (/^<\/style/i.test(part)) inStyle = false;
      return part.replace(ATTRS, (_, a, v) => `${a}="${tr(v)}"`);
    }
    return inStyle ? part : tr(part);
  }).join("");
}
