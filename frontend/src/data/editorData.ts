export type BlockType = 'heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition' | 'shot';

export interface ScriptBlock {
  id: string;
  type: BlockType;
  text: string;
}

export interface Script {
  sceneId: number;
  blocks: ScriptBlock[];
}

export interface Author {
  id: string;
  initials: string;
  color: string;
  name: string;
}

export interface Version {
  id: string;
  sceneId: number;
  label: string;
  tag?: string;
  authorId: string;
  time: string;
  diffPlus?: number;
  diffMinus?: number;
  milestone?: boolean;
}

export interface Comment {
  id: string;
  sceneId: number;
  authorId: string;
  time: string;
  quote?: string;
  text: string;
}

export interface Lock {
  sceneId: number;
  userId: string;
  since: string;
  contract?: boolean;
}

export const AUTHORS: Record<string, Author> = {
  JD: { id: 'JD', initials: 'JD', color: '#007AFF', name: 'Jan Diepers' },
  AK: { id: 'AK', initials: 'AK', color: '#FF9500', name: 'Anna König' },
  MS: { id: 'MS', initials: 'MS', color: '#00C853', name: 'Maria Schulz' },
  TW: { id: 'TW', initials: 'TW', color: '#FF3B30', name: 'Thomas Weber' },
  SP: { id: 'SP', initials: 'SP', color: '#AF52DE', name: 'Sandra Petersen' },
};

export const SCRIPTS: Record<number, Script> = {
  7: {
    sceneId: 7,
    blocks: [
      { id: 'b1',  type: 'heading',       text: 'INT. SCHLAFZIMMER WOLFSBERG – NACHT' },
      { id: 'b2',  type: 'action',        text: 'Das Zimmer liegt im Dunkeln. EVA (38) liegt im Bett, starrt an die Decke. Neben ihr schläft JONAS (41), gleichmäßig atmend.' },
      { id: 'b3',  type: 'action',        text: 'Eva dreht sich um. Einmal. Zweimal. Seufzt leise.' },
      { id: 'b4',  type: 'action',        text: 'Sie steht auf, schleicht aus dem Zimmer. Jonas öffnet kurz die Augen.' },
      { id: 'b5',  type: 'heading',       text: 'INT. KÜCHE WOLFSBERG – MOMENTS LATER' },
      { id: 'b6',  type: 'action',        text: 'Eva steht am Fenster, hält ein Glas Wasser. Mondlicht fällt ins Zimmer.' },
      { id: 'b7',  type: 'action',        text: 'Jonas erscheint in der Türöffnung.' },
      { id: 'b8',  type: 'character',     text: 'JONAS' },
      { id: 'b9',  type: 'dialogue',      text: 'Wieder nicht schlafen können?' },
      { id: 'b10', type: 'character',     text: 'EVA' },
      { id: 'b11', type: 'dialogue',      text: 'Tut mir leid. Hab ich dich geweckt?' },
      { id: 'b12', type: 'character',     text: 'JONAS' },
      { id: 'b13', type: 'parenthetical', text: '(tritt näher, sanft)' },
      { id: 'b14', type: 'dialogue',      text: 'Du weckst mich schon seit drei Wochen. Ich warte nur immer auf dich.' },
      { id: 'b15', type: 'action',        text: 'Eva sieht ihn an. Etwas in ihr bricht auf.' },
      { id: 'b16', type: 'character',     text: 'EVA' },
      { id: 'b17', type: 'dialogue',      text: 'Jonas... ich glaube, wir müssen reden.' },
      { id: 'b18', type: 'action',        text: 'Stille. Nur das leise Ticken der Küchenuhr.' },
      { id: 'b19', type: 'character',     text: 'JONAS' },
      { id: 'b20', type: 'parenthetical', text: '(setzt sich, zeigt auf den Stuhl)' },
      { id: 'b21', type: 'dialogue',      text: 'Ich weiß. Ich hab schon gewartet. Erzähl mir alles.' },
      { id: 'b22', type: 'action',        text: 'Eva setzt sich. Atmet tief ein. Beginnt zu sprechen.' },
      { id: 'b23', type: 'transition',    text: 'SCHNITT AUF:' },
    ],
  },
};

export const VERSIONS: Record<number, Version[]> = {
  7: [
    {
      id: 'v4',
      sceneId: 7,
      label: 'v4',
      tag: 'Aktuell',
      authorId: 'JD',
      time: 'Heute, 14:32',
      diffPlus: 14,
      diffMinus: 3,
    },
    {
      id: 'v3',
      sceneId: 7,
      label: 'v3',
      tag: 'Milestone',
      authorId: 'AK',
      time: 'Gestern, 18:07',
      diffPlus: 8,
      diffMinus: 12,
      milestone: true,
    },
    {
      id: 'v2',
      sceneId: 7,
      label: 'v2',
      authorId: 'MS',
      time: 'Mo, 11:44',
      diffPlus: 22,
      diffMinus: 0,
    },
    {
      id: 'v1',
      sceneId: 7,
      label: 'v1',
      tag: 'Erstfassung',
      authorId: 'JD',
      time: 'Fr, 09:15',
      diffPlus: 0,
      diffMinus: 0,
    },
  ],
};

export const COMMENTS: Record<number, Comment[]> = {
  7: [
    {
      id: 'c1',
      sceneId: 7,
      authorId: 'AK',
      time: 'Gestern, 19:12',
      quote: '„Ich weiß. Ich hab schon gewartet."',
      text: 'Der Dialog funktioniert gut, aber vielleicht ist Jonas hier zu verständnisvoll? Ein kleiner Widerstand würde die Szene spannen.',
    },
    {
      id: 'c2',
      sceneId: 7,
      authorId: 'TW',
      time: 'Heute, 09:03',
      quote: '„Das Zimmer liegt im Dunkeln."',
      text: 'Können wir die Regie-Anweisung präzisieren? Was genau sehen wir, bevor das Mondlicht kommt?',
    },
    {
      id: 'c3',
      sceneId: 7,
      authorId: 'JD',
      time: 'Heute, 14:30',
      text: 'Habe das Mondlicht weiter nach vorne gezogen. Sollte den Übergang klarer machen.',
    },
  ],
};

export const LOCKS: Lock[] = [
  { sceneId: 7,  userId: 'JD', since: '2 Std.',  contract: false },
  { sceneId: 3,  userId: 'AK', since: '45 Min.', contract: false },
  { sceneId: 2,  userId: 'MS', since: '1 Std.',  contract: true  },
  { sceneId: 12, userId: 'TW', since: '20 Min.', contract: true  },
];
