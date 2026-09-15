// Standard-Übungsbibliothek der IPSC Trainings-Bibliothek.
// Par-Zeiten sind Richtwerte für ambitionierte Hobby-Schützen – an das eigene
// Niveau anpassen. Koordinaten beziehen sich auf eine 400 x 500 große Skizze
// (oben = Kugelfang, unten = Schützenseite).
//
// Sicherheit gilt bei jeder Übung: Standregeln und 180°-Regel beachten, Finger
// bei Bewegung und Magazinwechsel außerhalb des Abzugsbügels, Trockentraining
// nur ohne Munition im Raum.

(function () {
  const layout = (parts) => Object.assign(
    { viewW: 400, viewH: 500, targets: [], shooterPositions: [], walls: [], boxes: [], props: [], path: [] },
    parts
  );
  const paper = (x, y, label) => ({ type: "paper", x, y, label });
  const noshoot = (x, y, label) => ({ type: "noshoot", x, y, label });
  const plate = (x, y, label) => ({ type: "steel", x, y, label });
  const popper = (x, y, label) => ({ type: "popper", x, y, label });
  const shooter = (x, y, label = "Start", facing = 0) => ({ x, y, facing, label });

  window.IPSC_DRILLS = [
    // ---------- Ziehen ----------
    {
      id: "std-draw-first-shot",
      title: "Ziehen – erster Treffer",
      category: "Ziehen",
      difficulty: "Anfänger",
      equipment: ["Holster", "Shot-Timer"],
      rounds: 1,
      distance: "7 m",
      parTime: "1,5 s",
      procedure: "Aufrecht vor dem Ziel stehen, Hände locker neben dem Körper. Auf das Startsignal ziehen und einen Schuss in die A-Zone abgeben. Waffe sichern, holstern und wiederholen.",
      focus: "Die Schusshand greift schon im Holster endgültig. Die Waffe geht auf kürzestem Weg ins Ziel, der Abzug wird erst beim Ankommen gedrückt.",
      layout: layout({ targets: [paper(200, 110, "T1")], shooterPositions: [shooter(200, 430)] })
    },
    {
      id: "std-draw-surrender",
      title: "Ziehen aus erhobenen Händen",
      category: "Ziehen",
      difficulty: "Anfänger",
      equipment: ["Holster", "Shot-Timer"],
      rounds: 2,
      distance: "7 m",
      parTime: "2,0 s",
      procedure: "Startposition wie oft im Match: Handgelenke über den Schultern. Auf das Signal ziehen und zwei Schuss in die A-Zone.",
      focus: "Beide Hände bewegen sich gleichzeitig: Schusshand zum Holster, Unterstützungshand direkt vor die Brust zum Griff.",
      layout: layout({ targets: [paper(200, 110, "T1")], shooterPositions: [shooter(200, 430)] })
    },
    {
      id: "std-bill-drill",
      title: "Bill Drill",
      category: "Ziehen",
      difficulty: "Fortgeschritten",
      equipment: ["Holster", "Shot-Timer"],
      rounds: 6,
      distance: "7 m",
      parTime: "2,5 s",
      procedure: "Aus dem Holster sechs Schuss so schnell wie kontrollierbar auf ein Ziel. Wertung: Zeit und Anzahl der A-Treffer.",
      focus: "Rückstoßkontrolle. Visier oder Rotpunkt zwischen den Schüssen beobachten und das Tempo so wählen, dass alle Treffer in der A-Zone bleiben.",
      layout: layout({ targets: [paper(200, 110, "T1")], shooterPositions: [shooter(200, 430)] })
    },

    // ---------- Grundlagen ----------
    {
      id: "std-doubles",
      title: "Doubles",
      category: "Grundlagen",
      difficulty: "Anfänger",
      equipment: ["Holster", "Shot-Timer"],
      rounds: 2,
      distance: "7 m",
      parTime: "1,8 s",
      procedure: "Aus dem Holster zwei schnelle Schüsse auf ein Ziel. Mehrere Durchgänge hintereinander und die Treffer nach jedem Durchgang notieren.",
      focus: "Gleichmäßiger Griffdruck, damit der zweite Schuss ohne Nachkorrektur in der A-Zone landet.",
      layout: layout({ targets: [paper(200, 110, "T1")], shooterPositions: [shooter(200, 430)] })
    },
    {
      id: "std-precision-distance",
      title: "Präzision auf Distanz",
      category: "Grundlagen",
      difficulty: "Anfänger",
      equipment: ["Shot-Timer"],
      rounds: 5,
      distance: "20 m",
      parTime: "10 s",
      procedure: "Waffe beidhändig nach unten gerichtet (Low Ready). Auf das Signal fünf gezielte Schuss in die A-Zone.",
      focus: "Sauberer Abzug ohne Verreißen. Lieber etwas langsamer und dafür alle Treffer in der A-Zone.",
      layout: layout({ targets: [paper(200, 90, "T1")], shooterPositions: [shooter(200, 450)] })
    },

    // ---------- Magazinwechsel ----------
    {
      id: "std-shot-reload-shot",
      title: "Schuss – Wechsel – Schuss",
      category: "Magazinwechsel",
      difficulty: "Anfänger",
      equipment: ["Holster", "Magazintaschen", "Shot-Timer"],
      rounds: 2,
      distance: "7 m",
      parTime: "3,0 s",
      procedure: "Aus dem Holster ein Schuss, Magazin wechseln, noch ein Schuss. Im ersten Magazin reicht eine Patrone.",
      focus: "Der Blick bleibt beim Wechsel am Ziel, das neue Magazin kommt der Waffe entgegen. Finger außerhalb des Abzugsbügels.",
      layout: layout({ targets: [paper(200, 110, "T1")], shooterPositions: [shooter(200, 430)] })
    },
    {
      id: "std-dryfire-reload",
      title: "Trockentraining: Magazinwechsel",
      category: "Magazinwechsel",
      difficulty: "Anfänger",
      equipment: ["Trockentraining", "Holster", "Magazintaschen"],
      rounds: null,
      distance: "3 m",
      parTime: "1,5 s",
      procedure: "Nur ohne Munition im Raum und mit leeren Magazinen. Waffe im Anschlag auf ein verkleinertes Ziel. Auf das Signal Magazin auswerfen, neues Magazin aus der Tasche einführen und wieder sauber ins Ziel kommen.",
      focus: "Wenig Bewegung mit der Waffe, sie bleibt vor dem Körper im Blickfeld. Das Magazin ohne Nachsetzen einführen.",
      layout: layout({ targets: [paper(200, 180, "T1")], shooterPositions: [shooter(200, 430)] })
    },

    // ---------- Zielwechsel ----------
    {
      id: "std-el-presidente",
      title: "El Presidente",
      category: "Zielwechsel",
      difficulty: "Fortgeschritten",
      equipment: ["Holster", "Magazintaschen", "Shot-Timer"],
      rounds: 12,
      distance: "10 m",
      parTime: "10 s",
      courseType: "Short Course",
      procedure: "Drei Ziele nebeneinander mit etwa 1 m Abstand. Rücken zu den Zielen, Hände über den Schultern. Auf das Signal umdrehen, ziehen, je zwei Schuss auf jedes Ziel, Magazinwechsel, noch einmal je zwei Schuss. Wertung nach Hit Factor.",
      focus: "Beim Umdrehen erst ziehen, wenn der Körper zu den Zielen zeigt, und die Mündung nie über den Sicherheitswinkel schwenken. Zielwechsel mit den Augen zuerst, die Waffe folgt.",
      layout: layout({
        targets: [paper(130, 110, "T1"), paper(200, 110, "T2"), paper(270, 110, "T3")],
        shooterPositions: [shooter(200, 430, "Start", 180)]
      })
    },
    {
      id: "std-wide-transitions",
      title: "Weite Zielwechsel",
      category: "Zielwechsel",
      difficulty: "Anfänger",
      equipment: ["Holster", "Shot-Timer"],
      rounds: 4,
      distance: "7 m",
      parTime: "2,5 s",
      procedure: "Zwei Ziele etwa 5 m auseinander. Aus dem Holster je zwei Schuss, beim nächsten Durchgang in umgekehrter Reihenfolge.",
      focus: "Die Augen springen zuerst zum nächsten Ziel. Die Waffe bremst kurz vor dem Ziel ab, statt darüber hinauszuschwingen.",
      layout: layout({
        targets: [paper(70, 110, "T1"), paper(330, 110, "T2")],
        shooterPositions: [shooter(200, 430)]
      })
    },
    {
      id: "std-distance-changes",
      title: "Distanzwechsel",
      category: "Zielwechsel",
      difficulty: "Fortgeschritten",
      equipment: ["Holster", "Shot-Timer"],
      rounds: 6,
      distance: "5 / 10 / 15 m",
      parTime: "4,0 s",
      procedure: "Drei Ziele auf 5, 10 und 15 m. Aus dem Holster je zwei Schuss vom nächsten zum entferntesten Ziel.",
      focus: "Tempo an die Distanz anpassen: nah zügig mit grobem Visierbild, weit sauber mit ruhigem Abzug.",
      layout: layout({
        targets: [paper(90, 330, "T1 (5 m)"), paper(200, 220, "T2 (10 m)"), paper(310, 110, "T3 (15 m)")],
        shooterPositions: [shooter(200, 450)]
      })
    },
    {
      id: "std-partial-targets",
      title: "Teilverdeckte Ziele",
      category: "Zielwechsel",
      difficulty: "Fortgeschritten",
      equipment: ["Holster", "Shot-Timer"],
      rounds: 4,
      distance: "7 m",
      parTime: "3,0 s",
      procedure: "Zwei Ziele, die jeweils teilweise von einem No-Shoot verdeckt sind. Aus dem Holster je zwei Schuss auf die sichtbaren Trefferzonen.",
      focus: "Genau zielen trotz Zeitdruck. Ein Treffer im No-Shoot kostet 10 Punkte, also das Tempo lieber leicht zurücknehmen.",
      layout: layout({
        targets: [paper(120, 130, "T1"), noshoot(148, 100, "NS1"), paper(280, 130, "T2"), noshoot(252, 100, "NS2")],
        shooterPositions: [shooter(200, 430)]
      })
    },
    {
      id: "std-plates",
      title: "Stahl: sechs Plates",
      category: "Zielwechsel",
      difficulty: "Fortgeschritten",
      equipment: ["Holster", "Stahlziele", "Shot-Timer"],
      rounds: 6,
      distance: "10 m",
      parTime: "5,0 s",
      procedure: "Sechs Plates in einer Reihe. Aus dem Holster jede Plate mit einem Schuss von links nach rechts, beim nächsten Durchgang umgekehrt. Getroffene Plates als Alpha, stehen gebliebene als Miss eintragen.",
      focus: "Rhythmus finden: auf jeder Plate kurz bestätigen, dann weiter. Ein Nachschuss ist schneller als ein hektischer Fehlschuss.",
      layout: layout({
        targets: [plate(100, 110, "S1"), plate(140, 110, "S2"), plate(180, 110, "S3"), plate(220, 110, "S4"), plate(260, 110, "S5"), plate(300, 110, "S6")],
        shooterPositions: [shooter(200, 430)]
      })
    },
    {
      id: "std-popper-paper",
      title: "Popper und Papier",
      category: "Zielwechsel",
      difficulty: "Anfänger",
      equipment: ["Holster", "Stahlziele", "Shot-Timer"],
      rounds: 5,
      distance: "10 m",
      parTime: "4,0 s",
      procedure: "Ein Popper in der Mitte, links und rechts je ein Papierziel. Aus dem Holster zwei Schuss auf T1, den Popper mit einem Schuss, zwei Schuss auf T2. Den gefallenen Popper als Alpha eintragen.",
      focus: "Wechsel zwischen schnellen Papier-Doubles und einem sauberen Einzelschuss auf Stahl.",
      layout: layout({
        targets: [paper(110, 110, "T1"), popper(200, 110, "P1"), paper(290, 110, "T2")],
        shooterPositions: [shooter(200, 430)]
      })
    },

    // ---------- Bewegung ----------
    {
      id: "std-box-to-box",
      title: "Positionswechsel Box zu Box",
      category: "Bewegung",
      difficulty: "Fortgeschritten",
      equipment: ["Holster", "Shot-Timer", "Pylonen/Boxen"],
      rounds: 8,
      distance: "7–10 m",
      parTime: "7,0 s",
      courseType: "Short Course",
      procedure: "Zwei Schützenboxen etwa 5 m auseinander. Start in Box A: je zwei Schuss auf T1 und T2. Seitlich zu Box B laufen, dort je zwei Schuss auf T3 und T4.",
      focus: "Schnell aus der Position heraus- und kontrolliert hineinkommen. Beim Laufen Finger außerhalb des Abzugsbügels, die Mündung zeigt Richtung Kugelfang.",
      layout: layout({
        targets: [paper(70, 110, "T1"), paper(145, 110, "T2"), paper(255, 110, "T3"), paper(330, 110, "T4")],
        boxes: [{ x: 60, y: 380, w: 60, h: 60, label: "Box A" }, { x: 280, y: 380, w: 60, h: 60, label: "Box B" }],
        shooterPositions: [shooter(90, 410), shooter(310, 410, "Position 2")],
        path: [[120, 410], [280, 410]]
      })
    },
    {
      id: "std-shooting-on-move",
      title: "Schießen in Bewegung",
      category: "Bewegung",
      difficulty: "Fortgeschritten",
      equipment: ["Holster", "Shot-Timer"],
      rounds: 6,
      distance: "7 m",
      parTime: "5,0 s",
      procedure: "Drei Ziele nebeneinander, Start am linken Ende der Laufstrecke. Auf das Signal ziehen, parallel zu den Zielen gehen und im Gehen je zwei Schuss auf jedes Ziel abgeben.",
      focus: "Weiche Schritte mit leicht gebeugten Knien, damit das Visierbild ruhig bleibt. Zuerst langsam gehen und erst schneller werden, wenn die Treffer sitzen.",
      layout: layout({
        targets: [paper(120, 110, "T1"), paper(200, 110, "T2"), paper(280, 110, "T3")],
        shooterPositions: [shooter(80, 420)],
        path: [[80, 420], [320, 420]]
      })
    },
    {
      id: "std-barricade",
      title: "Barrikade links und rechts",
      category: "Bewegung",
      difficulty: "Fortgeschritten",
      equipment: ["Holster", "Shot-Timer", "Barrikade"],
      rounds: 4,
      distance: "10 m",
      parTime: "4,0 s",
      procedure: "Hinter einer Wand stehen, die die direkte Sicht auf die Ziele verdeckt. T1 ist nur links an der Wand vorbei sichtbar, T2 nur rechts. Aus dem Holster je zwei Schuss.",
      focus: "Aus der Hüfte neigen statt mit den Füßen umzusetzen. Die Waffe bleibt frei von der Wand, damit der Schlitten nicht anschlägt.",
      layout: layout({
        targets: [paper(100, 110, "T1"), paper(300, 110, "T2")],
        walls: [{ x1: 150, y1: 360, x2: 250, y2: 360 }],
        shooterPositions: [shooter(200, 420)]
      })
    },

    // ---------- Starke / schwache Hand ----------
    {
      id: "std-strong-hand",
      title: "Nur Schusshand",
      category: "Starke/schwache Hand",
      difficulty: "Fortgeschritten",
      equipment: ["Shot-Timer"],
      rounds: 4,
      distance: "5 m",
      parTime: "4,0 s",
      procedure: "Waffe in der Schusshand im Low Ready, die andere Hand an der Brust. Auf das Signal je zwei Schuss auf zwei Ziele, nur mit der Schusshand.",
      focus: "Fester Griff und eine leicht nach innen gedrehte Waffe helfen, den Rückstoß mit einer Hand zu kontrollieren.",
      layout: layout({
        targets: [paper(150, 170, "T1"), paper(250, 170, "T2")],
        shooterPositions: [shooter(200, 430)]
      })
    },
    {
      id: "std-weak-hand",
      title: "Nur schwache Hand",
      category: "Starke/schwache Hand",
      difficulty: "Profi",
      equipment: ["Shot-Timer"],
      rounds: 4,
      distance: "5 m",
      parTime: "5,0 s",
      procedure: "Die Waffe ist bereits in der schwachen Hand im Low Ready. Auf das Signal je zwei Schuss auf zwei Ziele, nur mit der schwachen Hand.",
      focus: "Den Abzug langsam und gleichmäßig durchdrücken. Mit der ungewohnten Hand lieber auf sichere Treffer gehen.",
      layout: layout({
        targets: [paper(150, 170, "T1"), paper(250, 170, "T2")],
        shooterPositions: [shooter(200, 430)]
      })
    },

    // ---------- Startpositionen ----------
    {
      id: "std-table-start",
      title: "Start: Waffe auf dem Tisch",
      category: "Startpositionen",
      difficulty: "Fortgeschritten",
      equipment: ["Shot-Timer", "Tisch"],
      rounds: 4,
      distance: "7 m",
      parTime: "5,0 s",
      procedure: "Waffe entladen auf dem Tisch, Mündung Richtung Kugelfang, Magazin daneben. Hände seitlich am Körper. Auf das Signal Waffe aufnehmen, laden und je zwei Schuss auf T1 und T2.",
      focus: "Die Waffe gleich mit festem Schießgriff aufnehmen, damit nicht nachgegriffen werden muss. Die Mündung zeigt beim Laden immer Richtung Kugelfang.",
      layout: layout({
        targets: [paper(150, 110, "T1"), paper(250, 110, "T2")],
        props: [{ type: "tisch", x: 200, y: 380, label: "Tisch" }],
        shooterPositions: [shooter(200, 440)]
      })
    }
  ];
})();
